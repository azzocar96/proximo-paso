import { createClient } from '@/lib/supabase/server';

export type Settings = Record<string, unknown>;

export async function getSettings(keys?: string[]): Promise<Settings> {
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
