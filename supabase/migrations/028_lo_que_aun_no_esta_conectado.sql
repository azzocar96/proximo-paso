-- ============================================================
-- 028 — Decir "todavía no" en vez de fallar en silencio
-- ============================================================
-- Petición de Jesús (17-sep-2026): esta plataforma va a migrar a su propio
-- dominio, su propio repositorio y sus propias herramientas cuando la
-- organización la reciba. Hasta entonces hay funciones que dependen de cosas
-- que aún no están conectadas. Lo que NO puede pasar es que la persona pulse
-- un botón y no ocurra nada, o peor: que la app le diga que sí y luego no.
--
-- La solución es una lista de "capacidades": interruptores que dicen qué está
-- conectado de verdad. La app los lee y, cuando algo falta, lo dice con todas
-- sus letras y explica qué hacer mientras tanto.
--
-- Hoy hay una sola apagada y es la que más duele: el correo de salida. De ella
-- dependen recuperar la contraseña, confirmar un cambio de correo y los avisos
-- al representante de un menor.

insert into app_settings (key, value)
select 'email_outbound_ready', 'false'::jsonb
where not exists (select 1 from app_settings where key = 'email_outbound_ready');

insert into app_settings (key, value)
select 'capability_notes', jsonb_build_object(
  'email_outbound',
  'La iglesia todavía no tiene un correo de salida propio conectado. Mientras tanto, el equipo resuelve a mano lo que dependa de un correo: escríbenos y te ayudamos en el momento.'
)
where not exists (select 1 from app_settings where key = 'capability_notes');

-- Lista blanca de la 023: para que la app pueda leer esto SIN sesión (la
-- pantalla de recuperar contraseña se abre sin haber entrado).
drop policy if exists p_set_sel_publico on app_settings;
create policy p_set_sel_publico on app_settings for select to anon
using (key in (
  'brand',
  'capability_notes',
  'church_address',
  'church_contact',
  'church_name',
  'course_name',
  'email_outbound_ready',
  'privacy_policy',
  'program_objectives',
  'program_schedule',
  'step_names'
));

-- Una función para preguntarlo de un tirón, sin sesión.
create or replace function fn_platform_capabilities()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_mail boolean;
begin
  begin
    select nullif(value #>> '{}','')::boolean into v_mail
      from app_settings where key = 'email_outbound_ready';
  exception when others then v_mail := null;
  end;
  return jsonb_build_object('email_outbound', coalesce(v_mail, false));
end $$;
revoke execute on function fn_platform_capabilities() from public;
grant execute on function fn_platform_capabilities() to anon, authenticated;

do $mig$
begin
  if (fn_platform_capabilities()->>'email_outbound') is null then
    raise exception '028: fn_platform_capabilities no devuelve email_outbound';
  end if;
  if not has_function_privilege('anon', 'fn_platform_capabilities()', 'execute') then
    raise exception '028: la pantalla de recuperar contraseña no podría leer las capacidades';
  end if;
end $mig$;
