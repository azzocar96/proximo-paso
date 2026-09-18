import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { vigilar } from '@/lib/supabase/vigilar';
import { HiloUI, type Hilo } from './ui';

export const metadata = { title: 'Conversación' };

export default async function HiloPage({ params }: { params: { id: string } }) {
  const { supabase, user } = await requireUser();
  // get_conversation también marca como leído lo que me mandaron: abrir es leer.
  const { data } = await vigilar('app/(app)/mensajes/[id]/get_conversation', supabase.rpc('get_conversation', { p_conv: params.id }));
  if (!data) notFound();
  return <HiloUI hilo={data as Hilo} userId={user.id} />;
}
