-- ============================================================
-- PRUEBA 02 — Menor de edad y representante (migraciones 026 + 027)
-- ============================================================
-- Termina en ROLLBACK: no deja nada en la base.
-- Recorre el camino entero que hará un adolescente de verdad:
--   1. se registra con los datos de su representante → nace 'pending'
--      y queda un correo en la bandeja con el enlace;
--   2. intenta inscribirse → la base lo frena con el mensaje amable;
--   3. el representante abre el enlace (sin sesión, como anon) → 'pendiente';
--   4. autoriza → 'granted';
--   5. vuelve a inscribirse → ahora sí, y el representante recibe aviso;
--   6. el mismo enlace abierto otra vez → 'ya_autorizado';
--   7. registrarse sin los datos del representante → rechazado.

begin;
set local statement_timeout = '20s';

do $t$
declare
  v_user  uuid := gen_random_uuid();
  v_mail  text := 'prueba.menor.' || v_user || '@example.invalid';
  v_ciclo uuid;
  v_tok   text;
  v_req   jsonb;
  v_msg   text;
  v_n     int;
begin
  -- Ciclo abierto que empieza mañana.
  insert into course_cycles (name, status, registration_start, registration_end, location_name)
  values ('PRUEBA ciclo menor', 'registration_open', now() - interval '1 day', now() + interval '10 days', 'Prueba')
  returning id into v_ciclo;
  insert into course_sessions (cycle_id, step_number, name, session_date)
  values (v_ciclo, 1, 'Paso 1', current_date + 1), (v_ciclo, 2, 'Paso 2', current_date + 8),
         (v_ciclo, 3, 'Paso 3', current_date + 15), (v_ciclo, 4, 'Paso 4', current_date + 22);

  -- 1) Registro del menor: mismo camino que la app (auth.users → handle_new_user).
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (v_user, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', v_mail, '',
          now(), '{"provider":"email","providers":["email"]}'::jsonb,
          jsonb_build_object(
            'first_name', 'Prueba', 'last_name', 'Menor', 'phone', '4070000000',
            'birth_date', to_char(current_date - interval '15 years', 'YYYY-MM-DD'),
            'privacy_consent', true, 'guardian_consent', true,
            'guardian_first_name', 'Madre', 'guardian_last_name', 'Prueba',
            'guardian_email', 'madre.' || v_user || '@example.invalid', 'guardian_phone', '4071111111'),
          now(), now());

  if (select guardian_authorization_status from profiles where id = v_user) <> 'pending' then
    raise exception 'PRUEBA FALLIDA: el menor no nació en pending';
  end if;
  select token into v_tok from guardian_authorizations where user_id = v_user and used_at is null and not revoked;
  if v_tok is null then raise exception 'PRUEBA FALLIDA: no se emitió el enlace del representante'; end if;
  if not exists (select 1 from notification_outbox where subject_user_id = v_user and kind = 'guardian_authorization_request') then
    raise exception 'PRUEBA FALLIDA: el correo de autorización no quedó en la bandeja';
  end if;
  raise notice 'OK 1/7 — menor en pending, enlace emitido y correo en bandeja';

  -- 2) Inscribirse estando pending: la base lo frena.
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform enroll_in_cycle(v_ciclo);
    raise exception 'PRUEBA FALLIDA: el menor sin autorización pudo inscribirse';
  exception when others then
    v_msg := sqlerrm;
    if v_msg like 'PRUEBA FALLIDA%' then raise; end if;
    if position('representante' in v_msg) = 0 then
      raise exception 'PRUEBA FALLIDA: lo frenó, pero con otro mensaje: %', v_msg;
    end if;
    raise notice 'OK 2/7 — inscripción frenada: %', v_msg;
  end;

  -- 3) El representante abre el enlace sin cuenta (anon).
  reset role;
  perform set_config('request.jwt.claims', '', true);
  set local role anon;
  v_req := get_guardian_request(v_tok);
  if v_req->>'estado' <> 'pendiente' then
    raise exception 'PRUEBA FALLIDA: el enlace nuevo no dice pendiente: %', v_req;
  end if;
  raise notice 'OK 3/7 — enlace abierto por anon: pendiente';

  -- 4) Autoriza.
  perform grant_guardian_authorization(v_tok, true);
  reset role;
  if (select guardian_authorization_status from profiles where id = v_user) <> 'granted' then
    raise exception 'PRUEBA FALLIDA: la autorización no dejó el perfil en granted';
  end if;
  raise notice 'OK 4/7 — perfil en granted';

  -- 5) Ahora sí se inscribe, y el representante recibe aviso.
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform enroll_in_cycle(v_ciclo);
  reset role;
  if not exists (select 1 from enrollments where user_id = v_user and cycle_id = v_ciclo) then
    raise exception 'PRUEBA FALLIDA: autorizado y aun así no se inscribió';
  end if;
  select count(*) into v_n from notification_outbox where subject_user_id = v_user and kind <> 'guardian_authorization_request';
  if v_n = 0 then raise exception 'PRUEBA FALLIDA: la inscripción no avisó al representante'; end if;
  raise notice 'OK 5/7 — inscrito y representante avisado (% aviso/s)', v_n;

  -- 6) El mismo enlace, otra vez.
  set local role anon;
  v_req := get_guardian_request(v_tok);
  reset role;
  if v_req->>'estado' <> 'ya_autorizado' then
    raise exception 'PRUEBA FALLIDA: el enlace usado no dice ya_autorizado: %', v_req;
  end if;
  raise notice 'OK 6/7 — enlace reutilizado: ya_autorizado';

  -- 7) Menor SIN datos del representante: no se le deja crear la cuenta.
  begin
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                            email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'prueba.sinrep.' || gen_random_uuid() || '@example.invalid', '', now(),
            '{"provider":"email","providers":["email"]}'::jsonb,
            jsonb_build_object('first_name', 'Sin', 'last_name', 'Representante', 'phone', '4070000001',
              'birth_date', to_char(current_date - interval '15 years', 'YYYY-MM-DD'), 'privacy_consent', true),
            now(), now());
    raise exception 'PRUEBA FALLIDA: un menor sin representante pudo registrarse';
  exception when others then
    v_msg := sqlerrm;
    if v_msg like 'PRUEBA FALLIDA%' then raise; end if;
    if position('representante' in v_msg) = 0 then
      raise exception 'PRUEBA FALLIDA: lo frenó, pero con otro mensaje: %', v_msg;
    end if;
    raise notice 'OK 7/7 — sin representante, rechazado: %', v_msg;
  end;
end $t$;

rollback;
