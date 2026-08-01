-- ============================================================
-- 018 — Un valor nuevo para el enum de solicitudes: 'director'
-- ============================================================
-- Va SOLA en su propia migración por una restricción de Postgres: un valor de
-- enum recién creado no se puede usar en la misma transacción en que nace.
-- Es el mismo motivo por el que las migraciones 005 y 007 fueron sueltas.
alter type member_request_kind add value if not exists 'director';
