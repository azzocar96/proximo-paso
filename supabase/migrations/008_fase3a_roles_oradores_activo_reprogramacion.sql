-- ============================================================
-- PRÓXIMO PASO · 008_fase3a_roles_oradores_activo_reprogramacion.sql
-- Fase 3a: restructuración de roles (administrador/pastor arriba,
-- "admin" queda inerte y sin permisos — es reemplazado por "director de
-- ministerio" vía ministry_leaders, que se amplía en Fase 3b), oradores
-- por paso, miembro activo, reprogramación de clases canceladas y
-- sesión de certificación real. Requiere que 007_pastor_enum.sql ya
-- se haya corrido (agrega 'pastor' a app_role).
-- 001-006 no se tocan.
-- ============================================================

-- ---------------------------------------------------------------
-- A. Helpers de rol: 'pastor' queda al mismo nivel que 'superadmin'.
--    'admin' deja de dar acceso amplio (fn_is_admin ya no lo incluye):
--    su reemplazo es "director de ministerio", acotado a su ministerio
--    vía ministry_leaders (Fase 2), que se amplía en Fase 3b. Los
--    usuarios que hoy tengan role='admin' NO se tocan (no se borra nada):
--    simplemente dejan de tener acceso de administrador hasta que Jesús
--    los reasigne (pastor/superadmin) o los haga director de ministerio.
-- ---------------------------------------------------------------
create or replace function fn_role() returns app_role
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select role from user_roles where user_id = auth.uid()
      order by case role
        when 'superadmin' then 5
        when 'pastor' then 5
        when 'admin' then 3
        when 'coordinator' then 2
        else 1 end desc
      limit 1),
    'participant'::app_role);
$$;

create or replace function fn_is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select fn_role() in ('superadmin','pastor');
$$;

create or replace function fn_is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select fn_role() in ('coordinator','superadmin','pastor');
$$;

-- set_user_role: ahora superadmin O pastor pueden asignar roles (nivel
-- máximo compartido). Ya no se puede asignar 'admin' desde aquí: ese
-- nivel quedó reemplazado por "director de ministerio"
-- (assign_ministry_leader, Fase 2/3b).
create or replace function set_user_role(p_user uuid, p_role app_role)
returns void language plpgsql security definer set search_path = public as $$
begin
  if fn_role() not in ('superadmin','pastor') then
    raise exception 'solo el administrador o el pastor pueden asignar roles';
  end if;
  if p_role = 'admin' then
    raise exception 'el rol "admin" quedó reemplazado por Director de Ministerio: asígnalo desde Ministerios, no desde aquí';
  end if;
  delete from user_roles where user_id=p_user and role <> 'participant';
  if p_role <> 'participant' then
    insert into user_roles (user_id, role, assigned_by) values (p_user, p_role, auth.uid())
    on conflict (user_id, role) do nothing;
  end if;
  perform fn_audit('set_role','user_roles',p_user,null,jsonb_build_object('role',p_role));
end $$;

