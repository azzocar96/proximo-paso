import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { QrScreen } from '@/app/admin/sesiones/[id]/qr/ui';
import { vigilar } from '@/lib/supabase/vigilar';

export const metadata = { title: 'Código de asistencia' };

/**
 * La misma pantalla del QR del panel, aquí para un servidor de paso.
 * El permiso NO se decide aquí: la RPC open_attendance solo deja abrir a quien
 * sirve en ese paso. Esta página únicamente comprueba que la clase le toque,
 * para no mostrar una pantalla que después no va a funcionar.
 */
export default async function ServicioQrPage({ params }: { params: { id: string } }) {
  const { supabase } = await requireUser();
  const { data: sessions } = await vigilar('app/(app)/servicio/[id]/get_servant_sessions', supabase.rpc('get_servant_sessions'));
  const mine = (sessions ?? []).find((s: any) => s.id === params.id);
  if (!mine) notFound();

  const { data: session } = await vigilar('app/(app)/servicio/[id]/course_sessions', supabase.from('course_sessions')
    .select('*, course_cycles(name)').eq('id', params.id).maybeSingle());
  if (!session) notFound();

  const { data: token } = await vigilar('app/(app)/servicio/[id]/attendance_tokens', supabase.from('attendance_tokens')
    .select('token,expires_at').eq('session_id', params.id).eq('revoked', false)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false }).limit(1).maybeSingle());

  return (
    <div className="space-y-4">
      <Link href="/servicio" className="text-sm text-gray-500 inline-flex items-center gap-1">
        <ChevronLeft className="w-4 h-4" aria-hidden /> Volver a Mi servicio
      </Link>
      <QrScreen session={session} initialToken={token ?? null} siteUrl={process.env.NEXT_PUBLIC_SITE_URL ?? ''} />
    </div>
  );
}
