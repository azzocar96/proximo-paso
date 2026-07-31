-- ============================================================
-- 015 — Fecha de nacimiento en el registro, menores, cumpleaños y novedades
-- ============================================================
-- Decisión de Jesús: la fecha de nacimiento se pide AL REGISTRARSE.
--
-- Hallazgo que motivó esta migración: la app ya tenía los ajustes
-- `allow_minors` y `min_age_without_guardian` en app_settings y los campos
-- guardian_* en profiles, pero NADA los usaba, porque el registro nunca
-- preguntaba la edad. Estaban de adorno.
--
-- Privacidad de los cumpleaños (decisión de Jesús): solo DÍA y MES, nunca el
-- año ni la edad, y cada persona puede ocultarse.
--
-- La auditoría previa encontró 13 hallazgos (2 críticos, 2 altos). Los más
-- graves, y por qué el arreglo está donde está:
--   · La primera versión de esta migración reescribía handle_new_user y se
--     comía el alta del rol 'participant'. Fallo silencioso: fn_role() hace
--     coalesce a 'participant', así que nadie lo habría notado hasta romperse
--     algo mucho más tarde. Restaurado y con backfill.
--   · get_news se saltaba el filtro de audiencia de los anuncios: al ser
--     security definer devolvía anuncios dirigidos a un ciclo, un ministerio
--     o un rol a cualquiera. Ahora replica la policy p_ann_sel.
--   · La edad se validaba solo en la server action, pero el alta real ocurre
--     contra Supabase Auth con la clave pública: un POST a mano se la saltaba.
--     La regla ahora vive en el trigger, que es el único paso obligatorio.
--   · Cualquiera podía hacerse `active_member` con un PATCH a su propio perfil
--     (RLS permitía actualizar la fila entera) y con eso entrar al muro. Se
--     añade un trigger guardián. Este agujero venía de antes de esta fase.

-- ---------- 1. Interruptor personal de cumpleaños ----------
alter table profiles add column if not exists show_birthday boolean not null default true;

-- ---------- 2. Política de edad, legible SIN sesión ----------
-- El formulario de registro es público y app_settings solo se lee con sesión.
-- Expone únicamente los dos valores que el formulario necesita.
-- A prueba de valores mal escritos: si alguien guarda "dieciocho" en el panel,
-- el cast reventaría y tumbaría el registro entero, así que se captura y se
-- cae en lo más protector (18 años, menores no permitidos).
create or replace function fn_registration_policy()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_min int; v_allow boolean;
begin
  begin
    select nullif(value #>> '{}', '')::int into v_min from app_settings where key = 'min_age_without_guardian';
  exception when others then v_min := null;
  end;
  begin
    select nullif(value #>> '{}', '')::boolean into v_allow from app_settings where key = 'allow_minors';
  exception when others then v_allow := null;
  end;
  return jsonb_build_object('min_age', coalesce(v_min, 18), 'allow_minors', coalesce(v_allow, false));
end $$;
revoke execute on function fn_registration_policy() from public;
grant execute on function fn_registration_policy() to anon, authenticated;

-- ---------- 3. El registro guarda la fecha y HACE CUMPLIR la regla de edad ----------
-- Ojo: aquí es donde la regla es real. La validación del formulario y la de la
-- server action son comodidad; esto es lo que no se puede esquivar.
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
  v_gconsent boolean := (new.raw_user_meta_data->>'guardian_consent')::boolean;
begin
  -- Fecha: si viene mal escrita no reventamos el alta con un error críptico.
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
                        privacy_consent, privacy_consent_at)
  values (new.id,
          coalesce(new.raw_user_meta_data->>'first_name',''),
          nullif(new.raw_user_meta_data->>'middle_name',''),
          coalesce(new.raw_user_meta_data->>'last_name',''),
          new.email,
          v_birth, v_gname, v_gcontact, v_gconsent,
          coalesce((new.raw_user_meta_data->>'privacy_consent')::boolean,false),
          case when coalesce((new.raw_user_meta_data->>'privacy_consent')::boolean,false) then now() end)
  on conflict (id) do nothing;

  -- CRÍTICO (auditoría): esto estaba en 001 y la primera versión de la 015 se
  -- lo comió. Sin esta línea ningún usuario nuevo tiene fila en user_roles.
  insert into user_roles (user_id, role) values (new.id, 'participant')
  on conflict (user_id, role) do nothing;
  return new;
end $$;

-- Backfill por si alguien se registró con la versión defectuosa.
insert into user_roles (user_id, role)
select p.id, 'participant' from profiles p
where not exists (select 1 from user_roles r where r.user_id = p.id)
on conflict (user_id, role) do nothing;

-- ---------- 4. Nadie se asciende a sí mismo ----------
-- Agujero preexistente: la policy de perfil propio permite actualizar la fila
-- entera, así que un PATCH con {"active_member": true} bastaba para entrar al
-- muro general sin haber hecho el curso. Este trigger revierte en silencio los
-- campos que solo el administrador puede tocar.
create or replace function fn_guard_profile_privileges() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if fn_is_admin() then return new; end if;
  new.active_member := old.active_member;
  new.active_member_since := old.active_member_since;
  new.active_member_approved_by := old.active_member_approved_by;
  new.account_status := old.account_status;
  return new;
end $$;

drop trigger if exists t_profiles_guard on profiles;
create trigger t_profiles_guard before update on profiles
for each row execute function fn_guard_profile_privileges();

-- Próximo aniversario de una fecha, contado desde un día dado.
-- Los nacidos el 29 de febrero se saludan el 28 en años no bisiestos: excluirlos
-- (como hacía la primera versión) los dejaba sin saludo para siempre.
create or replace function fn_next_anniversary(p_birth date, p_from date)
returns date language plpgsql immutable set search_path = public as $$
declare v_y int := extract(year from p_from)::int; v_d date;
begin
  v_d := fn_anniversary_in_year(p_birth, v_y);
  if v_d < p_from then
    v_d := fn_anniversary_in_year(p_birth, v_y + 1);
  end if;
  return v_d;
end $$;

create or replace function fn_anniversary_in_year(p_birth date, p_year int)
returns date language plpgsql immutable set search_path = public as $$
declare m int := extract(month from p_birth)::int; d int := extract(day from p_birth)::int;
begin
  -- 29 de febrero en año no bisiesto -> 28 de febrero
  if m = 2 and d = 29 then
    begin
      return make_date(p_year, 2, 29);
    exception when others then
      return make_date(p_year, 2, 28);
    end;
  end if;
  return make_date(p_year, m, d);
end $$;

-- ---------- 5. Cumpleaños de la semana ----------
-- Devuelve SOLO nombre, foto, día y mes. Nunca el año ni la edad.
create or replace function get_week_birthdays()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_hoy date := current_date;
begin
  if not fn_can_view_wall('general', null, null) then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(to_jsonb(t) order by t.faltan, t.nombre) from (
      select p.first_name || ' ' || p.last_name as nombre,
             p.photo_url as foto,
             extract(day from p.birth_date)::int as dia,
             extract(month from p.birth_date)::int as mes,
             (fn_next_anniversary(p.birth_date, v_hoy) - v_hoy) as faltan
      from profiles p
      where p.birth_date is not null
        and p.show_birthday
        and p.active_member
        and p.account_status = 'active'
    ) t
    where t.faltan between 0 and 6
  ), '[]'::jsonb);
