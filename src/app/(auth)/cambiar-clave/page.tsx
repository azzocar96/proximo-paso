import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { CambiarClaveForm } from './ui';
import { vigilar } from '@/lib/supabase/vigilar';
import { getSettings } from '@/lib/settings';

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
  const { data } = await vigilar('app/(auth)/cambiar-clave/profiles', supabase
    .from('profiles').select('must_change_password, first_name').eq('id', user.id).maybeSingle());
  if (!data?.must_change_password) redirect('/inicio');

  const s = await getSettings(['church_contact']);
  const contacto = (s.church_contact ?? {}) as { email?: string; phone?: string };
  return <CambiarClaveForm nombre={data.first_name as string} contacto={contacto} />;
}
