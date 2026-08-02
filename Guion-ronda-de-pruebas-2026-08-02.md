# Guion — Ronda de pruebas con gente real · Próximo Paso
**Fecha crítica: HOY domingo 2-ago es el Paso 1 real** (16:30–16:50, Salón Australia · Summit). La ronda de pruebas y la primera clase real son el mismo evento. Verificado en la base: ciclo "Próximo Paso · Agosto 2026", `registration_open`, coordenadas 28.55506/-81.33713 (735 Herndon Ave), radio 150 m, QR de 30 min.

**Complemento de la guía PDF de 52 páginas** (`Guia-de-prueba-Proximo-Paso.pdf`): la guía explica cada pantalla; este guion dice quién hace qué hoy y qué es fallo.

---

## 1. Cuentas que hacen falta (estado real verificado hoy en la base)

| Cuenta | Estado hoy | Qué falta |
|---|---|---|
| **Jesús (real, con permisos)** | **NO EXISTE.** Todos los roles están en cuentas `@demo.local` con contraseña publicada en la guía | Jesús se registra en `/registro` con su correo real → se sube el rol a **superadmin o pastor** desde Admin → Usuarios (entrando como `superadmin@demo.local`), o me da el correo y su OK y lo subo yo por SQL |
| **Pastor real** | No existe | Se registra por el link general y Jesús le sube el rol (decisión: no se reparten contraseñas) |
| Quien abre el QR del Paso 1 | Solo cuentas demo (admin/superadmin/coordinador) | Para HOY sirve una demo como plan B; lo correcto es la cuenta real de Jesús. 0 servidores en el ministerio Próximo Paso (sin director) |
| Participantes reales | 1 registrada (Yelitza Rico) **sin inscribir**; 0 inscripciones al ciclo | Se registran con el afiche QR y **además se inscriben al ciclo** — dos pasos, decirlo en voz alta hoy |

## 2. Pasos que sigue cada persona

**Participante nuevo (el flujo que más gente va a recorrer hoy):**
1. Escanea el afiche → `/registro`. Nombre, correo, contraseña, **fecha de nacimiento** (obligatoria), acepta privacidad. Debe ver "Ya puedes iniciar sesión" — NO "revisa tu correo".
2. Inicia sesión → `/inicio`. Debe ver el banner de la clase de hoy y el botón de **inscribirse al ciclo**. Se inscribe.
3. A las 16:30, en el salón: menú → Escanear → apunta al QR proyectado → permite ubicación → debe ver **"¡Asistencia registrada! Paso 1 completado."**
4. Revisa `/progreso` (Paso 1 en verde) y `/perfil`. NO debe ver Ministerios ni Muro (está en proceso).

**Quien abre el QR (Jesús o staff):**
1. Login → Panel admin → Ciclos → sesión de hoy → pantalla QR (o `/servicio` si fuera servidor del paso).
2. Abrir asistencia ~16:25, proyectar el QR a pantalla completa. Dura 30 min; renovar genera uno nuevo y revoca el anterior.
3. Mirar la lista en vivo: cada escaneo válido aparece con nombre.
4. Al final: cerrar la asistencia. Quien olvidó marcar puede pedir confirmación desde `/progreso` y el staff la aprueba en Admin → Asistencia.

**Jesús como admin (después de la clase, 10 min):**
1. Admin → Asistencia: registros de hoy, con distancia y precisión (nunca coordenadas).
2. Admin → Usuarios: registrados de hoy; aprobar solicitudes de "ya soy miembro activo" (bandeja en Usuarios y Liderazgo).
3. Auditoría: cada acción administrativa de hoy debe tener su fila.

**Opcional, si hay un director/orador real dispuesto:** registrarse → Jesús lo marca miembro activo → le da el cargo → prueba `/liderazgo` o `/orador`.

## 3. Qué mirar en cada pantalla y qué se considera FALLO

| Pantalla | Se considera FALLO |
|---|---|
| `/registro` | Mensaje que pida verificar correo (ya no llega ninguno); un menor que logra registrarse (allow_minors OFF); error crudo en inglés o de Postgres |
| `/inicio` | **Pantalla vacía sin mensaje** (lección nº1: vacío = sospechar permisos); no aparece el ciclo o el botón de inscribirse |
| Inscripción | Que alguien registrado no encuentre cómo inscribirse; error crudo al inscribirse |
| Escanear/QR | Persona dentro del salón que no puede marcar (ver nota GPS); token expirado sin mensaje claro; que un escaneo fuera del salón SÍ pase (fallo grave de seguridad) |
| `/progreso` | Paso 1 no aparece completado tras marcar; no aparece el botón de pedir confirmación al día siguiente |
| Todas en móvil | Botones que no responden, textos cortados, palabra "coordinador" (debe decir servidor), texto en inglés |
| Recuperar contraseña | El correo NO llega — **conocido y esperado** hasta que haya SMTP: se resuelve a mano desde Supabase, no es fallo nuevo |

**Nota GPS**: precisión mínima 100 m y radio 150 m. Si a varias personas les rechaza por precisión dentro del salón, plan B: subir `min_accuracy_meters` de la sesión (un minuto); plan C: corrección manual del staff con motivo (auditada).

**Regla que puede morder HOY**: la inscripción tardía a un ciclo iniciado queda bloqueada. Quien se registre hoy pero NO se inscriba, la próxima semana ya no podrá. Insistir: registrarse **e inscribirse**.

## 4. Qué necesito de Jesús (en orden)

1. **Antes de las 16:00 de hoy**: registrarte con tu correo real y subirte el rol (o darme el correo y tu OK para subirlo yo por SQL desde tu navegador). Sin esto, hoy abres el QR como "Ana Administradora".
2. **Nombres reales de los 5 ministerios** (siguen "(DEMO)" y líder "Por definir") — yo no los invento. Con eso los renombro por SQL.
3. **Decidir qué hacer con las 8 cuentas demo** (contraseña `Demo1234!` impresa en la guía y ya hay gente real): propuesta conservadora — cambiarles la contraseña hoy (no borrarlas); con tu OK lo hago yo.
4. **Estar físicamente en la iglesia** con tu teléfono: abrir el QR y probar un escaneo dentro y otro fuera del radio.
5. **Después de la clase**: reportarme fallos con la plantilla del capítulo final de la guía (pantalla, cuenta, hora, qué esperabas ver).
6. **Esta semana**: contraseña de aplicación de Gmail directo en Supabase → SMTP (la escribes solo tú, nunca por chat). Con eso reactivo verificación de correo, plantillas en español y recuperación de contraseña.
