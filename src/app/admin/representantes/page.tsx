import { requireAdmin } from '@/lib/auth';
import { RepresentantesUI } from './ui';
import { vigilar } from '@/lib/supabase/vigilar';

export const metadata = { title: 'Representantes de menores' };
export const dynamic = 'force-dynamic';

export default async function RepresentantesPage() {
  const { supabase } = await requireAdmin();
  const { data: pendientes } = await vigilar('app/admin/representantes/get_guardian_pending', supabase.rpc('get_guardian_pending'));
  const { data: bandeja } = await vigilar('app/admin/representantes/get_notification_outbox', supabase.rpc('get_notification_outbox', { p_solo_pendientes: true }));
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://proximo-paso.netlify.app';

  return (
    <RepresentantesUI
      pendientes={pendientes ?? []}
      bandeja={bandeja ?? []}
      site={site}
    />
  );
}
