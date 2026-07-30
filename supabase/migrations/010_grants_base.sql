-- ================================================================
-- 010 — Grants base de PostgREST que NUNCA existieron.
--
-- Hallazgo (2026-07-30, navegando la app en producción como pastor):
-- ninguna tabla de public tenía GRANT para anon/authenticated/
-- service_role, así que TODA la capa de datos de la app devolvía
-- "permission denied" desde el día 1 — silenciado por el patrón
-- `const { data } = await ...; (data ?? [])` en todo el frontend.
-- Cada pantalla se veía "vacía" sin error visible.
--
-- RLS sigue siendo la barrera real (está habilitado en todas las
-- tablas con políticas explícitas): estos grants solo permiten que
-- el planificador llegue a evaluar esas políticas.
-- ================================================================
grant usage on schema public to anon, authenticated, service_role;
grant all privileges on all tables in schema public to service_role;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;
grant usage, select on all sequences in schema public to authenticated, service_role;

-- Que las tablas de futuras migraciones nazcan con permisos
alter default privileges in schema public grant all privileges on tables to service_role;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant select on tables to anon;
alter default privileges in schema public grant usage, select on sequences to authenticated, service_role;
