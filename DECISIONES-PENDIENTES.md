# Decisiones pendientes, supuestos y fase 2

## Decisiones que debe tomar la iglesia (Jesús)
1. ~~Nombre real de la iglesia, logo, colores y datos de contacto~~ → **Resuelto 2026-07-28**: Iglesia Global Orlando, 735 Herndon Ave, Orlando, FL 32803; logo y colores naranja/blanco de "Próximo Paso" cargados (`public/logo.png`, marca `#FE4703`). Cargado en `app_settings` (001_schema.sql) y en el fallback de la página de inicio. **Pendiente aún**: teléfono/email de contacto (`church_contact`, hoy vacío).
2. **Contenido real del test de personalidad** (preguntas, dimensiones y puntuaciones) o URL externa. La demo del seed NO es un test psicológico válido.
3. **Modo externo del test**: hoy el participante declara "ya lo completé" (queda como intento completado). ¿Se exige validación del admin antes de contar como requisito? → **Fase 2 (2026-07-28)**: se agregó que el participante también puede escribir el *resultado* que dice haber obtenido (`assessment_results.external_result`, texto libre con sugerencias D/I/S/C) — por diseño esto es autoreportado y no calculado por nosotros, porque el test real vive en el sitio propio de la iglesia, no en esta app. Sigue pendiente si se quiere una validación del admin antes de contar como requisito.
4. **Aprobación de certificados**: manual (por defecto) o semiautomática (toggle de superadmin).
5. **Firmas del certificado**: nombres y cargos (Configuración → certificate_signatures). Imágenes de firma = fase 2.
6. **Menores de edad**: allow_minors está OFF. Si se activa, definir el flujo de consentimiento del representante (campos ya existen en BD).
7. **Política de privacidad**: redactar el texto real (editable en Configuración).
8. ~~Nombre definitivo del curso~~ → **Confirmado 2026-07-28**: "Próximo Paso" es el nombre real (coincide con `yosoyglobal.org/orlando/proximo-paso/`, el Curso de Membresía de Global Orlando).

## Supuestos utilizados (2026-07-28)
- La página de inicio (`/`) es la puerta de entrada al panel interno (login/registro), no un sitio de marketing público independiente — así lo pidió Jesús, tomando como referencia visual/tono `yosoyglobal.org/orlando/` (cercano, informal) pero sin copiar su contenido.
- Cada tarjeta de "Los 4 Pasos" en la página de inicio tiene una frase corta (`hint`) que Claude derivó repartiendo el párrafo de objetivos entre los 4 pasos (seguir a Jesús → Sígueme, conectarse con Dios → Intimidad, conectarse con la iglesia → Compañerismo, servir → Influencia). Es una síntesis editable, no un dato nuevo inventado; se puede ajustar el texto directamente en `src/app/page.tsx`.
- Nombre/dirección/marca/pasos/objetivos/horario quedaron con valores reales por defecto en `app_settings` (001_schema.sql) y como fallback en el código, pero siguen siendo editables desde Admin → Configuración una vez creado el proyecto Supabase.


- UI 100% en español; correo = nombre de usuario; verificación de correo obligatoria.
- Un participante tiene **una** inscripción activa a la vez (puede re-inscribirse en otro ciclo si se retira o termina).
- El test y el Dream Team se desbloquean al completar el Paso 3, y ambos son prerrequisito del Paso 4 (según spec).
- Radio por defecto 100 m (configurable por ciclo y por sesión); precisión GPS mínima aceptada 100 m (configurable por sesión).
- El QR se muestra en la pantalla del coordinador y vence por tiempo (5–90 min); regenerarlo revoca el anterior.
- "Asistencia por lote/importada" se registra por la vía manual con método `imported`.
- El certificado PDF se genera bajo demanda (no se pre-almacena en Storage); el bucket `certificates` queda listo por si se quiere archivar en fase 2.
- Fechas de sesiones: siempre elegidas a mano por el admin; la app solo sugiere la fecha de certificación.

## Flujo E2E manual de verificación (con cuentas demo)
1. Superadmin → Configuración: nombre de iglesia. 2. Admin → Ciclos: revisar Ciclo DEMO (fechas/coordenadas).
3. Asignar coordinador al ciclo. 4. Participante: inscribirse. 5. Coordinador: abrir QR del Paso 1.
6. Participante: escanear (usar coordenadas del ciclo si pruebas en escritorio: el navegador debe estar cerca o ajustar radio).
7. Repetir pasos 2 y 3 → test → dream team → Paso 4. 8. Admin → Certificados: aprobar → descargar PDF → verificar código en /verificar.
9. Revisar Auditoría y Reportes CSV.

## Mejoras para una segunda fase
- Service worker completo (PWA offline + push de anuncios).
- Rotación automática del QR cada n segundos + device fingerprint (antifraude).
- Rate limiting por IP/usuario en RPCs sensibles (hoy: validaciones + auth; Supabase tiene límites de API pero conviene capa extra).
- ~~Líderes de ministerio como rol con acceso acotado a resultados del test~~ → **Construido 2026-07-28** (`004_fase2_segmentacion.sql`): tabla `ministry_leaders` + RLS (no es un rol de `user_roles`, es un alcance transversal). **Pendiente de Jesús**: una vez exista el proyecto Supabase, asignar de verdad a los primeros líderes desde Admin → Ministerios (la tabla nace vacía; nadie es líder hasta que el superadmin lo asigne ahí).
- Panel de segmentación de participantes (filtrar/agrupar por ciclo, paso, resultado del test, ministerio de interés, edad) → **Construido 2026-07-28**: `/admin/segmentacion` y `/liderazgo/segmentacion`, con export CSV vía `/api/reportes?tipo=segmentacion`.
- Certificados: imágenes de firma, plantilla de diseño por iglesia, generación por lote en ZIP y archivo en Storage.
- Notificaciones por correo (recordatorio de clase, certificado listo) vía SMTP/Resend.
- Importador CSV de asistencia histórica.
- Multi-iglesia / multi-campus.
- Tests E2E automatizados (Playwright) y tests pgTAP para RLS.
- Página de instalación PWA con instrucciones por dispositivo.
