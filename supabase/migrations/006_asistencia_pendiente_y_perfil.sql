-- ============================================================
-- PRÓXIMO PASO · 006_asistencia_pendiente_y_perfil.sql
-- (1) Flujo de "solicitar confirmación de asistencia" cuando el
--     participante olvidó marcarla y la ventana ya cerró: deja un
--     mensaje, queda "pendiente de revisión", y el coordinador del
--     ciclo / admin / superadmin la aprueba o rechaza desde
--     /admin/asistencia (misma pantalla de corrección manual).
-- (2) Contacto de emergencia (nombre + teléfono) en el perfil.
-- (3) Se quitan "estado civil" y "sexo" del formulario Dream Team
--     (decisión de Jesús 2026-07-28: no son necesarios para la
--     iglesia). Los datos que si hacían falta (fecha de nacimiento)
--     ya existían en profiles desde v1.
-- Requiere que 005_attendance_enum.sql ya se haya ejecutado y
-- confirmado antes, en una consulta aparte (no se puede usar un
-- valor de enum nuevo en la misma transacción en que se crea).
-- No modifica 001/002/003/004: solo agrega/reemplaza.
-- ============================================================

-- ---------- Parte 1 · contacto de emergencia ----------
alter table profiles add column if not exists emergency_contact_name text;
alter table profiles add column if not exists emergency_contact_phone text;

-- ---------- Parte 2 · quitar estado civil y sexo del Dream Team ----------
alter table dream_team_forms drop column if exists marital_status;
alter table dream_team_forms drop column if exists gender;

-- ---------- Parte 3 · solicitud de confirmación de asistencia ----------
alter table attendance_records add column if not exists request_note text;

-- get_progress: mismo cuerpo que 002_functions.sql, agregando 'pending'
-- (true si hay una solicitud de este participante para esa sesión
-- esperando revisión) a cada paso.
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
  -- solo dueño o staff
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
    if s.step_number = 4 then
      unlocked := prev_ok and test_done and dt_done;
    else
      unlocked := prev_ok;
    end if;
    steps := steps || jsonb_build_object(
      'step', s.step_number, 'session_id', s.id, 'name', s.name,
      'date', s.session_date, 'start_time', s.start_time, 'end_time', s.end_time,
      'attended', att, 'pending', pend, 'unlocked', unlocked, 'status', s.status);
    prev_ok := prev_ok and att;
  end loop;

  return jsonb_build_object(
    'enrollment_id', e.id, 'cycle_id', e.cycle_id, 'status', e.status,
    'steps', steps,
    'steps_done', (select count(*) from attendance_records ar join course_sessions cs on cs.id=ar.session_id
                   where ar.user_id=e.user_id and cs.cycle_id=e.cycle_id and ar.result='valid'),
    'test_unlocked', (steps->2->>'attended')::boolean is true,
    'test_done', test_done,
    'dream_team_unlocked', (steps->2->>'attended')::boolean is true,
    'dream_team_done', dt_done,
    'eligible_for_certificate',
      (select count(*)=4 from attendance_records ar join course_sessions cs on cs.id=ar.session_id
        where ar.user_id=e.user_id and cs.cycle_id=e.cycle_id and ar.result='valid')
      and test_done and dt_done
  );
end $$;
grant execute on function get_progress(uuid) to authenticated;

