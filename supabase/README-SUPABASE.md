# Configurar Supabase — Próximo Paso

1. Crear proyecto en https://supabase.com (org propia). Región cercana (us-east-1).
2. SQL Editor → ejecutar en orden:
   - `migrations/001_schema.sql`
   - `migrations/002_functions.sql`
   - `migrations/003_rls.sql`
3. Storage → crear buckets:
   - `avatars` (público en lectura) — fotos de perfil e imágenes de anuncios/ministerios.
   - `certificates` (privado) — PDFs de certificados.
   Políticas sugeridas (SQL Editor):
   ```sql
   create policy "avatars propios" on storage.objects for insert
     with check (bucket_id='avatars' and auth.uid()::text = (storage.foldername(name))[1]);
   create policy "avatars lectura" on storage.objects for select using (bucket_id='avatars');
   create policy "certs dueño o admin" on storage.objects for select
     using (bucket_id='certificates' and (auth.uid()::text = (storage.foldername(name))[1] or fn_is_admin()));
   ```
4. Authentication → Providers → Email: activar. **Confirm email: ON** (verificación de correo).
   - URL de redirección: agregar `http://localhost:3000/**` y la URL de Netlify `https://TU-SITIO.netlify.app/**`.
   - Producción: configurar SMTP propio (Settings → Auth → SMTP) — el SMTP integrado tiene límites.
5. Cuentas demo (desarrollo): `node scripts/create-demo-users.mjs` (necesita SUPABASE_SERVICE_ROLE_KEY en .env). Luego ejecutar `seed.sql`.
6. Copiar claves a `.env` (ver `.env.example`). La service role **solo** en variables de servidor (Netlify env vars), jamás en el cliente.
