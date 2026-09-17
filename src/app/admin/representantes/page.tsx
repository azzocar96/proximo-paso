import { requireAdmin } from '@/lib/auth';
import { RepresentantesUI } from './ui';

export const metadata = { title: 'Representantes de menores' };
export const dynamic = 'force-dynamic';

export default async function RepresentantesPage() {
  const { supabase } = await requireAdmin();
  const { data: pendientes } = await supabase.rpc('get_guardian_pending');
  const { data: bandeja } = await supabase.rpc('get_notification_outbox', { p_solo_pendientes: true });
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://proximo-paso.netlify.app';

  return (
    <RepresentantesUI
      pendientes={(pendientes as any[]) ?? []}
      bandeja={(bandeja as any[]) ?? []}
      site={site}
    />
  );
}
