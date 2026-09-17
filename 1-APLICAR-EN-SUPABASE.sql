-- ===========================================================================
--  PRÓXIMO PASO · APLICAR EN SUPABASE
--  Generado el 17 de septiembre de 2026
-- ===========================================================================
--
--  QUÉ HACER CON ESTE ARCHIVO
--  1. Entra a Supabase → tu proyecto → "SQL Editor" (icono de consola, a la
--     izquierda) → "New query".
--  2. Abre este archivo, selecciona TODO (Ctrl+A), cópialo y pégalo ahí.
--  3. Dale a "Run".
--  4. Al final verás una tabla con el resumen. Si algo salió mal, el propio
--     script se detiene con un mensaje en español explicando qué pasó; nada
--     queda a medias.
--
--  Se puede correr ANTES o DESPUÉS de subir el código: no rompe nada en
--  ninguno de los dos casos. Correrlo dos veces tampoco hace daño.
--
--  QUÉ HACE
--  · 026 — Los datos del representante de un menor y su autorización.
--  · 027 — Lo que un menor sin permiso no puede hacer, y los avisos al
--          representante.
--  · 028 — Decir "todavía no disponible" en vez de fallar callado.
--  · Pone al día los ciclos cuyas clases ya empezaron.
--  · Abre un ciclo nuevo para OCTUBRE, para que quien pruebe la app tenga a
--    dónde inscribirse.
--
--  ⚠️ REVISA ESTAS FECHAS ANTES DE CORRERLO
--  El ciclo de octubre queda con las clases los domingos 4, 11, 18 y 25 de
--  octubre de 2026, de 4:30 a 4:50 p.m., en el Salón Australia · Summit, y las
--  inscripciones abiertas hasta el sábado 3 de octubre. La certificación
--  sugerida es el domingo 1 de noviembre.
--  Si alguna fecha no es esa, cámbiala abajo (búscala como "OCTUBRE") antes de
--  darle a Run, o dímelo y lo ajusto después desde el panel.
--
--  ⚠️ LO QUE ESTE ARCHIVO NO HACE, A PROPÓSITO
--  No enciende el registro de menores. Eso va en el segundo archivo
--  (2-DESPUES-DEL-DEPLOY.sql) y hay que correrlo SOLO cuando el sitio ya tenga
--  el código nuevo, no antes.
-- ===========================================================================


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
  if position('Falta el nombre, el contacto o la autorización del representante.' in def) = 0 then
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


-- ============================================================
-- 027 — Lo que un menor sin permiso NO puede hacer, y lo que sí se le avisa
-- ============================================================
-- La 026 guardó los datos del representante y montó el permiso. Esta pone el
-- permiso a trabajar, en los dos sentidos:
--
--   (a) PUERTAS: mientras el representante no autorice, la cuenta del menor
--       existe pero no hace nada — no se inscribe a un ciclo, no marca
--       asistencia y no escribe en los muros. Y va en la BASE, no en la
--       pantalla: esconder un botón no es impedir nada.
--   (b) AVISOS: cada momento importante del menor le llega al representante.
--       Los momentos son los que eligió Jesús: inscripción a un ciclo, cada
--       asistencia registrada y el certificado. (El alta de la cuenta y la
--       autorización ya avisan desde la 026; el cambio de correo y de
--       contraseña los avisa la propia app.)
--
-- Todo se parchea sobre la definición REAL que hay en producción y cada bloque
-- es idempotente: si ya está puesto, no hace nada.

-- ---------- 1. Inscribirse a un ciclo ----------
do $mig$
declare def text;
begin
  def := pg_get_functiondef('enroll_in_cycle(uuid)'::regprocedure);
  if position('fn_guardian_ok' in def) > 0 then return; end if;
  if position('if auth.uid() is null then raise exception ''inicia sesión''; end if;' in def) = 0 then
    raise exception '027: no encontré el arranque de enroll_in_cycle';
  end if;
  def := replace(def,
    'if auth.uid() is null then raise exception ''inicia sesión''; end if;',
    'if auth.uid() is null then raise exception ''inicia sesión''; end if;'
    || chr(10) || '  if not fn_guardian_ok() then raise exception ''Tu cuenta está esperando la autorización de tu representante. En cuanto la dé, podrás inscribirte.'' using errcode = ''P0001''; end if;');
  execute def;
end $mig$;

