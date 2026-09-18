import { createClient } from '@/lib/supabase/server';
import { createVerifyClient } from '@/lib/supabase/server';
import { unstable_cache } from 'next/cache';

export type Settings = Record<string, unknown>;

// Las claves que cualquiera puede leer sin sesión (lista blanca de la 023/028).
// Solo estas se sirven desde la caché compartida: son las de la portada, la
// ayuda y la privacidad, que son lo que más se abre y lo que menos cambia.
const PUBLIC_KEYS = new Set([
  'brand', 'capability_notes', 'church_address', 'church_contact', 'church_name',
  'course_name', 'email_outbound_ready', 'privacy_policy', 'program_objectives',
  'program_schedule', 'step_names',
]);

const readPublicSettings = unstable_cache(
  async (keys: string[]): Promise<Settings> => {
    // Cliente sin cookies a propósito: lo cacheado no puede depender de quién mira.
    const supabase = createVerifyClient();
    const { data, error } = await supabase.from('app_settings').select('key,value').in('key', keys);
    if (error) console.error('[app_settings/public]', error.message);
    const out: Settings = {};
    for (const row of data ?? []) out[row.key] = row.value;
    return out;
  },
  ['app_settings_public'],
  { revalidate: 60, tags: ['app_settings'] },
);

export async function getSettings(keys?: string[]): Promise<Settings> {
  // Si todo lo pedido es público, va por la caché (60 s). Si no, lectura viva.
  if (keys?.length && keys.every((k) => PUBLIC_KEYS.has(k))) {
    return readPublicSettings([...keys].sort());
  }
  const supabase = createClient();
  let q = supabase.from('app_settings').select('key,value');
  if (keys?.length) q = q.in('key', keys);
  const { data, error } = await q;
  // Nunca dejar un error de Supabase sin decir nada: aquí un "permission
  // denied" se veía exactamente igual que "no hay ajustes guardados", y la
  // página de privacidad estuvo enseñando su texto de reserva sin que nada
  // avisara.
  if (error) console.error('[app_settings]', error.message);
  const out: Settings = {};
  for (const row of data ?? []) out[row.key] = row.value;
  return out;
}

export function str(s: Settings, key: string, fallback = ''): string {
  const v = s[key];
  return typeof v === 'string' ? v : fallback;
}

export function arr<T = string>(s: Settings, key: string, fallback: T[] = []): T[] {
  const v = s[key];
  return Array.isArray(v) ? (v as T[]) : fallback;
}

export function obj<T extends Record<string, unknown>>(s: Settings, key: string, fallback: T): T {
  const v = s[key];
  return v && typeof v === 'object' && !Array.isArray(v) ? { ...fallback, ...(v as T) } : fallback;
}
