-- ============================================================
-- 031 — anon no toca ninguna tabla (salvo la lista blanca de ajustes)
-- ============================================================
-- Al correr `tests/03_permisos.sql` contra producción (18-sep) salió que anon
-- tenía SELECT a nivel de tabla en profiles, enrollments, attendance_records,
-- certificates, audit_logs y seis más: herencia del GRANT amplio con el que se
-- arregló la capa de datos muerta (lección 1). No filtraba nada porque las
-- políticas RLS llaman a funciones que anon no puede ejecutar y la consulta
-- revienta antes de devolver filas; pero eso es seguridad por accidente: la
-- primera política que no llame a esas funciones dejaría pasar datos a
-- cualquiera sin sesión.
--
-- Regla desde hoy: **anon no tiene permisos sobre ninguna tabla** de public.
-- Lo público sale por funciones `security definer` (verify_certificate,
-- get_guardian_request, grant_guardian_authorization, fn_platform_capabilities)
-- y por la lista blanca de `app_settings` (política p_set_sel_publico, 028).

revoke all privileges on all tables in schema public from anon;
revoke all privileges on all sequences in schema public from anon;
grant select on public.app_settings to anon;

-- Que las tablas que se creen después tampoco nazcan abiertas a anon.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;

-- Comprobación: lo público sigue funcionando y lo privado ya ni se ve.
do $mig$
declare v jsonb; n int;
begin
  set local role anon;
  if not has_table_privilege('anon', 'public.app_settings', 'select') then
    raise exception '031: anon perdió la lista blanca de app_settings';
  end if;
  select count(*) into n from app_settings;             -- la política filtra a la lista blanca
  if n = 0 then raise exception '031: la portada se quedó sin ajustes públicos'; end if;
  v := fn_platform_capabilities();
  v := get_guardian_request('no-existe');
  if v->>'estado' <> 'no_existe' then raise exception '031: get_guardian_request cambió de comportamiento'; end if;
  reset role;
  if not has_function_privilege('anon', 'verify_certificate(text)', 'execute') then raise exception '031: anon perdió verify_certificate'; end if;
  if has_table_privilege('anon', 'public.profiles', 'select') then raise exception '031: anon sigue leyendo profiles'; end if;
  if has_table_privilege('anon', 'public.certificates', 'select') then raise exception '031: anon sigue leyendo certificates'; end if;
  if has_table_privilege('anon', 'public.audit_logs', 'select') then raise exception '031: anon sigue leyendo audit_logs'; end if;
  if not has_table_privilege('authenticated', 'public.profiles', 'select') then raise exception '031: authenticated perdió profiles'; end if;
end $mig$;
