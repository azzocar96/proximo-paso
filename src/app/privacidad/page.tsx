import { getSettings, str } from '@/lib/settings';

export const metadata = { title: 'Política de privacidad' };
export default async function PrivacidadPage() {
  let text = 'Política de privacidad pendiente de redacción por la iglesia.';
  try {
    const s = await getSettings(['privacy_policy']);
    text = str(s, 'privacy_policy', text);
  } catch {}
  return (
    <main className="max-w-2xl mx-auto px-6 py-12">
      <h1 className="text-2xl font-bold mb-4">Política de privacidad</h1>
      <div className="prose whitespace-pre-wrap text-gray-700">{text}</div>
      <p className="mt-8 text-sm text-gray-500">
        Esta app solo solicita tu ubicación en el momento de registrar asistencia y no la almacena de forma permanente:
        solo guarda la distancia calculada al lugar de la clase y la precisión reportada por tu dispositivo.
      </p>
    </main>
  );
}
