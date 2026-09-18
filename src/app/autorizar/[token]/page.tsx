import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getSettings, str } from '@/lib/settings';
import { AutorizarForm } from './ui';
import { vigilar } from '@/lib/supabase/vigilar';

export const metadata = { title: 'Autorización del representante' };
export const dynamic = 'force-dynamic';

/**
 * Página PÚBLICA. El representante llega aquí desde un enlace y no tiene
 * cuenta ni la necesita. Todo lo que se muestra sale de `get_guardian_request`,
 * que devuelve lo mínimo para entender qué se está autorizando y nada que
 * sirva para suplantar a nadie.
 */
export default async function AutorizarPage({ params }: { params: { token: string } }) {
  const supabase = createClient();
  const { data } = await vigilar('app/autorizar/[token]/get_guardian_request', supabase.rpc('get_guardian_request', { p_token: params.token }));
  const r = (data ?? { estado: 'no_existe' }) as {
    estado: 'pendiente' | 'ya_autorizado' | 'caducado' | 'no_existe';
    menor?: string; representante?: string;
  };

  const s = await getSettings(['church_name', 'church_contact']);
  const iglesia = str(s, 'church_name', 'Iglesia Global Orlando');
  const contacto = (s.church_contact ?? {}) as { email?: string; phone?: string };

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-10 bg-gradient-to-b from-brand-50 to-white">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <img src="/logo.png" alt="Próximo Paso" className="h-12 w-auto mx-auto" />
        </div>
        <div className="card space-y-4">
          {r.estado === 'pendiente' && (
            <AutorizarForm token={params.token} menor={r.menor ?? ''} iglesia={iglesia} />
          )}

          {r.estado === 'ya_autorizado' && (
            <>
              <h1 className="text-xl font-bold">Ya estaba autorizada</h1>
              <p className="text-sm text-gray-600">
                La cuenta de {r.menor} ya tiene tu permiso. No hay nada más que hacer.
              </p>
            </>
          )}

          {(r.estado === 'caducado' || r.estado === 'no_existe') && (
            <>
              <h1 className="text-xl font-bold">Este enlace ya no sirve</h1>
              <p className="text-sm text-gray-600">
                Puede que ya lo hayas usado o que haya pasado demasiado tiempo. Escríbenos y te mandamos
                uno nuevo enseguida.
              </p>
              {(contacto.email || contacto.phone) && (
                <p className="text-sm text-gray-700">
                  {iglesia}
                  {contacto.phone && <><br />{contacto.phone}</>}
                  {contacto.email && <><br />{contacto.email}</>}
                </p>
              )}
            </>
          )}

          <p className="text-xs text-gray-500 pt-2 border-t border-gray-100">
            <Link href="/privacidad" className="underline">Qué datos guardamos y para qué</Link>
          </p>
        </div>
      </div>
    </main>
  );
}