end $$;

revoke execute on function get_week_birthdays() from public, anon;
revoke execute on function fn_next_anniversary(date, date) from public, anon;
revoke execute on function fn_anniversary_in_year(date, int) from public, anon;
grant execute on function get_week_birthdays() to authenticated;
grant execute on function fn_next_anniversary(date, date) to authenticated;
grant execute on function fn_anniversary_in_year(date, int) to authenticated;

-- ---------- 6. Novedades ----------
-- Replica EXACTAMENTE el filtro de audiencia de la policy p_ann_sel (003_rls):
-- al ser security definer, sin esto devolvía anuncios de un ciclo, un ministerio
-- o un rol a quien no le tocaban.
create or replace function get_news(p_limit int default 3)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then return '[]'::jsonb; end if;
  if not fn_can_view_wall('general', null, null) then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(t) order by t.priority desc, t.publish_at desc) from (
      select a.id, a.title, a.content, a.publish_at, a.priority
      from announcements a
      where a.deleted_at is null
        and a.publish_at <= now()
        and (a.expires_at is null or a.expires_at > now())
        and (
          fn_is_admin()
          or a.audience = 'all'
          or (a.audience = 'cycle' and exists (
                select 1 from enrollments e where e.user_id = auth.uid()
                  and e.cycle_id = a.cycle_id and e.status not in ('withdrawn','cancelled')))
          or (a.audience = 'ministry' and exists (
                select 1 from ministry_assignments m where m.user_id = auth.uid()
                  and m.ministry_id = a.ministry_id and m.status in ('assigned','active')))
          or (a.audience = 'role' and a.role = fn_role())
          or (a.audience = 'certified' and exists (
                select 1 from certificates c where c.user_id = auth.uid()
                  and c.status in ('issued','delivered','ready_for_pickup','physical_pending')))
        )
      order by a.priority desc, a.publish_at desc
      limit greatest(1, least(coalesce(p_limit, 3), 10))
    ) t
  ), '[]'::jsonb);
end $$;
revoke execute on function get_news(int) from public, anon;
grant execute on function get_news(int) to authenticated;
