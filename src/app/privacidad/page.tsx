import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getSettings, str } from '@/lib/settings';

// Siempre en vivo: la caché de 60 s de getSettings ya da la velocidad; lo que
// no queremos es que el texto quede congelado en el momento del deploy.
export const dynamic = 'force-dynamic';

export const metadata = { title: 'Política de privacidad' };
export default async function PrivacidadPage() {
  let text = 'Política de privacidad pendiente de redacción por la iglesia.';
  try {
    const s = await getSettings(['privacy_policy']);
    text = str(s, 'privacy_policy', text);
  } catch (e) {
    console.error('[settings]', (e as Error)?.message ?? e);
  }
  return (
    <main className="max-w-2xl mx-auto px-6 py-12">
      <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-6">
        <ArrowLeft className="w-4 h-4" aria-hidden /> Volver
      </Link>
      <h1 className="text-2xl font-bold mb-4">Política de privacidad</h1>
      <div className="whitespace-pre-wrap text-[15px] leading-relaxed text-gray-700">{text}</div>
      <p className="mt-8 text-sm text-gray-500">
        Esta app solo solicita tu ubicación en el momento de registrar asistencia y no la almacena de forma permanente:
        solo guarda la distancia calculada al lugar de la clase y la precisión reportada por tu dispositivo.
      </p>
    </main>
  );
}
