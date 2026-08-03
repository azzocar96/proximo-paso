import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { CambiarClaveForm } from './ui';

export const metadata = { title: 'Cambia tu contraseña' };
export const dynamic = 'force-dynamic';

/**
 * Pantalla obligatoria para quien entró con una clave temporal.
 * El middleware trae aquí a cualquiera con `must_change_password = true` y no
 * lo deja salir. Si alguien llega aquí sin tener la marca puesta, no hay nada
 * que hacer: se le devuelve a su inicio.
 */
export default async function CambiarClavePage() {
  const { supabase, user } = await requireUser();
  const { data } = await supabase
    .from('profiles').select('must_change_password, first_name').eq('id', user.id).maybeSingle();
  if (!data?.must_change_password) redirect('/inicio');

  return <CambiarClaveForm nombre={data.first_name as string} />;
}
