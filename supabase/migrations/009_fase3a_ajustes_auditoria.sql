-- ================================================================
-- 009 — Ajustes de la auditoría post-Fase 3a
-- (correr después de 007 y 008)
--
-- A. fn_role(): el rol legacy 'admin' (inerte) ya no pesa por encima
--    de 'coordinator'. Antes, una cuenta legacy con {admin, coordinator}
--    en user_roles devolvía 'admin' y perdía también su acceso de
--    coordinador. Ahora 'admin' pesa 0 (por debajo de participant).
-- B. Acceso del orador a su bandeja: el orador puede aprobar/rechazar
--    solicitudes por RPC desde 008, pero ninguna política le dejaba
--    LEER las solicitudes pendientes de su paso ni el nombre del
--    solicitante. Se agregan 2 políticas SELECT acotadas.
-- C. cancel_and_reschedule_session: en modo next_week, si la sesión
--    cancelada no tenía fecha, el update la saltaba (por el filtro
--    session_date is not null) y no se reseteaba su status/QR.
-- ================================================================

-- ---------------------------------------------------------------
-- A. fn_role con peso corregido para 'admin' legacy
-- ---------------------------------------------------------------
create or replace function fn_role() returns app_role
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select role from user_roles where user_id = auth.uid()
      order by case role
        when 'superadmin' then 5
        when 'pastor' then 5
        when 'coordinator' then 2
        when 'participant' then 1
        else 0 end desc  -- 'admin' legacy: nunca gana
      limit 1),
    'participant'::app_role);
$$;

-- ---------------------------------------------------------------
-- B. Lectura acotada para oradores
-- ---------------------------------------------------------------
-- ¿El usuario actual es orador del paso de esta sesión?
create or replace function fn_is_speaker_of_session(p_session uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from course_sessions cs
    join step_speakers ss on ss.step_number = cs.step_number
    where cs.id = p_session and ss.user_id = auth.uid());
$$;

-- ¿El usuario actual es orador y p_profile tiene registros de
-- asistencia (incl. pendientes) en sesiones de su paso?
create or replace function fn_speaker_can_see_profile(p_profile uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from attendance_records ar
    join course_sessions cs on cs.id = ar.session_id
    join step_speakers ss on ss.step_number = cs.step_number
    where ss.user_id = auth.uid() and ar.user_id = p_profile);
$$;

create policy p_att_sel_speaker on attendance_records for select
  using (fn_is_speaker_of_session(session_id));

create policy p_prof_sel_speaker on profiles for select
  using (fn_speaker_can_see_profile(id));

grant execute on function fn_is_speaker_of_session(uuid) to authenticated;
grant execute on function fn_speaker_can_see_profile(uuid) to authenticated;

-- ---------------------------------------------------------------
-- C. cancel_and_reschedule_session — edge de sesión sin fecha
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
    -- edge: la sesión cancelada no tenía fecha — resetear su estado igual
    update course_sessions
      set status = 'scheduled', qr_active = false,
          attendance_open_at = null, attendance_close_at = null
      where id = p_session and session_date is null;
    update course_cycles set certificate_delivery_date = certificate_delivery_date + 7
      where id = s.cycle_id and certificate_delivery_date is not null;
  end if;

  perform fn_audit('cancel_and_reschedule_session','course_sessions',p_session,p_reason,
    jsonb_build_object('mode',p_mode,'new_date',p_new_date));
end $$;
