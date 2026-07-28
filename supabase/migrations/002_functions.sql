-- ============================================================
-- PRÓXIMO PASO · 002_functions.sql · Lógica de negocio en servidor
-- ============================================================

-- ---------- helpers de rol ----------
create or replace function fn_role() returns app_role
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select role from user_roles where user_id = auth.uid()
      order by case role when 'superadmin' then 4 when 'admin' then 3 when 'coordinator' then 2 else 1 end desc
      limit 1),
    'participant'::app_role);
$$;

create or replace function fn_is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select fn_role() in ('admin','superadmin');
$$;

create or replace function fn_is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select fn_role() in ('coordinator','admin','superadmin');
$$;

create or replace function fn_is_coordinator_of(p_cycle uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select fn_is_admin() or exists (
    select 1 from cycle_coordinators where cycle_id = p_cycle and user_id = auth.uid());
$$;

-- ---------- auditoría ----------
create or replace function fn_audit(p_action text, p_entity text, p_id uuid, p_reason text default null, p_details jsonb default null)
returns void language sql security definer set search_path = public as $$
  insert into audit_logs (actor_id, action, entity, entity_id, reason, details)
  values (auth.uid(), p_action, p_entity, p_id, p_reason, p_details);
$$;

-- ---------- Haversine (metros) ----------
create or replace function fn_haversine(lat1 double precision, lon1 double precision, lat2 double precision, lon2 double precision)
returns double precision language sql immutable as $$
  select 6371000 * 2 * asin(sqrt(
    power(sin(radians(lat2-lat1)/2),2) +
    cos(radians(lat1))*cos(radians(lat2))*power(sin(radians(lon2-lon1)/2),2)));
$$;

-- ---------- progreso derivado ----------
-- Devuelve el estado de los 4 pasos + test + dream team para una inscripción.
create or replace function get_progress(p_enrollment uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  e record; steps jsonb := '[]'::jsonb; s record;
  att boolean; prev_ok boolean := true;
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
  -- si el modo es external_url, un intento marcado completo (auto-declarado + validado por admin) cuenta
  select exists(select 1 from dream_team_forms f where f.enrollment_id = e.id and f.completed_at is not null) into dt_done;

  for s in select * from course_sessions cs where cs.cycle_id = e.cycle_id order by cs.step_number loop
    select exists(select 1 from attendance_records ar
      where ar.session_id = s.id and ar.user_id = e.user_id and ar.result = 'valid') into att;
    if s.step_number = 4 then
      unlocked := prev_ok and test_done and dt_done;
    else
      unlocked := prev_ok;
    end if;
    steps := steps || jsonb_build_object(
      'step', s.step_number, 'session_id', s.id, 'name', s.name,
      'date', s.session_date, 'start_time', s.start_time, 'end_time', s.end_time,
      'attended', att, 'unlocked', unlocked, 'status', s.status);
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

-- ---------- recalcular estado de inscripción + elegibilidad de certificado ----------
create or replace function fn_refresh_enrollment(p_enrollment uuid)
returns void language plpgsql security definer set search_path = public as $$
declare p jsonb; e record; auto_ok boolean; cname text; chname text; fullname text; cdate date;
begin
  select * into e from enrollments where id = p_enrollment;
  if e is null or e.status in ('withdrawn','cancelled','certified') then return; end if;
  p := get_progress(p_enrollment);
  if (p->>'eligible_for_certificate')::boolean then
    update enrollments set status='completed' where id=p_enrollment and status not in ('completed','certified');
    if not exists (select 1 from certificates where enrollment_id = p_enrollment) then
      select coalesce((select value #>> '{}' from app_settings where key='course_name'),'Próximo Paso') into cname;
      select coalesce((select value #>> '{}' from app_settings where key='church_name'),'Iglesia') into chname;
      select trim(pr.first_name||' '||coalesce(pr.middle_name||' ','')||pr.last_name) into fullname from profiles pr where pr.id=e.user_id;
      select coalesce(cc.certificate_delivery_date, current_date) into cdate from course_cycles cc where cc.id=e.cycle_id;
      select coalesce((select (value #>> '{}')::boolean from app_settings where key='certificate_auto_approve'), false) into auto_ok;
      insert into certificates (user_id, enrollment_id, status, full_name, course_name, church_name, completion_date)
      values (e.user_id, p_enrollment, case when auto_ok then 'pending_approval' else 'eligible' end, fullname, cname, chname, cdate);
    end if;
  elsif (p->>'steps_done')::int > 0 then
    update enrollments set status = case
      when (p->>'steps_done')::int >= 3 and not ((p->>'test_done')::boolean and (p->>'dream_team_done')::boolean)
        then 'requirements_pending' else 'in_progress' end
    where id=p_enrollment and status in ('enrolled','in_progress','requirements_pending','registered');
  end if;
end $$;

-- ---------- inscripción segura ----------
create or replace function enroll_in_cycle(p_cycle uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare c record; n int; eid uuid;
begin
  if auth.uid() is null then raise exception 'inicia sesión'; end if;
  select * into c from course_cycles where id=p_cycle and deleted_at is null;
  if c is null then raise exception 'ciclo no encontrado'; end if;
  if c.status <> 'registration_open' then raise exception 'las inscripciones de este ciclo no están abiertas'; end if;
  if c.registration_start is not null and now() < c.registration_start then raise exception 'las inscripciones aún no abren'; end if;
  if c.registration_end is not null and now() > c.registration_end then raise exception 'las inscripciones ya cerraron'; end if;
  if exists (select 1 from enrollments where user_id=auth.uid() and cycle_id=p_cycle) then
    raise exception 'ya estás inscrito en este ciclo'; end if;
  if c.capacity is not null then
    select count(*) into n from enrollments where cycle_id=p_cycle and status not in ('withdrawn','cancelled');
    if n >= c.capacity then raise exception 'el ciclo alcanzó su capacidad máxima'; end if;
  end if;
  insert into enrollments (user_id, cycle_id, status) values (auth.uid(), p_cycle, 'enrolled') returning id into eid;
  return eid;
end $$;

-- ---------- QR: abrir/cerrar asistencia y generar token ----------
create or replace function open_attendance(p_session uuid, p_ttl_minutes int default null)
returns table(token text, expires_at timestamptz) language plpgsql security definer set search_path = public as $$
declare s record; ttl int; tok text; exp timestamptz;
begin
  select cs.*, cc.id as cid into s from course_sessions cs join course_cycles cc on cc.id=cs.cycle_id where cs.id=p_session;
  if s is null then raise exception 'sesión no encontrada'; end if;
  if not fn_is_coordinator_of(s.cid) then raise exception 'no autorizado'; end if;
  ttl := coalesce(p_ttl_minutes, (select (value #>> '{}')::int from app_settings where key='default_token_ttl_min'), 15);
  update attendance_tokens set revoked=true where session_id=p_session and revoked=false;
  tok := encode(gen_random_bytes(32),'hex');
  exp := now() + make_interval(mins => ttl);
  insert into attendance_tokens (session_id, token, expires_at, created_by) values (p_session, tok, exp, auth.uid());
  update course_sessions set qr_active=true, status='open',
    attendance_open_at = coalesce(attendance_open_at, now()),
    attendance_close_at = greatest(coalesce(attendance_close_at, exp), exp)
  where id=p_session;
  perform fn_audit('open_attendance','course_sessions',p_session,null,jsonb_build_object('ttl_min',ttl));
  return query select tok, exp;
end $$;

create or replace function close_attendance(p_session uuid)
returns void language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  select cycle_id into cid from course_sessions where id=p_session;
  if cid is null then raise exception 'sesión no encontrada'; end if;
  if not fn_is_coordinator_of(cid) then raise exception 'no autorizado'; end if;
  update attendance_tokens set revoked=true where session_id=p_session and revoked=false;
  update course_sessions set qr_active=false, status='closed', attendance_close_at=now() where id=p_session;
  perform fn_audit('close_attendance','course_sessions',p_session);
end $$;

-- ---------- registro de asistencia (validación completa en servidor) ----------
create or replace function register_attendance(p_token text, p_lat double precision, p_lon double precision, p_accuracy double precision)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  t record; s record; c record; e record;
  dist double precision; radius int; minacc int;
  prev_pending boolean; res attendance_result; msg text;
  prog jsonb; step_unlocked boolean;
begin
  if auth.uid() is null then return jsonb_build_object('ok',false,'code','auth','message','Debes iniciar sesión.'); end if;

  select * into t from attendance_tokens where token = p_token;
  if t is null then return jsonb_build_object('ok',false,'code','expired_token','message','Este código QR no es válido.'); end if;
  select * into s from course_sessions where id = t.session_id;
  select * into c from course_cycles where id = s.cycle_id;

  if t.revoked or now() > t.expires_at or not s.qr_active then
    return jsonb_build_object('ok',false,'code','expired_token','message','El código QR venció. Pide al coordinador que genere uno nuevo.');
  end if;
  if s.attendance_close_at is not null and now() > s.attendance_close_at then
    return jsonb_build_object('ok',false,'code','session_closed','message','La ventana de asistencia de esta clase ya cerró.');
  end if;
  if s.attendance_open_at is not null and now() < s.attendance_open_at then
    return jsonb_build_object('ok',false,'code','session_closed','message','La asistencia de esta clase aún no está abierta.');
  end if;

  select * into e from enrollments where user_id=auth.uid() and cycle_id=s.cycle_id and status not in ('withdrawn','cancelled');
  if e is null then return jsonb_build_object('ok',false,'code','not_enrolled','message','No estás inscrito en este ciclo.'); end if;

  if exists (select 1 from attendance_records where session_id=s.id and user_id=auth.uid()) then
    return jsonb_build_object('ok',false,'code','duplicate','message','Tu asistencia a esta clase ya estaba registrada.');
  end if;

  -- prerrequisitos
  prog := get_progress(e.id);
  select (x->>'unlocked')::boolean into step_unlocked
    from jsonb_array_elements(prog->'steps') x where (x->>'step')::int = s.step_number;
  if not coalesce(step_unlocked,false) then
    return jsonb_build_object('ok',false,'code','prerequisite_pending','message','Aún tienes un paso o requisito anterior pendiente.');
  end if;

  -- geolocalización
  radius := coalesce(s.allowed_radius_meters, c.allowed_radius_meters, 100);
  minacc := coalesce(s.min_accuracy_meters, 100);
  if p_lat is null or p_lon is null then
    return jsonb_build_object('ok',false,'code','no_location','message','Necesitamos tu ubicación para registrar la asistencia. Activa el GPS e intenta de nuevo.');
  end if;
  if p_accuracy is not null and p_accuracy > minacc then
    return jsonb_build_object('ok',false,'code','low_accuracy','message','La precisión de tu GPS es insuficiente ('||round(p_accuracy)||' m). Sal a un lugar abierto e intenta de nuevo.');
  end if;
  dist := fn_haversine(p_lat, p_lon, coalesce(s.latitude, c.latitude), coalesce(s.longitude, c.longitude));
  if dist is null then
    return jsonb_build_object('ok',false,'code','error','message','La sesión no tiene ubicación configurada. Avisa al coordinador.');
  end if;
  if dist > radius then
    return jsonb_build_object('ok',false,'code','out_of_radius','message','Estás fuera del área permitida ('||round(dist)||' m). Acércate al lugar de la clase.');
  end if;

  -- registrar (no guardamos coordenadas exactas, solo distancia y precisión)
  insert into attendance_records (session_id, user_id, enrollment_id, method, result, distance_meters, accuracy_meters)
  values (s.id, auth.uid(), e.id, 'qr_geolocation', 'valid', round(dist::numeric,1), round(p_accuracy::numeric,1));
  perform fn_refresh_enrollment(e.id);
  return jsonb_build_object('ok',true,'code','valid','message','¡Asistencia registrada! Paso '||s.step_number||' completado.','step',s.step_number);
exception when unique_violation then
  return jsonb_build_object('ok',false,'code','duplicate','message','Tu asistencia a esta clase ya estaba registrada.');
end $$;

-- ---------- asistencia manual (staff, con motivo obligatorio) ----------
create or replace function manual_attendance(p_session uuid, p_user uuid, p_reason text, p_method attendance_method default 'manual_admin')
returns jsonb language plpgsql security definer set search_path = public as $$
declare s record; e record;
begin
  select * into s from course_sessions where id=p_session;
  if s is null then raise exception 'sesión no encontrada'; end if;
  if not fn_is_coordinator_of(s.cycle_id) then raise exception 'no autorizado'; end if;
  if p_reason is null or length(trim(p_reason)) < 5 then raise exception 'el motivo es obligatorio (mínimo 5 caracteres)'; end if;
  select * into e from enrollments where user_id=p_user and cycle_id=s.cycle_id and status not in ('withdrawn','cancelled');
  if e is null then raise exception 'la persona no está inscrita en este ciclo'; end if;
  insert into attendance_records (session_id, user_id, enrollment_id, method, result, recorded_by, manual_reason)
  values (p_session, p_user, e.id, coalesce(p_method,'manual_admin'), 'valid', auth.uid(), trim(p_reason))
  on conflict (session_id, user_id) do nothing;
  perform fn_audit('manual_attendance','attendance_records',p_session,p_reason,jsonb_build_object('user_id',p_user,'method',p_method));
  perform fn_refresh_enrollment(e.id);
  return jsonb_build_object('ok',true);
end $$;

create or replace function remove_attendance(p_session uuid, p_user uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare s record; eid uuid;
begin
  select * into s from course_sessions where id=p_session;
  if s is null or not fn_is_coordinator_of(s.cycle_id) then raise exception 'no autorizado'; end if;
  if p_reason is null or length(trim(p_reason)) < 5 then raise exception 'el motivo es obligatorio'; end if;
  select enrollment_id into eid from attendance_records where session_id=p_session and user_id=p_user;
  delete from attendance_records where session_id=p_session and user_id=p_user;
  perform fn_audit('remove_attendance','attendance_records',p_session,p_reason,jsonb_build_object('user_id',p_user));
  if eid is not null then perform fn_refresh_enrollment(eid); end if;
end $$;

-- ---------- test: completar intento y calcular resultado ----------
create or replace function complete_assessment_attempt(p_attempt uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a record; total int; dims jsonb;
begin
  select * into a from assessment_attempts where id=p_attempt and user_id=auth.uid();
  if a is null then raise exception 'intento no encontrado'; end if;
  if a.completed_at is not null then return jsonb_build_object('ok',true,'already',true); end if;

  select coalesce(sum(o.score),0),
         coalesce(jsonb_object_agg(dim, dscore) filter (where dim is not null), '{}'::jsonb)
  into total, dims
  from (
    select o.score, o.dimension as dim,
           sum(o.score) over (partition by o.dimension) as dscore
    from assessment_answers ans
    join assessment_options o on o.id = any(ans.option_ids)
    where ans.attempt_id = p_attempt
  ) o;

  update assessment_attempts set completed_at = now() where id = p_attempt;
  insert into assessment_results (attempt_id, user_id, total_score, dimension_scores)
  values (p_attempt, a.user_id, coalesce(total,0), coalesce(dims,'{}'::jsonb))
  on conflict (attempt_id) do update set total_score=excluded.total_score, dimension_scores=excluded.dimension_scores;
  if a.enrollment_id is not null then perform fn_refresh_enrollment(a.enrollment_id); end if;
  return jsonb_build_object('ok',true,'total',total,'dimensions',dims);
end $$;

-- ---------- dream team: marcar completo ----------
create or replace function complete_dream_team(p_form uuid)
returns void language plpgsql security definer set search_path = public as $$
declare f record;
begin
  select * into f from dream_team_forms where id=p_form and user_id=auth.uid();
  if f is null then raise exception 'formulario no encontrado'; end if;
  update dream_team_forms set completed_at=now() where id=p_form and completed_at is null;
  perform fn_refresh_enrollment(f.enrollment_id);
end $$;

-- ---------- excepción administrativa de requisitos ----------
create or replace function admin_override_requirement(p_enrollment uuid, p_kind text, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare e record; aid uuid; att uuid;
begin
  if not fn_is_admin() then raise exception 'no autorizado'; end if;
  if p_reason is null or length(trim(p_reason)) < 5 then raise exception 'el motivo es obligatorio'; end if;
  select * into e from enrollments where id=p_enrollment;
  if e is null then raise exception 'inscripción no encontrada'; end if;
  if p_kind = 'test' then
    select nullif(value #>> '{}','null')::uuid into aid from app_settings where key='assessment_active_id';
    if aid is null then select id into aid from assessments where deleted_at is null order by created_at desc limit 1; end if;
    insert into assessment_attempts (assessment_id, user_id, enrollment_id, completed_at)
    values (aid, e.user_id, e.id, now())
    on conflict (assessment_id, user_id, enrollment_id) do update set completed_at = coalesce(assessment_attempts.completed_at, now());
  elsif p_kind = 'dream_team' then
    insert into dream_team_forms (user_id, enrollment_id, completed_at, contact_consent)
    values (e.user_id, e.id, now(), false)
    on conflict (enrollment_id) do update set completed_at = coalesce(dream_team_forms.completed_at, now());
  else
    raise exception 'tipo de excepción desconocido';
  end if;
  perform fn_audit('override_requirement','enrollments',p_enrollment,p_reason,jsonb_build_object('kind',p_kind));
  perform fn_refresh_enrollment(p_enrollment);
end $$;

-- ---------- certificados ----------
create or replace function approve_certificate(p_cert uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not fn_is_admin() then raise exception 'no autorizado'; end if;
  update certificates set status='issued', approved_by=auth.uid(), issued_at=now()
  where id=p_cert and status in ('eligible','pending_approval');
  update enrollments set status='certified'
  where id=(select enrollment_id from certificates where id=p_cert);
  perform fn_audit('approve_certificate','certificates',p_cert);
end $$;

create or replace function revoke_certificate(p_cert uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not fn_is_admin() then raise exception 'no autorizado'; end if;
  if p_reason is null or length(trim(p_reason)) < 5 then raise exception 'el motivo es obligatorio'; end if;
  update certificates set status='revoked', revoked_reason=trim(p_reason) where id=p_cert;
  perform fn_audit('revoke_certificate','certificates',p_cert,p_reason);
end $$;

-- verificación pública (anónima): solo datos mínimos
create or replace function verify_certificate(p_code text)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when c.id is null then jsonb_build_object('found',false)
    else jsonb_build_object('found',true,'name',c.full_name,'course',c.course_name,
      'date',c.completion_date,'valid', c.status not in ('revoked'))
  end
  from (select 1) x left join certificates c on c.verify_code = p_code;
$$;

-- ---------- gestión de roles (solo superadmin) ----------
create or replace function set_user_role(p_user uuid, p_role app_role)
returns void language plpgsql security definer set search_path = public as $$
begin
  if fn_role() <> 'superadmin' then raise exception 'solo el superadministrador puede asignar roles'; end if;
  delete from user_roles where user_id=p_user and role <> 'participant';
  if p_role <> 'participant' then
    insert into user_roles (user_id, role, assigned_by) values (p_user, p_role, auth.uid())
    on conflict (user_id, role) do nothing;
  end if;
  perform fn_audit('set_role','user_roles',p_user,null,jsonb_build_object('role',p_role));
end $$;

-- ---------- sugerencia de fecha de certificación ----------
-- 5º domingo del mes de la última sesión; si no existe, 1º domingo del mes siguiente.
create or replace function suggest_certificate_date(p_cycle uuid)
returns date language plpgsql stable security definer set search_path = public as $$
declare last_date date; base date; d date; sundays int := 0; fifth date;
begin
  select max(session_date) into last_date from course_sessions where cycle_id=p_cycle;
  if last_date is null then return null; end if;
  base := date_trunc('month', last_date)::date;
  d := base;
  while d < (base + interval '1 month')::date loop
    if extract(dow from d) = 0 then sundays := sundays + 1; if sundays = 5 then fifth := d; end if; end if;
    d := d + 1;
  end loop;
  if fifth is not null and fifth >= last_date then return fifth; end if;
  d := (base + interval '1 month')::date;
  while extract(dow from d) <> 0 loop d := d + 1; end loop;
  return d;
end $$;

-- permisos de ejecución
revoke execute on all functions in schema public from public, anon;
grant execute on function verify_certificate(text) to anon, authenticated;
grant execute on function fn_role() to authenticated;
grant execute on function fn_is_admin() to authenticated;
grant execute on function fn_is_staff() to authenticated;
grant execute on function fn_is_coordinator_of(uuid) to authenticated;
grant execute on function get_progress(uuid) to authenticated;
grant execute on function enroll_in_cycle(uuid) to authenticated;
grant execute on function open_attendance(uuid,int) to authenticated;
grant execute on function close_attendance(uuid) to authenticated;
grant execute on function register_attendance(text,double precision,double precision,double precision) to authenticated;
grant execute on function manual_attendance(uuid,uuid,text,attendance_method) to authenticated;
grant execute on function remove_attendance(uuid,uuid,text) to authenticated;
grant execute on function complete_assessment_attempt(uuid) to authenticated;
grant execute on function complete_dream_team(uuid) to authenticated;
grant execute on function admin_override_requirement(uuid,text,text) to authenticated;
grant execute on function approve_certificate(uuid) to authenticated;
grant execute on function revoke_certificate(uuid,text) to authenticated;
grant execute on function set_user_role(uuid,app_role) to authenticated;
grant execute on function suggest_certificate_date(uuid) to authenticated;
grant execute on function fn_refresh_enrollment(uuid) to authenticated;

-- ---------- corrección: cálculo de resultados (versión final) ----------
create or replace function complete_assessment_attempt(p_attempt uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a record; total int := 0; scale_total int := 0; dims jsonb := '{}'::jsonb;
begin
  select * into a from assessment_attempts where id=p_attempt and user_id=auth.uid();
  if a is null then raise exception 'intento no encontrado'; end if;
  if a.completed_at is not null then return jsonb_build_object('ok',true,'already',true); end if;

  select coalesce(sum(o.score),0) into total
  from assessment_answers ans join assessment_options o on o.id = any(ans.option_ids)
  where ans.attempt_id = p_attempt;

  select coalesce(sum(ans.scale_value),0) into scale_total
  from assessment_answers ans where ans.attempt_id = p_attempt and ans.scale_value is not null;

  select coalesce(jsonb_object_agg(q.dimension, q.s),'{}'::jsonb) into dims
  from (select o.dimension, sum(o.score) as s
        from assessment_answers ans join assessment_options o on o.id = any(ans.option_ids)
        where ans.attempt_id = p_attempt and o.dimension is not null
        group by o.dimension) q;

  total := total + scale_total;
  update assessment_attempts set completed_at = now() where id = p_attempt;
  insert into assessment_results (attempt_id, user_id, total_score, dimension_scores)
  values (p_attempt, a.user_id, total, dims)
  on conflict (attempt_id) do update set total_score=excluded.total_score, dimension_scores=excluded.dimension_scores;
  if a.enrollment_id is not null then perform fn_refresh_enrollment(a.enrollment_id); end if;
  return jsonb_build_object('ok',true,'total',total,'dimensions',dims);
end $$;
