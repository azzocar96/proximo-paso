-- ============================================================
-- 020 — Dos funciones no encontraban pgcrypto (bug de raíz, desde la 002)
-- ============================================================
-- Descubierto al probar la apertura del QR simulando a una servidora:
--
--   ERROR: function gen_random_bytes(integer) does not exist
--
-- `gen_random_bytes` (pgcrypto) vive en el esquema `extensions`, no en
-- `public`. Las funciones `security definer` fijan su propio `search_path`, y
-- desde la migración 002 dos de ellas lo tenían en solo `public`:
--
--   · open_attendance      → genera el token del QR. **Abrir la asistencia
--                            nunca funcionó.**
--   · fn_refresh_enrollment→ inserta la fila de `certificates`, cuya columna
--                            `verify_code` tiene un DEFAULT que llama a
--                            gen_random_bytes. **Emitir un certificado nunca
--                            funcionó.**
--
-- Es un fallo silencioso del tipo peor: no se nota hasta el día que se usa,
-- y ese día es el día de la primera clase o el de la entrega de certificados.
--
-- Regla que deja: cuando una función security definer fija `search_path`, hay
-- que incluir TODOS los esquemas que usa. En Supabase, cualquier cosa de
-- pgcrypto o uuid-ossp vive en `extensions`.

alter function open_attendance(uuid, int) set search_path = public, extensions;
alter function fn_refresh_enrollment(uuid) set search_path = public, extensions;
