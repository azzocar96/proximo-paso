-- ============================================================
-- PRUEBA 01 — Inscripción tardía (migración 025)
-- ============================================================
-- Termina en ROLLBACK: no deja nada en la base.
-- Crea una persona y un ciclo de mentira cuya primera clase fue AYER, e
-- intenta inscribirla. Debe fallar con el mensaje "ya empezó". Después crea
-- un ciclo que empieza MAÑANA y la inscripción debe pasar.

begin;
set local statement_timeout = '20s';

do $t$
declare
  v_user  uuid := gen_random_uuid();
  v_tarde uuid;
  v_ok    uuid;
  v_msg   text;
begin
  -- Persona adulta creada por el camino real (auth.users → handle_new_user):
  -- profiles.id es clave foránea a auth.users, no se puede insertar directo.
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (v_user, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'prueba.tardia.' || v_user || '@example.invalid', '', now(),
          '{"provider":"email","providers":["email"]}'::jsonb,
          jsonb_build_object('first_name', 'Prueba', 'last_name', 'Tardía', 'phone', '4070000002',
            'birth_date', '1990-01-01', 'privacy_consent', true),
          now(), now());

  -- Ciclo que YA empezó: inscripciones formalmente abiertas, pero el Paso 1 fue ayer.
  insert into course_cycles (name, status, registration_start, registration_end, location_name)
  values ('PRUEBA ciclo tardío', 'registration_open', now() - interval '10 days', now() + interval '10 days', 'Prueba')
  returning id into v_tarde;
  insert into course_sessions (cycle_id, step_number, name, session_date)
  values (v_tarde, 1, 'Paso 1', current_date - 1), (v_tarde, 2, 'Paso 2', current_date + 6),
         (v_tarde, 3, 'Paso 3', current_date + 13), (v_tarde, 4, 'Paso 4', current_date + 20);

  -- Ciclo que empieza mañana: este sí debe aceptar.
  insert into course_cycles (name, status, registration_start, registration_end, location_name)
  values ('PRUEBA ciclo futuro', 'registration_open', now() - interval '10 days', now() + interval '10 days', 'Prueba')
  returning id into v_ok;
  insert into course_sessions (cycle_id, step_number, name, session_date)
  values (v_ok, 1, 'Paso 1', current_date + 1), (v_ok, 2, 'Paso 2', current_date + 8),
         (v_ok, 3, 'Paso 3', current_date + 15), (v_ok, 4, 'Paso 4', current_date + 22);

  -- Ahora somos esa persona.
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- 1) Ciclo tardío: tiene que fallar, y con el mensaje amable.
  begin
    perform enroll_in_cycle(v_tarde);
    raise exception 'PRUEBA FALLIDA: la inscripción tardía pasó sin queja (¿025 no aplicada?)';
  exception when others then
    v_msg := sqlerrm;
    if v_msg like 'PRUEBA FALLIDA%' then raise; end if;
    if position('ya empezó' in v_msg) = 0 then
      raise exception 'PRUEBA FALLIDA: falló, pero con otro mensaje: %', v_msg;
    end if;
    raise notice 'OK 1/2 — ciclo tardío rechazado: %', v_msg;
  end;

  -- 2) Ciclo futuro: debe inscribir.
  perform enroll_in_cycle(v_ok);
  if not exists (select 1 from enrollments where user_id = v_user and cycle_id = v_ok) then
    raise exception 'PRUEBA FALLIDA: el ciclo futuro no creó la inscripción';
  end if;
  raise notice 'OK 2/2 — ciclo futuro inscribe con normalidad';
end $t$;

rollback;
