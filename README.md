# Próximo Paso — App del curso de la iglesia

Aplicación web completa (producción) para el curso "Próximo Paso": registro, inscripción por ciclos,
asistencia con QR + geolocalización, test de personalidad, formulario Dream Team, certificados digitales
con verificación pública y vinculación a ministerios.

**Stack:** Next.js 14 (App Router, TypeScript, Server Actions) · Tailwind CSS · Supabase (Auth + Postgres con RLS + Storage) · Netlify · mobile-first · preparada para PWA.

## Estructura
```
supabase/            migraciones SQL (esquema, funciones, RLS), seed demo, guía de Supabase
src/app/(auth)/      login, registro, recuperar, restablecer
src/app/(app)/       panel del participante (inicio, curso, progreso, escanear, test, dream-team, …)
src/app/admin/       panel administrativo (dashboard, ciclos, QR, asistencia, certificados, …)
src/app/api/         PDF de certificados, exportación CSV
src/app/verificar/   verificación pública de certificados
src/lib/             clientes Supabase, auth, schemas Zod, server actions
scripts/             creación de cuentas demo
tests/               pruebas unitarias (vitest)
```

## Instalación (desarrollo)
1. **Requisitos:** Node 18+.
2. `npm install`
3. Configurar Supabase → sigue **`supabase/README-SUPABASE.md`** (crear proyecto, correr las 3 migraciones, buckets, auth).
4. Copiar `.env.example` a `.env` y pegar las claves del proyecto.
5. Cuentas demo: `node scripts/create-demo-users.mjs`, luego ejecutar `supabase/seed.sql` en el SQL Editor.
6. `npm run dev` → http://localhost:3000

### Cuentas demo (solo desarrollo)
| Rol | Correo | Contraseña |
|---|---|---|
| Participante | participante@demo.local | Demo1234! |
| Coordinador | coordinador@demo.local | Demo1234! |
| Administrador | admin@demo.local | Demo1234! |
| Superadmin | superadmin@demo.local | Demo1234! |

Nota: el coordinador además debe asignarse a un ciclo (Admin → Ciclos → Coordinadores).

## Pruebas
`npm test` — valida schemas Zod (registro/contacto/ciclo), generación CSV y la fórmula Haversine
(réplica de la función SQL usada por el servidor). Flujo E2E manual sugerido en `DECISIONES-PENDIENTES.md`.

## Despliegue en Netlify
1. Subir el repo a GitHub (no incluyas `.env`).
2. Netlify → Add new site → Import from Git. El `netlify.toml` ya configura el plugin de Next.js.
3. Variables de entorno (Site settings → Environment):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (solo servidor; Netlify no la expone al cliente)
   - `NEXT_PUBLIC_SITE_URL` = https://TU-SITIO.netlify.app
4. En Supabase → Auth → URL Configuration: agregar la URL de Netlify a las Redirect URLs.
5. Producción: activar SMTP propio en Supabase (el integrado tiene límites) y "Confirm email" ON.

## Seguridad (resumen)
- RLS activo en **todas** las tablas; helpers `fn_role()`, `fn_is_admin()`, `fn_is_coordinator_of()`.
- Toda mutación sensible pasa por funciones `SECURITY DEFINER` (asistencia, inscripción, certificados, roles) — el navegador nunca decide.
- QR: token opaco de 32 bytes con expiración y revocación; exclusivo por sesión; validación completa en servidor (Haversine + radio + precisión + ventana + prerrequisitos + duplicados; duplicados también bloqueados por UNIQUE en BD).
- Privacidad: no se guardan coordenadas exactas; solo distancia, precisión y resultado. La ubicación solo se pide al registrar asistencia.
- Excepciones administrativas siempre con motivo → `audit_logs`.
- Service role solo en servidor. Validación Zod en todas las entradas. Archivos: 3 MB máx., solo JPG/PNG/WebP.
- Resultados del test: privados (dueño + administradores).

## Configuración del negocio (Admin → Configuración)
Nombre de iglesia/curso, marca, contacto, política de privacidad editable, firmas del certificado,
aprobación semiautomática de certificados, modo del test (interno/URL externa), duración del QR,
edad mínima/menores. Lo que no estaba definido en el negocio es configurable, no está codificado rígido.
