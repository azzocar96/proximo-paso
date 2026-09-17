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
