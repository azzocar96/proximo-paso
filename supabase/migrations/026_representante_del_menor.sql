-- ============================================================
-- 026 — El representante del menor: datos, autorización y avisos
-- ============================================================
-- Regla nueva de Jesús (17-sep-2026): un menor de edad SÍ puede tener su
-- cuenta, pero para crearla tiene que dar el NOMBRE, el APELLIDO, el CORREO y
-- el TELÉFONO de su representante, y la cuenta **no sirve para nada** hasta que
-- ese representante autorice. Además, cada cosa importante que haga el menor
-- dentro de la app le llega como aviso al representante.
--
-- Lo que ya existía se queda corto a propósito: `guardian_name` y
-- `guardian_contact` eran dos campos de texto libre, sin forma de contactar de
-- verdad ni de comprobar nada. Se conservan (los llena esta misma migración
-- para no romper nada que los lea), pero la fuente de verdad pasan a ser los
-- cuatro campos nuevos.
--
-- === Cómo autoriza el representante ===
-- Se le crea un enlace de un solo uso. Ese enlace puede llegarle por correo
-- (cuando la iglesia tenga correo saliente propio) o **por WhatsApp**, que es
-- lo que hay hoy: el administrador lo copia del panel y se lo manda. El
-- representante lo abre SIN cuenta, ve quién le pide permiso y confirma.
-- Si no hay manera de contactarlo digitalmente, un administrador puede
-- autorizar a mano dejando constancia de por qué.
--
-- === Los avisos ===
-- Como todavía no hay correo saliente, TODO aviso se guarda en una bandeja de
-- salida (`notification_outbox`) en vez de perderse. El día que se conecte el
-- SMTP, lo pendiente se envía y no se habrá perdido nada. Mientras tanto el
-- administrador ve la bandeja en el panel.

-- ---------- 1. Los cuatro datos del representante + el estado ----------
alter table profiles
  add column if not exists guardian_first_name text,
  add column if not exists guardian_last_name  text,
  add column if not exists guardian_email      text,
  add column if not exists guardian_phone      text,
  add column if not exists guardian_authorization_status text not null default 'not_required',
  add column if not exists guardian_authorized_at timestamptz,
  add column if not exists guardian_authorized_via text,
  add column if not exists guardian_authorized_by uuid references profiles(id);

do $mig$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_guardian_status_chk') then
    alter table profiles add constraint profiles_guardian_status_chk
      check (guardian_authorization_status in ('not_required','pending','granted','revoked'));
  end if;
end $mig$;

comment on column profiles.guardian_authorization_status is
  'not_required = mayor de edad · pending = falta que el representante autorice · granted = autorizado · revoked = el representante retiró el permiso.';

create index if not exists idx_profiles_guardian_pend
  on profiles (guardian_authorization_status)
  where guardian_authorization_status in ('pending','revoked');

-- ---------- 2. Los enlaces de autorización ----------
create table if not exists guardian_authorizations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  token text not null unique,
  guardian_email text,
  guardian_phone text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',
  used_at timestamptz,
  used_ip text,
  revoked boolean not null default false
);
create index if not exists idx_guardian_auth_user on guardian_authorizations(user_id);

-- Nadie toca esta tabla desde el navegador. Se entra solo por las funciones de
-- abajo, que son las que deciden qué se puede ver y qué no.
alter table guardian_authorizations enable row level security;
revoke all on guardian_authorizations from anon, authenticated;

-- ---------- 3. La bandeja de salida de avisos ----------
create table if not exists notification_outbox (
  id uuid primary key default gen_random_uuid(),
  subject_user_id uuid references profiles(id) on delete set null,
  recipient_email text not null,
  recipient_name text,
  kind text not null,
  subject text not null,
  body text not null,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  attempts int not null default 0,
  last_error text
);
create index if not exists idx_outbox_pendientes on notification_outbox (created_at) where sent_at is null;

alter table notification_outbox enable row level security;
revoke all on notification_outbox from anon, authenticated;

-- ---------- 4. Cocina interna ----------
-- OJO (lección 7): gen_random_bytes vive en `extensions`, no en `public`.
create or replace function fn_guardian_new_token() returns text
language sql volatile security definer set search_path = public, extensions as $$
  select encode(gen_random_bytes(24), 'hex');