-- Participante: pide confirmación manual de una clase que ya pasó y no marcó.
-- Ventana: hasta que abra la siguiente sesión del ciclo; si es la última
-- (Paso 4) o no hay siguiente fecha configurada, el límite es 30 días
-- después de la fecha de esa clase. Pasado ese plazo, solo el staff puede
-- agregarla manualmente (sin límite de tiempo, como ya funciona hoy con
-- manual_attendance).
create or replace function request_attendance_approval(p_session uuid, p_message text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s record; e record; nxt record; prog jsonb; step_unlocked boolean; deadline timestamptz;
begin
  if auth.uid() is null then return jsonb_build_object('ok',false,'message','Debes iniciar sesión.'); end if;
  if p_message is null or length(trim(p_message)) < 5 then
    return jsonb_build_object('ok',false,'message','Cuéntanos brevemente qué pasó (mínimo 5 caracteres).');
  end if;

  select * into s from course_sessions where id = p_session;
  if s is null then return jsonb_build_object('ok',false,'message','Clase no encontrada.'); end if;

  select * into e from enrollments where user_id=auth.uid() and cycle_id=s.cycle_id and status not in ('withdrawn','cancelled');
  if e is null then return jsonb_build_object('ok',false,'message','No estás inscrito en este ciclo.'); end if;

  if exists (select 1 from attendance_records where session_id=s.id and user_id=auth.uid() and result='valid') then
    return jsonb_build_object('ok',false,'message','Tu asistencia a esta clase ya estaba confirmada.');
  end if;
  if exists (select 1 from attendance_records where session_id=s.id and user_id=auth.uid() and result='pending_approval') then
    return jsonb_build_object('ok',false,'message','Ya enviaste una solicitud para esta clase. Espera a que la revisen.');
  end if;

  -- mismos prerrequisitos que register_attendance
  prog := get_progress(e.id);
  select (x->>'unlocked')::boolean into step_unlocked
    from jsonb_array_elements(prog->'steps') x where (x->>'step')::int = s.step_number;
  if not coalesce(step_unlocked,false) then
    return jsonb_build_object('ok',false,'message','Aún tienes un paso o requisito anterior pendiente.');
  end if;

  select * into nxt from course_sessions where cycle_id = s.cycle_id and step_number = s.step_number + 1;
  deadline := coalesce(nxt.attendance_open_at,
    case when s.session_date is not null then (s.session_date + interval '30 days') else null end);
  if deadline is not null and now() > deadline then
    return jsonb_build_object('ok',false,'message','Ya pasó el plazo para pedir la confirmación de esta clase. Escríbele a la iglesia por Contacto.');
  end if;

  insert into attendance_records (session_id, user_id, enrollment_id, method, result, request_note)
  values (s.id, auth.uid(), e.id, 'self_reported', 'pending_approval', trim(p_message))
  on conflict (session_id, user_id) do update
    set method='self_reported', result='pending_approval', request_note=trim(p_message);

  return jsonb_build_object('ok',true,'message','Tu solicitud fue enviada. El coordinador o un administrador la revisará pronto.');
end $$;
grant execute on function request_attendance_approval(uuid,text) to authenticated;

-- Staff (coordinador del ciclo, admin o superadmin — mismo permiso que
-- manual_attendance/remove_attendance): aprueba la solicitud.
create or replace function approve_attendance_request(p_id uuid, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record;
begin
  select * into r from attendance_records where id = p_id;
  if r is null then raise exception 'solicitud no encontrada'; end if;
  if not fn_is_coordinator_of((select cycle_id from course_sessions where id=r.session_id)) then
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
grant execute on function approve_attendance_request(uuid,text) to authenticated;

-- Staff: rechaza la solicitud (se borra el registro pendiente; el motivo
-- queda en auditoría). El participante puede volver a marcar por QR si
-- la ventana de la clase sigue abierta, o el staff puede agregarla
-- manualmente después si corresponde.
create or replace function reject_attendance_request(p_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record;
begin
  select * into r from attendance_records where id = p_id;
  if r is null then raise exception 'solicitud no encontrada'; end if;
  if not fn_is_coordinator_of((select cycle_id from course_sessions where id=r.session_id)) then
    raise exception 'no autorizado';
  end if;
  if r.result <> 'pending_approval' then raise exception 'esta solicitud ya fue resuelta'; end if;
  if p_reason is null or length(trim(p_reason)) < 5 then raise exception 'el motivo es obligatorio (mínimo 5 caracteres)'; end if;
  perform fn_audit('reject_attendance_request','attendance_records', p_id, p_reason,
    jsonb_build_object('user_id', r.user_id, 'session_id', r.session_id));
  delete from attendance_records where id = p_id;
  return jsonb_build_object('ok',true);
end $$;
grant execute on function reject_attendance_request(uuid,text) to authenticated;
