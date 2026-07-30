-- ============================================================
-- PRÓXIMO PASO · 007_pastor_enum.sql
-- Fase 3a (roles/permisos): agrega el valor 'pastor' al enum app_role.
-- Debe correrse SOLA, en su propia transacción/ejecución — Postgres no
-- permite usar un valor de enum nuevo en la misma transacción en que se
-- crea (mismo motivo por el que 005/006 se separaron).
-- ============================================================
alter type app_role add value if not exists 'pastor';
