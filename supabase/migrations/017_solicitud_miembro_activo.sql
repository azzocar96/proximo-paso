-- ============================================================
-- 017 — "Ya soy miembro activo": se pide, no se toma
-- ============================================================
-- Lo que pidió Jesús: "todas estas personas que se registran pueden clickear
-- de que ya son miembros activos y solo si los directores o administradores lo
-- aprueban aparecen en efecto como miembros activos."
--
-- Por qué esto no rompe la regla anterior: ser miembro activo sigue SIN poder
-- auto-otorgarse. Lo que se agrega es una SOLICITUD: marcar la casilla solo
-- levanta la mano. El interruptor de verdad (profiles.active_member) lo sigue
-- moviendo alguien con autoridad.
--
-- Quién aprueba (decisión de Jesús, 31-jul): administrador, pastor Y directores
-- de ministerio. Nadie puede aprobarse a sí mismo.
--
-- CORRECCIONES DE LA AUDITORÍA (15 hallazgos) QUE DEJARON MARCA AQUÍ:
--   · ALTO: la RPC de aprobar exigía menos que el trigger guardián. Un director
--     que se lo pidiera a sí mismo veía "aprobado", la solicitud desaparecía de
--     todas las bandejas... y el guardián revertía el privilegio en silencio.
--     Ahora la RPC y el guardián comparten EXACTAMENTE el mismo criterio.
--   · ALTO: `active_member_requested_at` no estaba guardado y la RLS deja a
--     cualquiera actualizar su propia fila entera: con un PATCH se podía
--     antedatar la solicitud a 2019 (sale primera en la bandeja, parece que
--     lleva años esperando) y meter una nota de 8000 caracteres. Ahora esos dos
--     campos solo se escriben desde estas RPC.
--   · ALTO: `profiles.email` tampoco estaba guardado. Alguien podía ponerse el
--     correo del pastor en su perfil y la bandeja lo mostraba como si fuera
--     suyo. El correo del perfil ahora SOLO entra desde Auth.
--   · ALTO: el trigger que copia el correo de Auth al perfil podía abortar el
--     cambio de correo para siempre por el índice único. Ahora es "mejor
--     esfuerzo": si choca, deja constancia y no tumba la operación de Auth.
--   · MEDIO: se podía aprobar a alguien con la cuenta suspendida y devolverle
--     el acceso a los muros que el administrador acababa de cerrar.
--   · MEDIO: los otros dos caminos que encienden `active_member` (marcarlo a
--     mano y aprobar el certificado) dejaban la solicitud viva; meses después
--     reaparecía sola en la bandeja. Ahora la coherencia la impone el trigger.

-- ---------- 1. Campos de la solicitud ----------
alter table profiles add column if not exists active_member_requested_at timestamptz;
alter table profiles add column if not exists active_member_request_note text;
alter table profiles add column if not exists active_member_reviewed_at timestamptz;
alter table profiles add column if not exists active_member_reviewed_by uuid references profiles(id);
alter table profiles add column if not exists active_member_review_status text;
alter table profiles add column if not exists active_member_review_note text;

