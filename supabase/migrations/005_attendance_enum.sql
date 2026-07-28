-- ============================================================
-- PRÓXIMO PASO · 005_attendance_enum.sql
-- Nuevos valores de enum para el flujo de "solicitar confirmación
-- de asistencia" (participante que olvidó marcarla y ya se le cerró
-- la ventana). Va en su propia migración porque Postgres no permite
-- usar un valor de enum recién agregado dentro de la MISMA transacción
-- en que se agregó — por eso esta consulta se corre sola, antes que
-- 006_asistencia_pendiente_y_perfil.sql.
-- ============================================================
alter type attendance_result add value if not exists 'pending_approval';
alter type attendance_method add value if not exists 'self_reported';
