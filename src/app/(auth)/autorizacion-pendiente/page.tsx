import { redirect } from 'next/navigation';
import { Clock, LogOut } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { getSettings, str } from '@/lib/settings';
import { signOut } from '@/lib/actions/auth';

export const metadata = { title: 'Esperando la autorización' };
export const dynamic = 'force-dynamic';

/**
 * Donde aterriza un menor cuyo representante todavía no ha autorizado.
 * El middleware trae aquí cualquier cuenta en ese estado. No es un castigo ni
 * un error: es una sala de espera, y se escribe como tal.
 */
export default async function AutorizacionPendientePage() {
  const { supabase, user } = await requireUser();
  const { data } = await supabase
    .from('profiles')
    .select('first_name, guardian_first_name, guardian_email, guardian_authorization_status')
    .eq('id', user.id).maybeSingle();

  const estado = data?.guardian_authorization_status as string | undefined;
  if (!estado || estado === 'not_required' || estado === 'granted') redirect('/inicio');

  const s = await getSettings(['church_contact']);
  const contacto = (s.church_contact ?? {}) as { email?: string; phone?: string };
  const revocado = estado === 'revoked';

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold inline-flex items-center gap-2">
        <Clock className="w-5 h-5 text-brand-600" aria-hidden />
        {revocado ? 'Tu cuenta está detenida' : 'Falta un permiso'}
      </h1>

      {revocado ? (
        <p className="text-sm text-gray-700">
          Hola {data?.first_name}. Tu representante retiró el permiso, así que tu cuenta está detenida.
          Habla con él o con nosotros y lo resolvemos.
        </p>
      ) : (
        <>
          <p className="text-sm text-gray-700">
            Hola {data?.first_name}. Tu cuenta ya existe, pero como eres menor de edad necesitamos que
            {data?.guardian_first_name ? ` ${data.guardian_first_name}` : ' tu representante'} nos dé su permiso.
          </p>
          <p className="text-sm text-gray-700">
            Le enviamos el enlace a <b>{data?.guardian_email}</b>. Pídele que lo abra y confirme: es un clic.
          </p>
          <div className="rounded-xl bg-brand-50/60 border border-brand-200/70 p-3 text-sm text-gray-700">
            ¿No le llegó? Escríbenos y se lo mandamos por WhatsApp al número que registraste.
            {contacto.phone && <><br />{contacto.phone}</>}
            {contacto.email && <><br />{contacto.email}</>}
          </div>
        </>
      )}

      <p className="text-xs text-gray-500">
        Mientras tanto no puedes inscribirte a un ciclo ni marcar asistencia. Si vas a una clase, avísale a
        quien la atiende: puede registrarte la asistencia a mano y no pierdes nada.
      </p>

      <form action={signOut}>
        <button className="btn-secondary w-full inline-flex items-center justify-center gap-2">
          <LogOut className="w-4 h-4" aria-hidden /> Cerrar sesión
        </button>
      </form>
    </div>
  );
}
