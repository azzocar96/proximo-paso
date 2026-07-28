// Crea cuentas demo (SOLO desarrollo). Uso: node scripts/create-demo-users.mjs
// Requiere .env con NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';

if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en .env'); process.exit(1); }
const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

const USERS = [
  { email: 'participante@demo.local', password: 'Demo1234!', first: 'Pedro', last: 'Participante', role: 'participant' },
  { email: 'coordinador@demo.local', password: 'Demo1234!', first: 'Carla', last: 'Coordinadora', role: 'coordinator' },
  { email: 'admin@demo.local', password: 'Demo1234!', first: 'Ana', last: 'Administradora', role: 'admin' },
  { email: 'superadmin@demo.local', password: 'Demo1234!', first: 'Samuel', last: 'Superadmin', role: 'superadmin' },
];

for (const u of USERS) {
  const { data, error } = await admin.auth.admin.createUser({
    email: u.email, password: u.password, email_confirm: true,
    user_metadata: { first_name: u.first, last_name: u.last, privacy_consent: true },
  });
  if (error) { console.log(`↷ ${u.email}: ${error.message}`); continue; }
  const uid = data.user.id;
  if (u.role !== 'participant') {
    const { error: e2 } = await admin.from('user_roles').insert({ user_id: uid, role: u.role });
    if (e2 && e2.code !== '23505') console.log(`  rol ${u.role}: ${e2.message}`);
  }
  console.log(`✓ ${u.email} (${u.role}) — contraseña: ${u.password}`);
}
console.log('\nListo. Ejecuta ahora supabase/seed.sql en el SQL Editor si aún no lo hiciste.');
