import { requireUser } from '@/lib/auth';
import { vigilar } from '@/lib/supabase/vigilar';
import { getActiveEnrollment } from '@/lib/course';
import { MensajesUI, type Conversacion } from './ui';

export const metadata = { title: 'Mensajes' };

export default async function MensajesPage() {
  const { supabase, user } = await requireUser();
  const [convRes, minRes, enrollment] = await Promise.all([
    vigilar('app/(app)/mensajes/get_my_conversations', supabase.rpc('get_my_conversations')),
    vigilar('app/(app)/mensajes/ministry_assignments', supabase.from('ministry_assignments')
      .select('ministry_id, ministries(name)').eq('user_id', user.id).in('status', ['assigned', 'active'])),
    getActiveEnrollment(supabase, user.id),
  ]);
  const ministerios = ((minRes.data ?? []) as { ministry_id: string; ministries: { name: string } | { name: string }[] | null }[])
    .map((m) => ({ id: m.ministry_id, nombre: (Array.isArray(m.ministries) ? m.ministries[0]?.name : m.ministries?.name) ?? 'Mi ministerio' }));
  return (
    <MensajesUI
      conversaciones={(convRes.data as Conversacion[] | null) ?? []}
      ministerios={ministerios}
      inscrito={Boolean(enrollment)}
    />
  );
}