-- ---------- 2. Marcar asistencia ----------
do $mig$
declare def text;
begin
  def := pg_get_functiondef('register_attendance(text, double precision, double precision, double precision)'::regprocedure);
  if position('fn_guardian_ok' in def) > 0 then return; end if;
  if position('-- geolocalización' in def) = 0 then
    raise exception '027: no encontré el bloque de geolocalización dentro de register_attendance';
  end if;
  def := replace(def,
    '-- geolocalización',
    'if not fn_guardian_ok() then raise exception ''Tu cuenta está esperando la autorización de tu representante. Avísale a quien atiende la clase para que registre tu asistencia mientras tanto.'' using errcode = ''P0001''; end if;'
    || chr(10) || '  -- geolocalización');
  execute def;
end $mig$;

-- ---------- 3. Escribir en los muros ----------
do $mig$
declare def text;
begin
  def := pg_get_functiondef('fn_can_post_wall(wall_kind, uuid, int)'::regprocedure);
  if position('fn_guardian_ok' in def) > 0 then return; end if;
  if position('fn_is_active_account()' in def) = 0 then
    raise exception '027: no encontré fn_is_active_account dentro de fn_can_post_wall';
  end if;
  def := replace(def, 'fn_is_active_account()', '(fn_is_active_account() and fn_guardian_ok())');
  execute def;
end $mig$;