do $$ begin
  alter table profiles add constraint chk_active_member_review_status
    check (active_member_review_status is null or active_member_review_status in ('approved','rejected'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table profiles add constraint chk_active_member_texts
    check (char_length(coalesce(active_member_request_note,'')) <= 500
       and char_length(coalesce(active_member_review_note,'')) <= 500);
exception when duplicate_object then null; end $$;

comment on column profiles.active_member_requested_at is
  'Cuándo levantó la mano diciendo que ya era miembro activo. Solicitud pendiente = este campo lleno y active_member en false. Al resolverse se vacía. Solo lo escriben las RPC de la 017.';

-- La bandeja se consulta seguido y siempre por lo mismo: pendientes de verdad.
create index if not exists idx_profiles_active_member_pending
  on profiles (active_member_requested_at)
  where active_member_requested_at is not null and not active_member;

-- ---------- 2. Quién puede revisar ----------
create or replace function fn_can_review_active_member()
returns boolean language sql stable security definer set search_path = public as $$
  select fn_is_admin()
      or exists (select 1 from ministry_leaders ml where ml.user_id = auth.uid());
$$;

-- El cerrojo de verdad, compartido por la RPC y por el trigger guardián: se
-- puede aprobar a alguien que levantó la mano, que tiene la cuenta al día, y
-- que no eres tú.
create or replace function fn_can_approve_active_member(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_user is not null
     and p_user is distinct from auth.uid()
     and fn_can_review_active_member()
     and exists (
       select 1 from profiles p
        where p.id = p_user
          and p.active_member_requested_at is not null
          and not p.active_member
          and p.account_status = 'active');
$$;

-- ---------- 3. El guardián: quién puede tocar qué en `profiles` ----------
-- Un único sitio donde se decide el estado final de las columnas delicadas.
-- Se hace en UN trigger a propósito: repartirlo en dos dependería del orden
-- alfabético de los nombres, y un trigger que limpiara la solicitud ANTES de
-- que este revirtiera el privilegio reabriría justo el agujero que cerramos.
--
-- Las banderas de sesión (`set_config(..., true)`) solo pueden ponerlas las
-- funciones de abajo: `set_config` vive en pg_catalog y PostgREST no expone ese
-- esquema, así que no se pueden encender desde el navegador.
create or replace function fn_guard_profile_privileges() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_puede_aprobar boolean := fn_can_approve_active_member(new.id);
  v_admin boolean := fn_is_admin();
begin
  -- El correo del perfil es un espejo del de Auth: solo lo mueve el trigger de
  -- sincronización. Ni la propia persona ni el administrador lo escriben aquí.
  if coalesce(current_setting('app.email_sync', true), '') <> 'on' then
    new.email := old.email;
  end if;

  if not v_admin then
    if not v_puede_aprobar then
      new.active_member := old.active_member;
      new.active_member_since := old.active_member_since;
      new.active_member_approved_by := old.active_member_approved_by;
    end if;
    -- La solicitud se levanta y se retira desde su RPC, nunca con un PATCH.
    if not v_puede_aprobar
       and coalesce(current_setting('app.member_request', true), '') <> 'on' then
      new.active_member_requested_at := old.active_member_requested_at;
      new.active_member_request_note := old.active_member_request_note;
    end if;
    new.account_status := old.account_status;
  end if;

  -- Coherencia final: quede activo por donde quede (esta bandeja, el botón del
  -- administrador o la aprobación del certificado), ya no hay nada pendiente.
  if new.active_member and not coalesce(old.active_member, false) then
    new.active_member_requested_at := null;
    new.active_member_reviewed_at := coalesce(new.active_member_reviewed_at, now());
    new.active_member_review_status := coalesce(new.active_member_review_status, 'approved');
  end if;

  return new;
end $$;

-- ---------- 4. Levantar la mano ----------
create or replace function request_active_member(p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_p profiles%rowtype;
begin
  if v_uid is null then raise exception 'Sesión no válida.'; end if;
  select * into v_p from profiles where id = v_uid;
  if v_p.id is null then raise exception 'No encontramos tu perfil.'; end if;
  if v_p.active_member then
    raise exception 'Ya eres miembro activo: no hace falta pedirlo.';
  end if;
  if v_p.account_status <> 'active' then
    raise exception 'Tu cuenta no está activa. Escríbenos desde Contacto y lo revisamos.';
  end if;
  if v_p.active_member_requested_at is not null then
    raise exception 'Ya tienes una solicitud en revisión. La respuesta aparecerá aquí mismo, en tu perfil.';
  end if;
  if char_length(coalesce(p_note,'')) > 500 then
    raise exception 'La nota es demasiado larga (máximo 500 caracteres).';
  end if;

  perform set_config('app.member_request', 'on', true);
  update profiles set
    active_member_requested_at = now(),
    active_member_request_note = nullif(btrim(coalesce(p_note,'')),''),
    active_member_review_status = null,
    active_member_review_note = null,
    active_member_reviewed_at = null,
    active_member_reviewed_by = null
  where id = v_uid;
  -- Apagar la bandera EN CUANTO se usa. `set_config(..., true)` dura toda la
  -- transacción, no la sentencia: dejarla encendida permitía que un PATCH
  -- posterior dentro de la misma petición escribiera estos campos a mano.
  perform set_config('app.member_request', 'off', true);

  perform fn_audit('request_active_member','profiles',v_uid,p_note,null);
end $$;

create or replace function cancel_active_member_request()
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Sesión no válida.'; end if;
  perform set_config('app.member_request', 'on', true);
  update profiles set active_member_requested_at = null
   where id = v_uid and active_member_requested_at is not null;
  perform set_config('app.member_request', 'off', true);
  if not found then raise exception 'No tienes ninguna solicitud pendiente.'; end if;
  perform fn_audit('cancel_active_member_request','profiles',v_uid,null,null);
end $$;

-- ---------- 5. La bandeja de quien revisa ----------
-- Devuelve lo MÍNIMO para decidir "¿me consta que esta persona hizo el curso?":
-- nombre, foto y si ya tiene certificado emitido aquí. El correo solo lo ve el
-- administrador o el pastor: para un director no aporta a la decisión y es el
-- dato más reutilizable fuera de la app.
-- Solo entran cuentas con el correo ya confirmado: si no, cualquiera puede
-- llenar la bandeja de todos los directores con registros inventados.
create or replace function get_active_member_requests()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_admin boolean := fn_is_admin();
begin
  if not fn_can_review_active_member() then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(t) order by t.desde) from (
      select p.id,
             p.first_name || ' ' || p.last_name as nombre,
             case when v_admin then p.email else null end as email,
             p.photo_url as foto,
             p.active_member_request_note as nota,
             p.active_member_requested_at as desde,
             exists (select 1 from certificates c
                      where c.user_id = p.id
                        and c.status in ('issued','delivered','ready_for_pickup','physical_pending')
                    ) as tiene_certificado
      from profiles p
      where p.active_member_requested_at is not null
        and not p.active_member
        and p.account_status = 'active'
        and exists (select 1 from auth.users u
                     where u.id = p.id and u.email_confirmed_at is not null)
    ) t
  ), '[]'::jsonb);
end $$;

-- ---------- 6. Resolver ----------
create or replace function approve_active_member(p_user uuid, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_name text; v_pending timestamptz; v_status account_status;
begin
  if not fn_can_review_active_member() then
    raise exception 'Solo el administrador, el pastor o un director de ministerio pueden aprobar esto.';
  end if;
  if char_length(coalesce(p_note,'')) > 500 then
    raise exception 'La nota es demasiado larga (máximo 500 caracteres).';
  end if;
  select first_name || ' ' || last_name, active_member_requested_at, account_status
    into v_name, v_pending, v_status
    from profiles where id = p_user
    for update;
  if v_name is null then raise exception 'Esa persona no existe.'; end if;
  if v_pending is null then
    raise exception 'Esa solicitud ya no está pendiente. Actualiza la página.';
  end if;
  if v_status <> 'active' then
    raise exception 'Esa cuenta está suspendida. Reactívala primero desde Usuarios.';
  end if;
  -- Mismo criterio EXACTO que el trigger guardián: si aquí pasa y allí no, la
  -- aprobación se vería como exitosa y no cambiaría nada.
  if not fn_can_approve_active_member(p_user) then
    raise exception 'No puedes aprobar tu propia solicitud: pídeselo a otro director o al equipo pastoral.';
  end if;

  update profiles set
    active_member = true,
    active_member_since = coalesce(active_member_since, now()),
    active_member_approved_by = auth.uid(),
    active_member_reviewed_at = now(),
    active_member_reviewed_by = auth.uid(),
    active_member_review_status = 'approved',
    active_member_review_note = nullif(btrim(coalesce(p_note,'')),'')
  where id = p_user;

  perform fn_audit('approve_active_member','profiles',p_user,p_note,
    jsonb_build_object('solicitud_desde', v_pending));
  return jsonb_build_object('name', v_name);
end $$;

create or replace function reject_active_member(p_user uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_name text; v_pending timestamptz;
begin
  if not fn_can_review_active_member() then
    raise exception 'Solo el administrador, el pastor o un director de ministerio pueden revisar esto.';
  end if;
  if char_length(btrim(coalesce(p_reason,''))) < 5 then
    raise exception 'Escribe el motivo (mínimo 5 caracteres). La persona lo va a leer.';
  end if;
  if char_length(p_reason) > 500 then
    raise exception 'El motivo es demasiado largo (máximo 500 caracteres).';
  end if;
  select first_name || ' ' || last_name, active_member_requested_at
    into v_name, v_pending
    from profiles where id = p_user
    for update;
  if v_name is null then raise exception 'Esa persona no existe.'; end if;
  if v_pending is null then
    raise exception 'Esa solicitud ya no está pendiente. Actualiza la página.';
  end if;
  if p_user = auth.uid() then
    raise exception 'No puedes revisar tu propia solicitud.';
  end if;

  -- Rechazar no enciende ningún privilegio, así que el guardián no estorba;
  -- la bandera solo hace falta porque vacía `active_member_requested_at`.
  perform set_config('app.member_request', 'on', true);
  update profiles set
    active_member_requested_at = null,
    active_member_reviewed_at = now(),
    active_member_reviewed_by = auth.uid(),
    active_member_review_status = 'rejected',
    active_member_review_note = btrim(p_reason)
  where id = p_user;
  perform set_config('app.member_request', 'off', true);

  perform fn_audit('reject_active_member','profiles',p_user,p_reason,
    jsonb_build_object('solicitud_desde', v_pending));
  return jsonb_build_object('name', v_name);
end $$;

-- ---------- 7. El registro puede traer la mano ya levantada ----------
-- Se agrega SOLO el bloque nuevo al final; el resto del trigger queda idéntico
-- al de la 015 (lección aprendida: al reescribir un trigger existente hay que
-- compararlo línea por línea con el original antes de aplicarlo).
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_birth date;
  v_pol jsonb := fn_registration_policy();
  v_min int := (v_pol->>'min_age')::int;
  v_allow boolean := (v_pol->>'allow_minors')::boolean;
  v_age int;
  v_gname text := nullif(new.raw_user_meta_data->>'guardian_name','');
  v_gcontact text := nullif(new.raw_user_meta_data->>'guardian_contact','');
  v_gconsent boolean;
  v_already boolean;
  v_mnote text := left(nullif(btrim(coalesce(new.raw_user_meta_data->>'member_note','')),''), 500);
begin
  -- Los booleanos van dentro del bloque protegido: si alguien llama a la API de
  -- Auth a mano con "already_member":"si", el cast reventaría el alta entera
  -- con un mensaje incomprensible.
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
    if not v_allow then
      raise exception 'Para registrarse por cuenta propia hay que tener al menos % años.', v_min;
    end if;
    if v_gname is null or v_gcontact is null or coalesce(v_gconsent,false) = false then
      raise exception 'Falta el nombre, el contacto o la autorización del representante.';
    end if;
  end if;

  insert into profiles (id, first_name, middle_name, last_name, email,
                        birth_date, guardian_name, guardian_contact, guardian_consent,
                        privacy_consent, privacy_consent_at,
                        active_member_requested_at, active_member_request_note)
  values (new.id,
          coalesce(new.raw_user_meta_data->>'first_name',''),
          nullif(new.raw_user_meta_data->>'middle_name',''),
          coalesce(new.raw_user_meta_data->>'last_name',''),
          new.email,
          v_birth, v_gname, v_gcontact, v_gconsent,
          coalesce((new.raw_user_meta_data->>'privacy_consent')::boolean,false),
          case when coalesce((new.raw_user_meta_data->>'privacy_consent')::boolean,false) then now() end,
          case when v_already then now() end,
          case when v_already then v_mnote end)
  on conflict (id) do nothing;

  -- CRÍTICO (auditoría de la 015): sin esta línea ningún usuario nuevo tiene
  -- fila en user_roles, y el fallo es silencioso porque fn_role() hace coalesce.
  insert into user_roles (user_id, role) values (new.id, 'participant')
  on conflict (user_id, role) do nothing;
  return new;
end $$;

-- ---------- 8. El correo de la cuenta y el del perfil no se separan ----------
-- Cambiar el correo desde la app lo cambia en Auth. Sin esto, profiles.email se
-- quedaba con el viejo y el panel, los avisos y la búsqueda por correo
-- apuntaban a una dirección que ya nadie lee.
-- Es de MEJOR ESFUERZO a propósito: si el correo nuevo ya estuviera ocupado en
-- `profiles`, un error aquí abortaría el cambio en Auth y la persona se
-- quedaría atrapada con un enlace de confirmación que nunca funciona.
create or replace function handle_user_email_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.email is distinct from old.email and new.email is not null then
    begin
      perform set_config('app.email_sync', 'on', true);
      update profiles set email = new.email where id = new.id;
      perform set_config('app.email_sync', 'off', true);
    exception when others then
      perform set_config('app.email_sync', 'off', true);
      perform fn_audit('email_sync_failed','profiles',new.id,sqlerrm,
        jsonb_build_object('correo_nuevo', new.email));
    end;
  end if;
  return new;
end $$;

drop trigger if exists t_auth_email_sync on auth.users;
create trigger t_auth_email_sync after update of email on auth.users
for each row execute function handle_user_email_change();

-- ---------- 9. Permisos ----------
-- fn_can_approve_active_member NO se expone: solo la usan el guardián y las
-- RPC, que corren como el dueño.
revoke execute on function fn_can_approve_active_member(uuid) from public, anon, authenticated;
revoke execute on function fn_can_review_active_member() from public, anon;
revoke execute on function request_active_member(text) from public, anon;
revoke execute on function cancel_active_member_request() from public, anon;
revoke execute on function get_active_member_requests() from public, anon;
revoke execute on function approve_active_member(uuid,text) from public, anon;
revoke execute on function reject_active_member(uuid,text) from public, anon;

grant execute on function fn_can_review_active_member() to authenticated;
grant execute on function request_active_member(text) to authenticated;
grant execute on function cancel_active_member_request() to authenticated;
grant execute on function get_active_member_requests() to authenticated;
grant execute on function approve_active_member(uuid,text) to authenticated;
grant execute on function reject_active_member(uuid,text) to authenticated;