$$;
revoke execute on function fn_guardian_new_token() from public, anon, authenticated;

-- Encola un aviso. Nunca revienta la operación que lo llamó: si no hay a quién
-- escribirle, simplemente no encola. Un aviso perdido no puede costarle a
-- alguien su asistencia.
create or replace function fn_queue_notification(
  p_subject_user uuid, p_email text, p_name text,
  p_kind text, p_subject text, p_body text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_email is null or btrim(p_email) = '' then
    return;
  end if;
  insert into notification_outbox (subject_user_id, recipient_email, recipient_name, kind, subject, body)
  values (p_subject_user, lower(btrim(p_email)), p_name, p_kind, p_subject, p_body);
exception when others then
  return;
end $$;
revoke execute on function fn_queue_notification(uuid,text,text,text,text,text) from public, anon, authenticated;

-- ¿Esta persona tiene vía libre? Mayor de edad: siempre. Menor: solo si su
-- representante autorizó.
create or replace function fn_guardian_ok(p_user uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select guardian_authorization_status in ('not_required','granted')
       from profiles where id = p_user),
    true);
$$;
grant execute on function fn_guardian_ok(uuid) to authenticated;

-- ---------- 5. Crear (o rehacer) el enlace de autorización ----------
create or replace function fn_issue_guardian_link(p_user uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_tok text;
  v_p record;
  v_site text;
begin
  select * into v_p from profiles where id = p_user;
  if v_p is null then
    raise exception 'No encontramos a esa persona.' using errcode = 'P0001';
  end if;

  -- Un enlace vivo a la vez: los anteriores se anulan.
  update guardian_authorizations set revoked = true
   where user_id = p_user and used_at is null and not revoked;

  v_tok := fn_guardian_new_token();
  insert into guardian_authorizations (user_id, token, guardian_email, guardian_phone)
  values (p_user, v_tok, v_p.guardian_email, v_p.guardian_phone);

  select coalesce((select value #>> '{}' from app_settings where key = 'site_url'),
                  'https://proximo-paso.netlify.app')
    into v_site;

  perform fn_queue_notification(
    p_user, v_p.guardian_email,
    btrim(coalesce(v_p.guardian_first_name,'') || ' ' || coalesce(v_p.guardian_last_name,'')),
    'guardian_authorization_request',
    'Autoriza la cuenta de ' || coalesce(v_p.first_name,'') || ' en Próximo Paso',
    'Hola. ' || coalesce(v_p.first_name,'') || ' ' || coalesce(v_p.last_name,'') ||
    ' creó una cuenta en la app del curso Próximo Paso de Iglesia Global Orlando y nos dio sus datos como su representante.' ||
    chr(10) || chr(10) ||
    'Su cuenta está detenida hasta que usted lo autorice. Abra este enlace para ver de qué se trata y decidir:' ||
    chr(10) || v_site || '/autorizar/' || v_tok || chr(10) || chr(10) ||
    'Si usted no conoce a esta persona o no autoriza, no haga nada: la cuenta se queda sin acceso. ' ||
    'También puede escribirnos y la eliminamos.' || chr(10) || chr(10) ||
    'Iglesia Global Orlando · 735 Herndon Ave, Orlando, FL 32803'
  );

  return v_tok;
end $$;
revoke execute on function fn_issue_guardian_link(uuid) from public, anon, authenticated;

-- ---------- 6. Lo que ve el representante al abrir el enlace ----------
-- Sin cuenta y sin sesión. Devuelve lo mínimo para que sepa qué está
-- autorizando: nombre del menor, qué es el curso y qué datos se guardan.
-- NO devuelve correo, teléfono ni nada que sirva para suplantar a nadie.
create or replace function get_guardian_request(p_token text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v record;
begin
  select ga.*, p.first_name, p.last_name, p.guardian_first_name, p.guardian_authorization_status
    into v
    from guardian_authorizations ga
    join profiles p on p.id = ga.user_id
   where ga.token = p_token;

  if v is null then
    return jsonb_build_object('estado', 'no_existe');
  end if;
  if v.guardian_authorization_status = 'granted' then
    return jsonb_build_object('estado', 'ya_autorizado',
      'menor', v.first_name || ' ' || v.last_name);
  end if;
  if v.revoked or v.used_at is not null then
    return jsonb_build_object('estado', 'caducado');
  end if;
  if v.expires_at < now() then
    return jsonb_build_object('estado', 'caducado');
  end if;

  return jsonb_build_object(
    'estado', 'pendiente',
    'menor', v.first_name || ' ' || v.last_name,
    'representante', v.guardian_first_name,
    'expira', v.expires_at
  );
end $$;
revoke execute on function get_guardian_request(text) from public;
grant execute on function get_guardian_request(text) to anon, authenticated;

-- ---------- 7. El representante autoriza ----------
create or replace function grant_guardian_authorization(p_token text, p_confirma boolean)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v record;
  v_site text;
begin
  if not coalesce(p_confirma, false) then
    raise exception 'Hay que marcar la casilla para autorizar.' using errcode = 'P0001';
  end if;

  select ga.*, p.first_name, p.last_name, p.guardian_email, p.guardian_first_name
    into v
    from guardian_authorizations ga
    join profiles p on p.id = ga.user_id
   where ga.token = p_token
     and not ga.revoked and ga.used_at is null and ga.expires_at > now()
   for update;

  if v is null then
    raise exception 'Este enlace ya no sirve. Pídele a la iglesia uno nuevo.' using errcode = 'P0001';
  end if;

  update guardian_authorizations set used_at = now() where id = v.id;

  update profiles
     set guardian_authorization_status = 'granted',
         guardian_authorized_at = now(),
         guardian_authorized_via = 'enlace',
         guardian_consent = true,
         updated_at = now()
   where id = v.user_id;

  select coalesce((select value #>> '{}' from app_settings where key = 'site_url'),
                  'https://proximo-paso.netlify.app') into v_site;

  perform fn_queue_notification(
    v.user_id, v.guardian_email, v.guardian_first_name,
    'guardian_authorization_granted',
    'Listo: autorizaste la cuenta de ' || v.first_name,
    'Gracias. La cuenta de ' || v.first_name || ' ' || v.last_name || ' ya está activa en Próximo Paso.' ||
    chr(10) || chr(10) ||
    'A partir de ahora le avisaremos a este correo cuando pase algo importante: cuando se inscriba a un ciclo, ' ||
    'cada vez que se registre su asistencia a una clase, cuando reciba su certificado y si cambia su correo o su contraseña.' ||
    chr(10) || chr(10) ||
    'Si en algún momento quiere retirar este permiso, escríbanos y lo hacemos de inmediato.' ||
    chr(10) || 'Iglesia Global Orlando · 735 Herndon Ave, Orlando, FL 32803'
  );

  return jsonb_build_object('ok', true, 'menor', v.first_name || ' ' || v.last_name);
end $$;
revoke execute on function grant_guardian_authorization(text, boolean) from public;
grant execute on function grant_guardian_authorization(text, boolean) to anon, authenticated;

-- ---------- 8. El administrador: autorizar a mano, revocar y ver pendientes ----------
-- Mientras no haya correo saliente, esto es lo que hace que el flujo funcione
-- de verdad: el administrador copia el enlace y se lo manda al representante
-- por WhatsApp, o —si habló con él por teléfono— autoriza a mano dejando
-- constancia de con quién habló.
create or replace function admin_grant_guardian_authorization(p_user uuid, p_motivo text)
returns void
language plpgsql security definer set search_path = public as $$
declare v record;
begin
  if not fn_is_admin() then
    raise exception 'No autorizado' using errcode = 'P0001';
  end if;
  if coalesce(btrim(p_motivo),'') = '' then
    raise exception 'Escribe con quién hablaste y cómo confirmaste el permiso.' using errcode = 'P0001';
  end if;

  select * into v from profiles where id = p_user;
  if v is null then
    raise exception 'No encontramos a esa persona.' using errcode = 'P0001';
  end if;
  if v.guardian_authorization_status = 'not_required' then
    raise exception 'Esa persona es mayor de edad: no necesita autorización.' using errcode = 'P0001';
  end if;

  update guardian_authorizations set revoked = true
   where user_id = p_user and used_at is null and not revoked;

  update profiles
     set guardian_authorization_status = 'granted',
         guardian_authorized_at = now(),
         guardian_authorized_via = 'administrador',
         guardian_authorized_by = auth.uid(),
         guardian_consent = true,
         updated_at = now()
   where id = p_user;

  perform fn_audit('profiles', 'guardian_authorization_granted_by_admin', p_user, p_motivo, null::jsonb);
end $$;
revoke execute on function admin_grant_guardian_authorization(uuid, text) from public, anon;
grant execute on function admin_grant_guardian_authorization(uuid, text) to authenticated;

create or replace function admin_revoke_guardian_authorization(p_user uuid, p_motivo text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not fn_is_admin() then
    raise exception 'No autorizado' using errcode = 'P0001';
  end if;
  if coalesce(btrim(p_motivo),'') = '' then
    raise exception 'Escribe por qué se retira el permiso.' using errcode = 'P0001';
  end if;

  update profiles
     set guardian_authorization_status = 'revoked',
         guardian_authorized_at = null,
         guardian_authorized_via = null,
         guardian_authorized_by = auth.uid(),
         guardian_consent = false,
         updated_at = now()
   where id = p_user and guardian_authorization_status <> 'not_required';

  update guardian_authorizations set revoked = true
   where user_id = p_user and used_at is null and not revoked;

  perform fn_audit('profiles', 'guardian_authorization_revoked', p_user, p_motivo, null::jsonb);
end $$;
revoke execute on function admin_revoke_guardian_authorization(uuid, text) from public, anon;
grant execute on function admin_revoke_guardian_authorization(uuid, text) to authenticated;

-- Rehace el enlace y lo devuelve, para copiarlo y mandarlo por WhatsApp.
create or replace function admin_guardian_link(p_user uuid)
returns text
language plpgsql security definer set search_path = public as $$
begin
  if not fn_is_admin() then
    raise exception 'No autorizado' using errcode = 'P0001';
  end if;
  perform fn_audit('profiles', 'guardian_link_reissued', p_user, null::text, null::jsonb);
  return fn_issue_guardian_link(p_user);
end $$;
revoke execute on function admin_guardian_link(uuid) from public, anon;
grant execute on function admin_guardian_link(uuid) to authenticated;

create or replace function get_guardian_pending()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not fn_is_admin() then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(to_jsonb(t) order by t.creado)
    from (
      select p.id,
             p.first_name || ' ' || p.last_name as menor,
             p.email,
             p.guardian_authorization_status as estado,
             btrim(coalesce(p.guardian_first_name,'') || ' ' || coalesce(p.guardian_last_name,'')) as representante,
             p.guardian_email, p.guardian_phone,
             p.created_at as creado,
             (select ga.token from guardian_authorizations ga
               where ga.user_id = p.id and not ga.revoked and ga.used_at is null and ga.expires_at > now()
               order by ga.created_at desc limit 1) as token
        from profiles p
       where p.guardian_authorization_status in ('pending','revoked')
    ) t
  ), '[]'::jsonb);
end $$;
revoke execute on function get_guardian_pending() from public, anon;
grant execute on function get_guardian_pending() to authenticated;

-- La bandeja de salida, para que el administrador vea qué avisos hay esperando
-- a que exista el correo saliente.
create or replace function get_notification_outbox(p_solo_pendientes boolean default true)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not fn_is_admin() then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(to_jsonb(t) order by t.created_at desc)
    from (
      select id, recipient_email, recipient_name, kind, subject, body, created_at, sent_at, last_error
        from notification_outbox
       where (not p_solo_pendientes) or sent_at is null
       order by created_at desc
       limit 200
    ) t
  ), '[]'::jsonb);
end $$;
revoke execute on function get_notification_outbox(boolean) from public, anon;
grant execute on function get_notification_outbox(boolean) to authenticated;

-- ---------- 9. El aviso de cada momento importante ----------
-- Se llama desde dentro de las funciones que ya existen. Si la persona es
-- mayor de edad o no tiene representante, no hace nada.
create or replace function fn_notify_guardian(p_user uuid, p_kind text, p_titulo text, p_detalle text)
returns void
language plpgsql security definer set search_path = public as $$
declare v record;
begin
  select first_name, last_name, guardian_email, guardian_first_name, guardian_authorization_status
    into v from profiles where id = p_user;
  if v is null or v.guardian_authorization_status = 'not_required' then
    return;
  end if;
  perform fn_queue_notification(
    p_user, v.guardian_email, v.guardian_first_name, p_kind,
    p_titulo || ' · ' || v.first_name || ' ' || v.last_name,
    'Le escribimos porque usted es el representante de ' || v.first_name || ' ' || v.last_name ||
    ' en el curso Próximo Paso.' || chr(10) || chr(10) || p_detalle || chr(10) || chr(10) ||
    'Si algo de esto no le cuadra, respóndanos a este correo o escríbanos a proximopasogm@gmail.com.' ||
    chr(10) || 'Iglesia Global Orlando · 735 Herndon Ave, Orlando, FL 32803'
  );
end $$;
revoke execute on function fn_notify_guardian(uuid,text,text,text) from public, anon;
grant execute on function fn_notify_guardian(uuid,text,text,text) to authenticated;

-- ---------- 10. El alta de cuenta exige los cuatro datos del representante ----------
-- Se reescribe `handle_new_user` entero, pero NO a ciegas: primero se comprueba
-- que la que hay en producción es la que creemos (la de la 017). Si alguien la
-- tocó por otro lado, esta migración falla en vez de pisarle el trabajo.
do $mig$
declare
  def text;
begin
  def := pg_get_functiondef('handle_new_user()'::regprocedure);
  if position('guardian_email' in def) > 0 then
    return;  -- ya aplicada
  end if;
  -- En producción esta función se aplicó en agosto desde una copia SIN acentos
  -- ("autorizacion"), así que el ancla se compara sin la parte acentuada.
  if position('Falta el nombre, el contacto o la autoriz' in def) = 0 then
    raise exception '026: handle_new_user no es la versión que esperaba (la de la 017). Revísala a mano antes de seguir.';
  end if;
end $mig$;

create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_birth date;
  v_pol jsonb := fn_registration_policy();
  v_min int := (v_pol->>'min_age')::int;
  v_allow boolean := (v_pol->>'allow_minors')::boolean;
  v_age int;
  v_gfirst text := nullif(btrim(coalesce(new.raw_user_meta_data->>'guardian_first_name','')),'');
  v_glast  text := nullif(btrim(coalesce(new.raw_user_meta_data->>'guardian_last_name','')),'');
  v_gemail text := lower(nullif(btrim(coalesce(new.raw_user_meta_data->>'guardian_email','')),''));
  v_gphone text := nullif(btrim(coalesce(new.raw_user_meta_data->>'guardian_phone','')),'');
  v_gconsent boolean;
  v_already boolean;
  v_menor boolean := false;
  v_mnote text := left(nullif(btrim(coalesce(new.raw_user_meta_data->>'member_note','')),''), 500);
begin
  begin
    v_gconsent := (new.raw_user_meta_data->>'guardian_consent')::boolean;
    v_already := coalesce((new.raw_user_meta_data->>'already_member')::boolean, false);
  exception when others then
    raise exception 'Hay una casilla con un valor que no entendemos. Vuelve a intentarlo desde el formulario.';
  end;

  begin
    v_birth := (nullif(new.raw_user_meta_data->>'birth_date',''))::date;
  exception when others then
    raise exception 'La fecha de nacimiento no es válida.';
  end;
  if v_birth is null then
    raise exception 'Falta la fecha de nacimiento.';
  end if;
  if v_birth > current_date then
    raise exception 'La fecha de nacimiento no puede estar en el futuro.';
  end if;
  if v_birth < current_date - interval '120 years' then
    raise exception 'Revisa la fecha de nacimiento.';
  end if;

  v_age := extract(year from age(current_date, v_birth))::int;
  if v_age < v_min then
    v_menor := true;
    if not v_allow then
      raise exception 'Para registrarse por cuenta propia hay que tener al menos % años.', v_min;
    end if;
    -- Los CUATRO datos, no uno. Sin ellos no hay a quién pedirle permiso ni a
    -- quién avisarle de nada, que es justo el punto de esta regla.
    if v_gfirst is null or v_glast is null or v_gemail is null or v_gphone is null then
      raise exception 'Faltan datos del representante: hacen falta su nombre, su apellido, su correo y su teléfono.';
    end if;
    if position('@' in v_gemail) = 0 or position('.' in split_part(v_gemail,'@',2)) = 0 then
      raise exception 'El correo del representante no parece válido.';
    end if;
    if length(regexp_replace(v_gphone, '[^0-9]', '', 'g')) < 7 then
      raise exception 'El teléfono del representante no parece válido.';
    end if;
    if coalesce(v_gconsent,false) = false then
      raise exception 'Falta marcar que tu representante autoriza tu participación.';
    end if;
    if v_gemail = lower(coalesce(new.email,'')) then
      raise exception 'El correo del representante tiene que ser distinto del tuyo.';
    end if;
  end if;

  insert into profiles (id, first_name, middle_name, last_name, email,
                        birth_date,
                        guardian_first_name, guardian_last_name, guardian_email, guardian_phone,
                        guardian_name, guardian_contact, guardian_consent,
                        guardian_authorization_status,
                        privacy_consent, privacy_consent_at,
                        active_member_requested_at, active_member_request_note)
  values (new.id,
          coalesce(new.raw_user_meta_data->>'first_name',''),
          nullif(new.raw_user_meta_data->>'middle_name',''),
          coalesce(new.raw_user_meta_data->>'last_name',''),
          new.email,
          v_birth,
          v_gfirst, v_glast, v_gemail, v_gphone,
          -- Los dos campos viejos se siguen llenando: hay pantallas y consultas
          -- que los leen y no tienen por qué enterarse de este cambio.
          nullif(btrim(coalesce(v_gfirst,'') || ' ' || coalesce(v_glast,'')),''),
          coalesce(v_gemail, v_gphone),
          v_gconsent,
          case when v_menor then 'pending' else 'not_required' end,
          coalesce((new.raw_user_meta_data->>'privacy_consent')::boolean,false),
          case when coalesce((new.raw_user_meta_data->>'privacy_consent')::boolean,false) then now() end,
          case when v_already then now() end,
          case when v_already then v_mnote end)
  on conflict (id) do nothing;

  insert into user_roles (user_id, role) values (new.id, 'participant')
  on conflict (user_id, role) do nothing;

  -- El enlace de autorización se crea aquí mismo, para que el representante
  -- tenga qué abrir desde el primer segundo. Si algo falla al crearlo, el alta
  -- NO se cae: la cuenta queda pendiente igual y el administrador puede
  -- regenerar el enlace desde el panel.
  if v_menor then
    begin
      perform fn_issue_guardian_link(new.id);
    exception when others then
      null;
    end;
  end if;

  return new;
end $$;

-- ---------- 11. Comprobación ----------
do $mig$
declare n int;
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='profiles' and column_name='guardian_email') then
    raise exception '026: faltan las columnas del representante';
  end if;
  if position('guardian_email' in pg_get_functiondef('handle_new_user()'::regprocedure)) = 0 then
    raise exception '026: handle_new_user no quedó actualizada';
  end if;
  if not has_function_privilege('anon', 'get_guardian_request(text)', 'execute') then
    raise exception '026: el representante no podría abrir su enlace sin cuenta';
  end if;
  if not has_function_privilege('anon', 'grant_guardian_authorization(text, boolean)', 'execute') then
    raise exception '026: el representante no podría autorizar sin cuenta';
  end if;
  if has_table_privilege('anon', 'guardian_authorizations', 'select')
     or has_table_privilege('authenticated', 'guardian_authorizations', 'select') then
    raise exception '026: la tabla de enlaces quedó legible desde el navegador';
  end if;
  if has_table_privilege('anon', 'notification_outbox', 'select')
     or has_table_privilege('authenticated', 'notification_outbox', 'select') then
    raise exception '026: la bandeja de avisos quedó legible desde el navegador';
  end if;
  select count(*) into n from profiles where guardian_authorization_status is null;
  if n > 0 then
    raise exception '026: hay % perfiles sin estado de autorización', n;
  end if;
end $mig$;