-- ---------- 4. Los avisos al representante ----------
-- Inscripción a un ciclo.
do $mig$
declare def text;
begin
  def := pg_get_functiondef('enroll_in_cycle(uuid)'::regprocedure);
  if position('fn_notify_guardian' in def) > 0 then return; end if;
  if position('returning id into eid;' in def) = 0 then
    raise exception '027: no encontré el insert de enrollments dentro de enroll_in_cycle';
  end if;
  def := replace(def,
    'returning id into eid;',
    'returning id into eid;'
    || chr(10) || '  perform fn_notify_guardian(auth.uid(), ''enrollment'', ''Se inscribió al curso'','
    || ' ''Acaba de inscribirse al ciclo "'' || coalesce(c.name,'''') || ''" del curso Próximo Paso. Las clases son presenciales en la iglesia.'');');
  execute def;
end $mig$;

-- Cada asistencia registrada.
do $mig$
declare def text;
begin
  def := pg_get_functiondef('register_attendance(text, double precision, double precision, double precision)'::regprocedure);
  if position('fn_notify_guardian' in def) > 0 then return; end if;
  if position('''qr_geolocation'', ''valid''' in def) = 0 then
    raise exception '027: no encontré el insert de attendance_records dentro de register_attendance';
  end if;
  def := def || '';
  -- El aviso va DESPUÉS del insert, al final del cuerpo: se busca el último
  -- `return` de la función y se cuela justo antes.
  if position('perform fn_refresh_enrollment' in def) = 0 then
    raise exception '027: no encontré la llamada a fn_refresh_enrollment dentro de register_attendance';
  end if;
  def := replace(def,
    'perform fn_refresh_enrollment',
    'perform fn_notify_guardian(auth.uid(), ''attendance'', ''Asistencia registrada'','
    || ' ''Se registró su asistencia a una clase del curso Próximo Paso, hoy, en la iglesia.'');'
    || chr(10) || '  perform fn_refresh_enrollment');
  execute def;
end $mig$;

-- Certificado emitido. Aquí NO se parchea `approve_certificate`: su cuerpo ha
-- cambiado varias veces entre migraciones y un parche por texto sería frágil.
-- Un trigger sobre la tabla avisa pase lo que pase, venga de donde venga.
create or replace function fn_trg_notify_guardian_cert() returns trigger
language plpgsql security definer set search_path = public as $f$
begin
  if new.status in ('issued','delivered','ready_for_pickup','physical_pending')
     and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    perform fn_notify_guardian(new.user_id, 'certificate', 'Completó el curso',
      'Terminó los cuatro pasos y su certificado del curso Próximo Paso ya está emitido. Puede verlo desde su cuenta en la app.');
  end if;
  return new;
exception when others then
  -- Un aviso nunca puede impedir que se emita un certificado.
  return new;
end $f$;

drop trigger if exists t_cert_notify_guardian on certificates;
create trigger t_cert_notify_guardian
  after insert or update of status on certificates
  for each row execute function fn_trg_notify_guardian_cert();

-- ---------- 5. Comprobación ----------
do $mig$
declare
  d_enroll text := pg_get_functiondef('enroll_in_cycle(uuid)'::regprocedure);
  d_att text := pg_get_functiondef('register_attendance(text, double precision, double precision, double precision)'::regprocedure);
  d_wall text := pg_get_functiondef('fn_can_post_wall(wall_kind, uuid, int)'::regprocedure);
begin
  if position('fn_guardian_ok' in d_enroll) = 0 then raise exception '027: enroll_in_cycle sin la puerta'; end if;
  if position('fn_guardian_ok' in d_att) = 0 then raise exception '027: register_attendance sin la puerta'; end if;
  if position('fn_guardian_ok' in d_wall) = 0 then raise exception '027: fn_can_post_wall sin la puerta'; end if;
  if position('fn_notify_guardian' in d_enroll) = 0 then raise exception '027: enroll_in_cycle sin el aviso'; end if;
  if position('fn_notify_guardian' in d_att) = 0 then raise exception '027: register_attendance sin el aviso'; end if;
  if not exists (select 1 from pg_trigger where tgname = 't_cert_notify_guardian') then
    raise exception '027: falta el trigger del aviso de certificado';
  end if;
  if not has_function_privilege('authenticated', 'enroll_in_cycle(uuid)', 'execute') then
    raise exception '027: enroll_in_cycle perdió el permiso de authenticated';
  end if;
end $mig$;


-- ============================================================
-- 028 — Decir "todavía no" en vez de fallar en silencio
-- ============================================================
-- Petición de Jesús (17-sep-2026): esta plataforma va a migrar a su propio
-- dominio, su propio repositorio y sus propias herramientas cuando la
-- organización la reciba. Hasta entonces hay funciones que dependen de cosas
-- que aún no están conectadas. Lo que NO puede pasar es que la persona pulse
-- un botón y no ocurra nada, o peor: que la app le diga que sí y luego no.
--
-- La solución es una lista de "capacidades": interruptores que dicen qué está
-- conectado de verdad. La app los lee y, cuando algo falta, lo dice con todas
-- sus letras y explica qué hacer mientras tanto.
--
-- Hoy hay una sola apagada y es la que más duele: el correo de salida. De ella
-- dependen recuperar la contraseña, confirmar un cambio de correo y los avisos
-- al representante de un menor.

insert into app_settings (key, value)
select 'email_outbound_ready', 'false'::jsonb
where not exists (select 1 from app_settings where key = 'email_outbound_ready');

insert into app_settings (key, value)
select 'capability_notes', jsonb_build_object(
  'email_outbound',
  'La iglesia todavía no tiene un correo de salida propio conectado. Mientras tanto, el equipo resuelve a mano lo que dependa de un correo: escríbenos y te ayudamos en el momento.'
)
where not exists (select 1 from app_settings where key = 'capability_notes');

-- Lista blanca de la 023: para que la app pueda leer esto SIN sesión (la
-- pantalla de recuperar contraseña se abre sin haber entrado).
drop policy if exists p_set_sel_publico on app_settings;
create policy p_set_sel_publico on app_settings for select to anon
using (key in (
  'brand',
  'capability_notes',
  'church_address',
  'church_contact',
  'church_name',
  'course_name',
  'email_outbound_ready',
  'privacy_policy',
  'program_objectives',
  'program_schedule',
  'step_names'
));

-- Una función para preguntarlo de un tirón, sin sesión.
create or replace function fn_platform_capabilities()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_mail boolean;
begin
  begin
    select nullif(value #>> '{}','')::boolean into v_mail
      from app_settings where key = 'email_outbound_ready';
  exception when others then v_mail := null;
  end;
  return jsonb_build_object('email_outbound', coalesce(v_mail, false));
end $$;
revoke execute on function fn_platform_capabilities() from public;
grant execute on function fn_platform_capabilities() to anon, authenticated;

do $mig$
begin
  if (fn_platform_capabilities()->>'email_outbound') is null then
    raise exception '028: fn_platform_capabilities no devuelve email_outbound';
  end if;
  if not has_function_privilege('anon', 'fn_platform_capabilities()', 'execute') then
    raise exception '028: la pantalla de recuperar contraseña no podría leer las capacidades';
  end if;
end $mig$;


-- ===========================================================================
--  CALENDARIO — poner al día lo que ya pasó y abrir OCTUBRE
-- ===========================================================================
-- Un ciclo cuyas clases ya empezaron no puede seguir diciendo "inscripciones
-- abiertas": confunde a quien llega y choca con la regla de la 025. Esto lo
-- corrige solo, sin importar en qué estado esté cada ciclo.
update course_cycles c
   set status = 'active', updated_at = now()
 where c.deleted_at is null
   and c.status = 'registration_open'
   and exists (select 1 from course_sessions s
                where s.cycle_id = c.id and s.status <> 'cancelled'
                  and s.session_date is not null and s.session_date < current_date);

-- Las clases que ya pasaron quedan cerradas y sin QR vivo.
update course_sessions s
   set status = 'closed', qr_active = false, updated_at = now()
  from course_cycles c
 where c.id = s.cycle_id and c.deleted_at is null
   and s.session_date is not null and s.session_date < current_date
   and s.status = 'scheduled';

-- Cualquier token de asistencia viejo que siguiera vivo, se anula.
update attendance_tokens t
   set revoked = true
  from course_sessions s
 where s.id = t.session_id and not t.revoked
   and (t.expires_at < now() or s.session_date < current_date);

-- ---------- OCTUBRE — el ciclo al que se inscribe quien pruebe la app ----------
with nuevo as (
  insert into course_cycles (name, registration_start, registration_end, status,
    location_name, full_address, latitude, longitude, allowed_radius_meters,
    certificate_delivery_date)
  select 'Próximo Paso · Octubre 2026',
         now(),
         timestamptz '2026-10-03 23:59:00-04',
         'registration_open',
         'Salón Australia · Summit',
         '735 Herndon Ave, Orlando, FL 32803',
         28.5550609, -81.3371297, 150,
         date '2026-11-01'
  where not exists (
    select 1 from course_cycles
     where name = 'Próximo Paso · Octubre 2026' and deleted_at is null)
  returning id
)
insert into course_sessions (cycle_id, step_number, name, session_date,
                             start_time, end_time, location_name,
                             latitude, longitude, allowed_radius_meters)
select n.id, v.paso, v.nom, v.fecha, '16:30', '16:50',
       'Salón Australia · Summit', 28.5550609, -81.3371297, 150
  from nuevo n,
       (values
         (1, 'Paso 1 · Sígueme',                          date '2026-10-04'),
         (2, 'Paso 2 · Intimidad con Dios',               date '2026-10-11'),
         (3, 'Paso 3 · Compañerismo con los de adentro',  date '2026-10-18'),
         (4, 'Paso 4 · Influencia hacia los de afuera',   date '2026-10-25')
       ) as v(paso, nom, fecha);


-- ===========================================================================
--  COMPROBACIÓN FINAL — si algo falta, esto se detiene y lo dice
-- ===========================================================================
do $chk$
declare
  n int;
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='profiles'
                    and column_name='guardian_email') then
    raise exception 'FALLÓ: no quedaron los campos del representante.';
  end if;

  if position('fn_guardian_ok' in
      pg_get_functiondef('enroll_in_cycle(uuid)'::regprocedure)) = 0 then
    raise exception 'FALLÓ: la puerta del menor no quedó puesta en la inscripción.';
  end if;

  if (fn_platform_capabilities()->>'email_outbound') is null then
    raise exception 'FALLÓ: no quedó la lista de lo que está conectado.';
  end if;

  select count(*) into n
    from course_cycles c
   where c.deleted_at is null and c.status = 'registration_open'
     and (c.registration_end is null or c.registration_end > now())
     and not exists (select 1 from course_sessions s
                      where s.cycle_id = c.id and s.status <> 'cancelled'
                        and s.session_date is not null
                        and s.session_date < current_date);
  if n = 0 then
    raise exception 'FALLÓ: no quedó ningún ciclo abierto al que alguien pueda inscribirse.';
  end if;
end $chk$;


-- ===========================================================================
--  RESUMEN — lo que deberías ver
-- ===========================================================================
select 'Ciclos' as cosa,
       c.name as detalle,
       c.status::text as estado,
       to_char(c.registration_end, 'DD/MM') as "inscripciones hasta",
       (select count(*) from course_sessions s where s.cycle_id = c.id)::text as clases,
       (select count(*) from enrollments e where e.cycle_id = c.id)::text as inscritos
  from course_cycles c
 where c.deleted_at is null

union all

select 'Menores', 'Cuentas esperando permiso del representante', '',
       '', '', (select count(*)::text from profiles
                 where guardian_authorization_status in ('pending','revoked'))

union all

select 'Correo', 'Avisos guardados esperando a que haya correo de salida', '',
       '', '', (select count(*)::text from notification_outbox where sent_at is null)

union all

select 'Correo', 'Registro de menores encendido', '',
       '', '', (select coalesce(value #>> '{}', 'false')
                  from app_settings where key = 'allow_minors')

order by 1, 2;
