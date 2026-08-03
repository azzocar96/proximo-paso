-- ============================================================
-- 023 — Lo público vuelve a ser público
-- ============================================================
-- Dos cosas que la app enseña a gente SIN sesión estaban rotas. Las dos se
-- vieron navegando la app en vivo, no leyendo código: la página
-- https://proximo-paso.netlify.app/privacidad seguía diciendo "pendiente de
-- redacción" horas después de haber cargado la política de verdad en
-- `app_settings`.
--
-- 1) `app_settings` solo se puede leer con sesión iniciada.
--    La policy de la 003 es `using (auth.uid() is not null)`. La landing y la
--    página de privacidad leen los ajustes sin sesión, no reciben nada, y el
--    `catch {}` del código las deja con su texto de reserva. Resultado: la
--    política de privacidad que cada persona ACEPTA al registrarse era, para
--    ella, un texto que decía que todavía no estaba escrita. Y cualquier cambio
--    que el administrador hiciera en Configuración no se veía en la portada.
--
-- 2) `verify_certificate` dejó de ser ejecutable por `anon`.
--    Lo rompí yo en la 021: el barrido que cerró 22 funciones security definer
--    solo dejó fuera `fn_registration_policy`. Pero `/verificar/<código>` existe
--    justamente para que alguien de fuera —sin cuenta— compruebe un
--    certificado. Sin este permiso, todo código válido responde "certificado no
--    encontrado". Nadie lo ha notado porque aún no hay certificados emitidos.
--
-- Nada de esto abre datos nuevos: los ajustes que se exponen son los que ya
-- salen impresos en la portada, y `verify_certificate` devuelve solo nombre,
-- curso y fecha, que es lo que el propio certificado lleva escrito.

-- ---------- 1. Ajustes públicos ----------
-- Lista blanca por FILA (que es como está guardado esto: una fila por clave).
-- Lo que NO entra aquí sigue necesitando sesión: el test, los certificados,
-- las firmas, la política de menores y todo lo demás.
grant select on app_settings to anon;

drop policy if exists p_set_sel_publico on app_settings;
create policy p_set_sel_publico on app_settings for select to anon
using (key in (
  'brand',
  'church_address',
  'church_contact',
  'church_name',
  'course_name',
  'privacy_policy',
  'program_objectives',
  'program_schedule',
  'step_names'
));

-- ---------- 2. Verificación pública de certificados ----------
grant execute on function verify_certificate(text) to anon;

-- ---------- 3. Comprobación: si algo de esto no quedó, la migración falla ----------
do $mig$
declare
  n int;
begin
  if not has_function_privilege('anon', 'verify_certificate(text)', 'execute') then
    raise exception '023: anon sigue sin poder ejecutar verify_certificate';
  end if;
  if not has_table_privilege('anon', 'app_settings', 'select') then
    raise exception '023: anon sigue sin select sobre app_settings';
  end if;
  select count(*) into n from pg_policies
   where schemaname = 'public' and tablename = 'app_settings'
     and policyname = 'p_set_sel_publico';
  if n <> 1 then
    raise exception '023: no quedó la policy p_set_sel_publico';
  end if;
end $mig$;
