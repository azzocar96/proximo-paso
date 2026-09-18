import { requireUser } from '@/lib/auth';
import { vigilar } from '@/lib/supabase/vigilar';
import { NotificacionesUI, type Notificacion } from './ui';

export const metadata = { title: 'Notificaciones' };

export default async function NotificacionesPage() {
  const { supabase } = await requireUser();
  const { data } = await vigilar('app/(app)/notificaciones/get_my_notifications', supabase.rpc('get_my_notifications', { p_limit: 100 }));
  return <NotificacionesUI items={(data as Notificacion[] | null) ?? []} />;
}
