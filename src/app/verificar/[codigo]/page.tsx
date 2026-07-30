import { createClient } from '@/lib/supabase/server';
import { fmtDate } from '@/lib/utils';
import Link from 'next/link';
import { XCircle, CheckCircle2, AlertTriangle } from 'lucide-react';

export const metadata = { title: 'Verificación de certificado' };
export const dynamic = 'force-dynamic';

export default async function VerificarPage({ params }: { params: { codigo: string } }) {
  const supabase = createClient();
  const { data } = await supabase.rpc('verify_certificate', { p_code: params.codigo });
  const r = data as { found: boolean; name?: string; course?: string; date?: string; valid?: boolean } | null;
  return (
    <main className="min-h-screen flex items-center justify-center px-4 bg-gray-50">
      <div className="card w-full max-w-md text-center space-y-4">
        {!r?.found ? (
          <>
            <XCircle className="w-14 h-14 text-red-500 mx-auto" aria-hidden />
            <h1 className="text-xl font-bold">Certificado no encontrado</h1>
            <p className="text-sm text-gray-600">El código no corresponde a ningún certificado emitido.</p>
          </>
        ) : r.valid ? (
          <>
            <CheckCircle2 className="w-14 h-14 text-green-600 mx-auto" aria-hidden />
            <h1 className="text-xl font-bold text-green-700">Certificado válido</h1>
            <p className="font-semibold text-lg">{r.name}</p>
            <p className="text-gray-600">{r.course}</p>
            {r.date && <p className="text-sm text-gray-500">{fmtDate(r.date)}</p>}
          </>
        ) : (
          <>
            <AlertTriangle className="w-14 h-14 text-amber-500 mx-auto" aria-hidden />
            <h1 className="text-xl font-bold text-red-700">Certificado revocado</h1>
            <p className="font-semibold">{r.name}</p>
            <p className="text-gray-600">{r.course}</p>
          </>
        )}
        <Link href="/verificar" className="text-sm text-brand-600 underline">Verificar otro código</Link>
      </div>
    </main>
  );
}
