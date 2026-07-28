import { notFound } from 'next/navigation';
import { requireStaff } from '@/lib/auth';
import { QrScreen } from './ui';

export const metadata = { title: 'Pantalla QR' };
export default async function QrPage({ params }: { params: { id: string } }) {
  const { supabase } = await requireStaff();
  const { data: session } = await supabase.from('course_sessions')
    .select('*, course_cycles(name)').eq('id', params.id).maybeSingle();
  if (!session) notFound();
  const { data: token } = await supabase.from('attendance_tokens')
    .select('token,expires_at').eq('session_id', params.id).eq('revoked', false)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  return <QrScreen session={session} initialToken={token ?? null} siteUrl={process.env.NEXT_PUBLIC_SITE_URL ?? ''} />;
}