-- assign_ministry_leader / remove_ministry_leader: mismo nivel (superadmin o pastor).
create or replace function assign_ministry_leader(p_user uuid, p_ministry uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if fn_role() not in ('superadmin','pastor') then
    raise exception 'solo el administrador o el pastor pueden asignar directores de ministerio';
  end if;
  insert into ministry_leaders (user_id, ministry_id, assigned_by) values (p_user, p_ministry, auth.uid())
  on conflict (user_id, ministry_id) do nothing;
  perform fn_audit('assign_ministry_leader','ministry_leaders',p_ministry,null,jsonb_build_object('user_id',p_user));
end $$;

create or replace function remove_ministry_leader(p_user uuid, p_ministry uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if fn_role() not in ('superadmin','pastor') then
    raise exception 'solo el administrador o el pastor pueden quitar directores de ministerio';
  end if;
  delete from ministry_leaders where user_id = p_user and ministry_id = p_ministry;
  perform fn_audit('remove_ministry_leader','ministry_leaders',p_ministry,null,jsonb_build_object('user_id',p_user));
end $$;

-- app_settings: las claves críticas también las puede tocar 'pastor'.
drop policy if exists p_set_upd on app_settings;
create policy p_set_upd on app_settings for update using (
  case when key in ('certificate_auto_approve','min_age_without_guardian','allow_minors')
       then fn_role() in ('superadmin','pastor') else fn_is_admin() end);

-- ---------------------------------------------------------------
-- B. Oradores: responsable fijo de uno de los 4 pasos (mismo en todos
--    los ciclos hasta reasignación manual). Se suman como aprobador
--    EXTRA de asistencia pendiente de su paso — no reemplazan a
--    coordinador/admin/pastor.
-- ---------------------------------------------------------------
create table step_speakers (
  id uuid primary key default gen_random_uuid(),
  step_number int not null unique check (step_number between 1 and 4),
  user_id uuid not null references profiles(id) on delete cascade,
  bio text,
  contact_phone text,
  assigned_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger t_step_speakers_u before update on step_speakers for each row execute function set_updated_at();

alter table step_speakers enable row level security;
-- lectura pública para autenticados (se usa para mostrar foto/bio/contacto
-- del orador de cada paso); escritura solo vía las funciones de abajo.
create policy p_ss_sel on step_speakers for select using (auth.uid() is not null);

create or replace function fn_is_speaker_of(p_step int) returns boolean
language sql stable security definer set search_path = public as $$
  select fn_is_admin() or exists (
    select 1 from step_speakers where step_number = p_step and user_id = auth.uid());
$$;

create or replace function assign_step_speaker(p_step int, p_user uuid, p_bio text default null, p_phone text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not fn_is_admin() then raise exception 'no autorizado'; end if;
  insert into step_speakers (step_number, user_id, bio, contact_phone, assigned_by)
  values (p_step, p_user, nullif(trim(p_bio),''), nullif(trim(p_phone),''), auth.uid())
  on conflict (step_number) do update
    set user_id = excluded.user_id, bio = excluded.bio, contact_phone = excluded.contact_phone,
        assigned_by = excluded.assigned_by;
  perform fn_audit('assign_step_speaker','step_speakers',p_user,null,jsonb_build_object('step',p_step));
end $$;

create or replace function remove_step_speaker(p_step int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not fn_is_admin() then raise exception 'no autorizado'; end if;
  delete from step_speakers where step_number = p_step;
  perform fn_audit('remove_step_speaker','step_speakers',null,null,jsonb_build_object('step',p_step));
end $$;

-- approve/reject de solicitudes de asistencia: se suma el orador del paso
-- de esa sesión como aprobador extra (coordinador/admin/pastor siguen igual).
create or replace function approve_attendance_request(p_id uuid, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record; s record;
begin
  select * into r from attendance_records where id = p_id;
  if r is null then raise exception 'solicitud no encontrada'; end if;
  select * into s from course_sessions where id = r.session_id;
  if not (fn_is_coordinator_of(s.cycle_id) or fn_is_speaker_of(s.step_number)) then
    raise exception 'no autorizado';
  end if;
  if r.result <> 'pending_approval' then raise exception 'esta solicitud ya fue resuelta'; end if;
  update attendance_records set result='valid', recorded_by=auth.uid(),
    manual_reason=coalesce(nullif(trim(p_note),''), manual_reason)
    where id=p_id;
  perform fn_audit('approve_attendance_request','attendance_records', p_id, p_note,
    jsonb_build_object('user_id', r.user_id, 'session_id', r.session_id));
  perform fn_refresh_enrollment(r.enrollment_id);
  return jsonb_build_object('ok',true);
end $$;

create or replace function reject_attendance_request(p_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record; s record;
begin
  select * into r from attendance_records where id = p_id;
  if r is null then raise exception 'solicitud no encontrada'; end if;
  select * into s from course_sessions where id = r.session_id;
  if not (fn_is_coordinator_of(s.cycle_id) or fn_is_speaker_of(s.step_number)) then
    raise exception 'no autorizado';
  end if;
  if r.result <> 'pending_approval' then raise exception 'esta solicitud ya fue resuelta'; end if;
  if p_reason is null or length(trim(p_reason)) < 5 then raise exception 'el motivo es obligatorio (mínimo 5 caracteres)'; end if;
  perform fn_audit('reject_attendance_request','attendance_records', p_id, p_reason,
    jsonb_build_object('user_id', r.user_id, 'session_id', r.session_id));
  delete from attendance_records where id = p_id;
  return jsonb_build_object('ok',true);
end $$;

-- ---------------------------------------------------------------
-- C. Miembro activo: marca permanente en el perfil. Automática al
--    completar el proceso completo (ver approve_certificate abajo), o
--    manual (por ahora solo administrador/pastor — directores de
--    ministerio la ganan en Fase 3b, cuando exista membresía formal de
--    ministerio en vez de solo "interesado").
-- ---------------------------------------------------------------
alter table profiles add column if not exists active_member boolean not null default false;
alter table profiles add column if not exists active_member_since timestamptz;
alter table profiles add column if not exists active_member_approved_by uuid references profiles(id);

create or replace function set_active_member(p_user uuid, p_active boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not fn_is_admin() then raise exception 'no autorizado'; end if;
  update profiles set
    active_member = p_active,
    active_member_since = case when p_active then now() else null end,
    active_member_approved_by = case when p_active then auth.uid() else null end
  where id = p_user;
  perform fn_audit('set_active_member','profiles',p_user,
    case when p_active then 'marcado como miembro activo' else 'se quitó miembro activo' end,
    jsonb_build_object('active', p_active));
end $$;

-- se completa el proceso (certificado aprobado) => miembro activo automático
-- (approved_by queda NULL para distinguir "automático" de una asignación manual).
create or replace function approve_certificate(p_cert uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_user uuid;
begin
  if not fn_is_admin() then raise exception 'no autorizado'; end if;
  update certificates set status='issued', approved_by=auth.uid(), issued_at=now()
  where id=p_cert and status in ('eligible','pending_approval')
  returning user_id into v_user;
  update enrollments set status='certified'
  where id=(select enrollment_id from certificates where id=p_cert);
  if v_user is not null then
    update profiles set active_member = true, active_member_since = coalesce(active_member_since, now())
    where id = v_user and active_member = false;
  end if;
  perform fn_audit('approve_certificate','certificates',p_cert);
end $$;

-- ---------------------------------------------------------------
-- D. Sesión de certificación real (5º tipo de sesión, opcional por
--    ciclo): distinta de las 4 sesiones de pasos. No afecta ciclos que
--    sigan usando solo 4 sesiones (aprobación remota, como hoy).
-- ---------------------------------------------------------------
alter table course_sessions add column if not exists is_certification boolean not null default false;
alter table course_sessions drop constraint if exists course_sessions_step_number_check;
alter table course_sessions add constraint course_sessions_step_number_check
  check ((is_certification and step_number = 5) or (not is_certification and step_number between 1 and 4));

-- get_progress: agrega el manejo de la sesión de certificación (si existe)
-- y acota steps_done/eligible_for_certificate a los 4 pasos reales.
create or replace function get_progress(p_enrollment uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  e record; steps jsonb := '[]'::jsonb; s record;
  att boolean; pend boolean; prev_ok boolean := true;
  test_done boolean; dt_done boolean; unlocked boolean;
  active_assessment uuid;
begin
  select * into e from enrollments where id = p_enrollment;
  if e is null then return null; end if;
  if e.user_id <> auth.uid() and not fn_is_staff() then
    raise exception 'no autorizado';
  end if;

  select nullif(value #>> '{}','null')::uuid into active_assessment from app_settings where key='assessment_active_id';

  select exists(select 1 from assessment_attempts a
    where a.user_id = e.user_id and a.enrollment_id = e.id and a.completed_at is not null
      and (active_assessment is null or a.assessment_id = active_assessment))
    or coalesce((select (value #>> '{}') = 'external_url' from app_settings where key='assessment_mode'), false)
       and exists(select 1 from assessment_attempts a2 where a2.user_id=e.user_id and a2.enrollment_id=e.id and a2.completed_at is not null)
  into test_done;
  select exists(select 1 from dream_team_forms f where f.enrollment_id = e.id and f.completed_at is not null) into dt_done;

  for s in select * from course_sessions cs where cs.cycle_id = e.cycle_id order by cs.step_number loop
    select exists(select 1 from attendance_records ar
      where ar.session_id = s.id and ar.user_id = e.user_id and ar.result = 'valid') into att;
    select exists(select 1 from attendance_records ar
      where ar.session_id = s.id and ar.user_id = e.user_id and ar.result = 'pending_approval') into pend;
    if s.step_number = 4 or s.is_certification then
      unlocked := prev_ok and test_done and dt_done;
    else
      unlocked := prev_ok;
    end if;
    steps := steps || jsonb_build_object(
      'step', s.step_number, 'session_id', s.id, 'name', s.name,
      'date', s.session_date, 'start_time', s.start_time, 'end_time', s.end_time,
      'attended', att, 'pending', pend, 'unlocked', unlocked, 'status', s.status,
      'is_certification', s.is_certification);
    if not s.is_certification then
      prev_ok := prev_ok and att;
    end if;
  end loop;

  return jsonb_build_object(
    'enrollment_id', e.id, 'cycle_id', e.cycle_id, 'status', e.status,
    'steps', steps,
    'steps_done', (select count(*) from attendance_records ar join course_sessions cs on cs.id=ar.session_id
                   where ar.user_id=e.user_id and cs.cycle_id=e.cycle_id and ar.result='valid'
                     and cs.step_number between 1 and 4 and not cs.is_certification),
    'test_unlocked', (steps->2->>'attended')::boolean is true,
    'test_done', test_done,
    'dream_team_unlocked', (steps->2->>'attended')::boolean is true,
    'dream_team_done', dt_done,
    'eligible_for_certificate',
      (select count(*)=4 from attendance_records ar join course_sessions cs on cs.id=ar.session_id
        where ar.user_id=e.user_id and cs.cycle_id=e.cycle_id and ar.result='valid'
          and cs.step_number between 1 and 4 and not cs.is_certification)
      and test_done and dt_done
  );
end $$;

-- ---------------------------------------------------------------
-- E. Cancelar y reprogramar una clase (solo administrador/pastor).
--    same_week: mueve SOLO esa sesión a otra fecha (no afecta el resto).
--    next_week: corre esa sesión y todas las siguientes del mismo ciclo
--    7 días (incluida la sesión de certificación si existe), y ajusta la
--    fecha sugerida de certificación del ciclo si aplica.
-- ---------------------------------------------------------------
create or replace function cancel_and_reschedule_session(p_session uuid, p_mode text, p_new_date date, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare s record;
begin
  if not fn_is_admin() then raise exception 'no autorizado'; end if;
  if p_reason is null or length(trim(p_reason)) < 5 then raise exception 'el motivo es obligatorio (mínimo 5 caracteres)'; end if;
  if p_mode not in ('same_week','next_week') then raise exception 'modo inválido'; end if;

  select * into s from course_sessions where id = p_session;
  if s is null then raise exception 'sesión no encontrada'; end if;

  update attendance_tokens set revoked = true where session_id = p_session and revoked = false;

  if p_mode = 'same_week' then
    if p_new_date is null then raise exception 'falta la nueva fecha'; end if;
    update course_sessions
      set session_date = p_new_date, status = 'scheduled', qr_active = false,
          attendance_open_at = null, attendance_close_at = null
      where id = p_session;
  else
    update course_sessions
      set session_date = session_date + 7,
          status = case when id = p_session then 'scheduled' else status end,
          qr_active = case when id = p_session then false else qr_active end,
          attendance_open_at = case when id = p_session then null else attendance_open_at end,
          attendance_close_at = case when id = p_session then null else attendance_close_at end
      where cycle_id = s.cycle_id and step_number >= s.step_number and session_date is not null;
    update course_cycles set certificate_delivery_date = certificate_delivery_date + 7
      where id = s.cycle_id and certificate_delivery_date is not null;
  end if;

  perform fn_audit('cancel_and_reschedule_session','course_sessions',p_session,p_reason,
    jsonb_build_object('mode',p_mode,'new_date',p_new_date));
end $$;

-- ---------------------------------------------------------------
-- F. Permisos de ejecución
-- ---------------------------------------------------------------
grant execute on function fn_is_speaker_of(int) to authenticated;
grant execute on function assign_step_speaker(int,uuid,text,text) to authenticated;
grant execute on function remove_step_speaker(int) to authenticated;
grant execute on function set_active_member(uuid,boolean) to authenticated;
grant execute on function cancel_and_reschedule_session(uuid,text,date,text) to authenticated;
