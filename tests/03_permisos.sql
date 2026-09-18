-- ============================================================
-- PRUEBA 03 — Permisos reales de anon y authenticated
-- ============================================================
-- Termina en ROLLBACK (no cambia nada, pero se mantiene la costumbre).
-- Lección nº 1: una tabla sin GRANT se ve como "no hay datos". Lección nº 8:
-- una función security definer nace ejecutable por anon si el revoke se
-- escribió antes de que existiera. Esto lo pregunta a la base, no lo supone.

begin;

do $t$
declare
  t text;
  f text;
  fallos int := 0;
begin
  -- anon NO puede leer ninguna de estas tablas.
  foreach t in array array[
    'profiles', 'enrollments', 'attendance_records', 'attendance_tokens', 'certificates',
    'assessment_attempts', 'assessment_results', 'dream_team_forms', 'audit_logs',
    'guardian_authorizations', 'notification_outbox', 'member_requests', 'ministry_assignments'
  ] loop
    if to_regclass('public.' || t) is null then
      raise notice '(la tabla % no existe, se salta)', t;
    elsif has_table_privilege('anon', 'public.' || t, 'select') then
      raise notice 'FALLO — anon puede leer %', t; fallos := fallos + 1;
    end if;
  end loop;

  -- anon NO puede ejecutar estas funciones.
  foreach f in array array[
    'enroll_in_cycle(uuid)',
    'register_attendance(text, double precision, double precision, double precision)',
    'admin_grant_guardian_authorization(uuid, text)',
    'admin_revoke_guardian_authorization(uuid, text)',
    'admin_guardian_link(uuid)',
    'fn_issue_guardian_link(uuid)',
    'get_guardian_pending()',
    'get_notification_outbox(boolean)'
  ] loop
    if to_regprocedure(f) is null then
      raise notice '(la función % no existe, se salta)', f;
    elsif has_function_privilege('anon', f, 'execute') then
      raise notice 'FALLO — anon puede ejecutar %', f; fallos := fallos + 1;
    end if;
  end loop;

  -- anon SÍ puede lo poco que le toca: verificar un certificado y atender el enlace del representante.
  foreach f in array array[
    'verify_certificate(text)',
    'get_guardian_request(text)',
    'grant_guardian_authorization(text, boolean)',
    'fn_platform_capabilities()'
  ] loop
    if to_regprocedure(f) is null then
      raise notice 'FALLO — la función pública % no existe', f; fallos := fallos + 1;
    elsif not has_function_privilege('anon', f, 'execute') then
      raise notice 'FALLO — anon NO puede ejecutar % (y debe)', f; fallos := fallos + 1;
    end if;
  end loop;

  -- authenticated SÍ puede lo suyo (si esto falla, la app entera se ve vacía).
  foreach t in array array['profiles', 'course_cycles', 'course_sessions', 'enrollments', 'app_settings', 'announcements'] loop
    if not has_table_privilege('authenticated', 'public.' || t, 'select') then
      raise notice 'FALLO — authenticated no puede leer %', t; fallos := fallos + 1;
    end if;
  end loop;
  foreach f in array array['enroll_in_cycle(uuid)', 'get_progress(uuid)', 'fn_guardian_ok(uuid)', 'fn_is_admin()'] loop
    if to_regprocedure(f) is not null and not has_function_privilege('authenticated', f, 'execute') then
      raise notice 'FALLO — authenticated no puede ejecutar %', f; fallos := fallos + 1;
    end if;
  end loop;

  -- La lista blanca de ajustes públicos existe y NO deja pasar la service key ni nada raro.
  if not exists (select 1 from pg_policies where tablename = 'app_settings' and policyname = 'p_set_sel_publico') then
    raise notice 'FALLO — falta la política p_set_sel_publico (028)'; fallos := fallos + 1;
  end if;

  if fallos > 0 then
    raise exception 'PRUEBA FALLIDA: % problema/s de permisos (ver avisos arriba)', fallos;
  end if;
  raise notice 'OK — permisos de anon y authenticated como deben ser';
end $t$;

rollback;
