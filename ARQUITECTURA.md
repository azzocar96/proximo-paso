# ARQUITECTURA — App "Próximo Paso"
Fecha: 2026-07-18 · Estado: implementada (v1, build verificado 2026-07-19)

## 1. Resumen de análisis
Curso de 4 pasos con prerrequisitos estrictos + test + Dream Team entre Paso 3 y 4, certificado al final y vinculación ministerial. Lo crítico de seguridad: asistencia (QR firmado + geo validada en servidor), RLS por rol, y privacidad de resultados del test. Toda regla de negocio ambigua se vuelve `app_settings`.

## 2. Arquitectura
- **Next.js 14 (App Router, TS)** — SSR + Server Actions para toda mutación sensible.
- **Supabase**: Auth (email+password, verificación), Postgres con **RLS en todas las tablas**, Storage (fotos, imágenes, certificados PDF).
- **Validación en servidor**: la lógica de asistencia y progreso vive en **funciones SQL SECURITY DEFINER** (RPC) — el navegador nunca decide.
- **Tokens QR**: fila en `attendance_tokens` con `token` aleatorio (32 bytes, opaco), `expires_at`, `session_id`, revocable. El QR codifica solo `/a/{token}`.
- **Certificados**: PDF generado en servidor (pdf-lib) bajo demanda; verificación pública por `verify_code` vía `/verificar/[codigo]` que usa RPC pública limitada (nombre, curso, fecha, estado).
- **Netlify**: plugin @netlify/plugin-nextjs; variables de entorno en panel. Service role solo en runtime de servidor.
- **PWA-ready**: manifest + ícono + metadatos (service worker se activa en fase 2).

## 3. Esquema de base de datos (24 tablas)
profiles, user_roles, course_cycles, cycle_coordinators, course_sessions, enrollments, attendance_records, attendance_tokens, assessments, assessment_sections, assessment_questions, assessment_options, assessment_attempts, assessment_answers, assessment_results, dream_team_questions, dream_team_forms, dream_team_answers, ministries, ministry_assignments, certificates, announcements, contact_requests, audit_logs, app_settings.
Claves: UUID PK; FKs con índices; UNIQUE(session_id, user_id) en attendance_records (impide duplicados a nivel BD); UNIQUE(user_id, cycle_id) en enrollments; soft delete (`deleted_at`) en ciclos, ministerios, anuncios, evaluaciones; created_at/updated_at con trigger.
El progreso se **deriva** de attendance_records + attempts + forms (función `get_progress`); `enrollments.status` se actualiza con `fn_refresh_enrollment`.

## 4. Rutas
**Público**: `/`, `/login`, `/registro`, `/recuperar`, `/restablecer`, `/verificar`, `/verificar/[codigo]`, `/privacidad`.
**Participante** (`/(app)`): `/inicio`, `/perfil`, `/curso`, `/progreso`, `/proxima-clase`, `/escanear`, `/a/[token]` (confirmación tras escanear), `/test`, `/dream-team`, `/certificado`, `/ministerios`, `/anuncios`, `/contacto`.
**Admin** (`/admin`, por rol): dashboard, `usuarios`, `ciclos` (+`nuevo`, `[id]` con sesiones/coordinadores/inscritos), `sesiones/[id]/qr` (pantalla completa + registros en vivo), `asistencia` (corrección manual con motivo), `evaluaciones`, `dream-team`, `certificados`, `ministerios`, `participantes/[id]` (ficha consolidada + excepciones), `anuncios`, `contacto`, `reportes` (CSV), `configuracion`, `auditoria`.
**API**: `/api/certificados/[id]/pdf`, `/api/reportes?tipo=…&ciclo=…`, `/auth/callback`.

## 5. Permisos (resumen RLS)
- Helpers SQL: `fn_role()`, `fn_is_admin()`, `fn_is_staff()`, `fn_is_coordinator_of(cycle_id)`.
- profiles: SELECT/UPDATE propio; staff SELECT; admin todo.
- enrollments/attendance/attempts/answers/results/dream_team: participante lee lo suyo; escritura sensible solo vía RPC definer; coordinador según ciclo; admin todo. Resultados del test: solo dueño + admin.
- attendance_tokens: solo staff del ciclo; el participante nunca lee la tabla (valida por RPC).
- announcements: visibilidad por audiencia (all/cycle/ministry/role/certified) en la política.
- audit_logs solo admin; app_settings lectura autenticada, escritura admin (claves críticas: superadmin).
- user_roles: solo superadmin escribe (vía `set_user_role`); nadie se auto-asciende.

## 6. Riesgos y decisiones
1. GPS impreciso indoor → `min_accuracy_meters` y radio configurables por sesión + asistencia manual como respaldo.
2. Fraude suave (compartir QR/foto) → v1: token corto + ventana; fase 2: rotación cada n segundos + fingerprint.
3. Contenido real del test no existe → módulo configurable + demo marcada "DEMO"; opción external_url.
4. Iglesia/marca/logo no definidos → app_settings + variables CSS (no se inventó logo).
5. Menores → allow_minors OFF, campos de representante listos.
6. SMTP integrado de Supabase con límites → SMTP propio en producción (README).

## 7. Plan por etapas (ejecutado)
E1 BD+RLS+seed → E2 Auth+roles+layout → E3 Ciclos+inscripción → E4 Asistencia QR+geo → E5 Progreso → E6 Test → E7 Dream Team → E8 Certificados → E9 Ministerios → E10 Anuncios+contacto → E11 Reportes+auditoría+config → E12 Pruebas (tsc 0 errores, vitest 9/9, next build 37 rutas) + README + guía de deploy.
