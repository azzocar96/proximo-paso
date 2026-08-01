import { Inbox } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { RequestsHub } from './ui';

export const metadata = { title: 'Solicitudes' };

/**
 * Fase 3g — todas las solicitudes de la app en un solo lugar.
 * Tres partes: lo que yo pedí, lo que me toca resolver a mí por mi cargo, y el
 * archivo. Antes esto vivía repartido en /ministerios, /perfil, /liderazgo y
 * /admin/asistencia, y nadie sabía dónde mirar.
 */
export default async function SolicitudesPage() {
  const { supabase } = await requireUser();
  const [mine, inbox, archive, ministries] = await Promise.all([
    supabase.rpc('get_my_requests'),
    supabase.rpc('get_my_inbox'),
    supabase.rpc('get_my_requests_archive', { p_limit: 30 }),
    supabase.rpc('get_ministries_catalog'),
  ]);
  const { data: role } = await supabase.rpc('fn_role');
  const isAdmin = ['pastor', 'superadmin'].includes(role as string);
  // Misma fuente de verdad que el menú: sin esto, esta pantalla invitaba a
  // dirigir un ministerio a alguien a quien /ministerios le dice que todavía
  // no puede ni verlos. Si la RPC falla, mostramos (igual que el menú).
  const { data: nav, error: navError } = await supabase.rpc('fn_my_nav');
  const isActiveMember = Boolean(navError) || (nav as any)?.is_active_member === true;

  // Si una de las tres falla no se puede fingir que está vacía: eso ya nos
  // costó una vez que la app entera pareciera en blanco sin dar un solo error.
  const loadError = [mine.error, inbox.error, archive.error].some(Boolean);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold inline-flex items-center gap-2">
          <Inbox className="w-6 h-6 text-brand-600" aria-hidden /> Solicitudes
        </h1>
        <p className="text-sm text-gray-500">
          Lo que pediste, lo que te toca resolver y lo que ya se resolvió.
        </p>
      </div>
      <RequestsHub
        mine={((mine.data as any[]) ?? []) as any}
        inbox={((inbox.data as any[]) ?? []) as any}
        archive={((archive.data as any[]) ?? []) as any}
        ministries={((ministries.data as any[]) ?? []).map((m: any) => ({ id: m.id, name: m.name }))}
        isAdmin={isAdmin}
        isActiveMember={isActiveMember}
        loadError={loadError}
      />
    </div>
  );
}
