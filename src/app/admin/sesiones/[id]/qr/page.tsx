import { notFound } from 'next/navigation';
import { requireStaff } from '@/lib/auth';
import { QrScreen } from './ui';
import { vigilar } from '@/lib/supabase/vigilar';

export const metadata = { title: 'Pantalla QR' };
export default async function QrPage({ params }: { params: { id: string } }) {
  const { supabase } = await requireStaff();
  const { data: session } = await vigilar('app/admin/sesiones/[id]/qr/course_sessions', supabase.from('course_sessions')
    .select('*, course_cycles(name)').eq('id', params.id).maybeSingle());
  if (!session) notFound();
  const { data: token } = await vigilar('app/admin/sesiones/[id]/qr/attendance_tokens', supabase.from('attendance_tokens')
    .select('token,expires_at').eq('session_id', params.id).eq('revoked', false)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false }).limit(1).maybeSingle());
  return <QrScreen session={session} initialToken={token ?? null} siteUrl={process.env.NEXT_PUBLIC_SITE_URL ?? ''} />;
}
