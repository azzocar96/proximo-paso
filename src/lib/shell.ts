import type { SupabaseClient } from '@supabase/supabase-js';
import { iniciales } from '@/components/ui/Avatar';
import type { Contadores } from '@/components/shell/TopBar';

/**
 * Lo que necesita la barra superior, en una sola función, para que cualquier
 * cascarón (la app y el panel del director) la muestre igual sin repetir
 * consultas ni quedarse a medias.
 */
export async function datosDeLaBarra(supabase: SupabaseClient, user: { id: string; email?: string }) {
  const [perfilRes, contRes] = await Promise.all([
    supabase.from('profiles').select('first_name,last_name,photo_url').eq('id', user.id).maybeSingle(),
    supabase.rpc('fn_my_counters'),
  ]);
  if (perfilRes.error) console.error('[shell/profiles]', perfilRes.error.message);
  if (contRes.error) console.error('[shell/fn_my_counters]', contRes.error.message);
  const p = perfilRes.data as { first_name?: string; last_name?: string; photo_url?: string } | null;
  return {
    userId: user.id,
    nombre: p?.first_name || 'bienvenido',
    iniciales: iniciales(p?.first_name, p?.last_name),
    foto: p?.photo_url ?? null,
    email: user.email ?? '',
    inicial: (contRes.data as Contadores | null) ?? { solicitudes: 0, notificaciones: 0, mensajes: 0 },
  };
}
