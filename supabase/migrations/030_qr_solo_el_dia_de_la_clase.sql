-- ============================================================
-- 030 — El QR solo se abre el día de la clase (ajuste administrativo)
-- ============================================================
-- Visto el 18-sep en la auditoría con sesión de coordinador: el QR del Paso 1
-- del 4 de octubre se pudo abrir hoy. Con la pantalla abierta, cualquier
-- inscrito que escaneara quedaría con la asistencia de una clase que todavía
-- no ha pasado. Es el error más fácil de cometer probando "a ver cómo funciona"
-- y el más caro de deshacer.
--
-- No es una regla rígida: es un ajuste (`qr_solo_el_dia`, encendido). La
-- administración lo apaga desde Configuración si necesita probar con una
-- sesión de otro día. La fecha se compara en la zona horaria de la iglesia
-- (`church_timezone`, por defecto America/New_York).

insert into app_settings (key, value)
values ('qr_solo_el_dia', 'true'::jsonb)
on conflict (key) do nothing;

insert into app_settings (key, value)
values ('church_timezone', '"America/New_York"'::jsonb)
on conflict (key) do nothing;

do $mig$
declare def text;
begin
  def := pg_get_functiondef('open_attendance(uuid, integer)'::regprocedure);
  if position('qr_solo_el_dia' in def) > 0 then return; end if;  -- ya aplicada
  if position('ttl := coalesce(p_ttl_minutes' in def) = 0 then
    raise exception '030: no encontré el cálculo del ttl dentro de open_attendance';
  end if;
  def := replace(def,
    'ttl := coalesce(p_ttl_minutes',
    'if coalesce((select (value #>> ''{}'')::boolean from app_settings where key = ''qr_solo_el_dia''), true)'
    || ' and s.session_date is not null'
    || ' and s.session_date <> (now() at time zone coalesce((select value #>> ''{}'' from app_settings where key = ''church_timezone''), ''America/New_York''))::date'
    || ' then'
    || ' raise exception ''Esta clase es el %. El QR solo se abre ese mismo día, para que nadie quede con una asistencia de una clase que no ha pasado. Si necesitas probar, pide a la administración que apague "qr_solo_el_dia" en Configuración.'', to_char(s.session_date, ''DD/MM/YYYY'') using errcode = ''P0001'';'
    || ' end if;' || chr(10)
    || '  ttl := coalesce(p_ttl_minutes');
  execute def;
end $mig$;

-- Comprobación: que quedó, y que los permisos no cambiaron.
do $mig$
begin
  if position('qr_solo_el_dia' in pg_get_functiondef('open_attendance(uuid, integer)'::regprocedure)) = 0 then
    raise exception '030: la puerta no quedó dentro de open_attendance';
  end if;
  if not has_function_privilege('authenticated', 'open_attendance(uuid, integer)', 'execute') then
    raise exception '030: authenticated perdió open_attendance';
  end if;
  if has_function_privilege('anon', 'open_attendance(uuid, integer)', 'execute') then
    raise exception '030: open_attendance quedó abierta a anon';
  end if;
end $mig$;
