'use client';
import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RotateCcw } from 'lucide-react';

/**
 * Cuando algo revienta de verdad. La persona no tiene la culpa y no tiene que
 * entender qué pasó: tiene que poder volver a intentarlo o pedir ayuda.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error('[app error]', error); }, [error]);
  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-10 bg-gradient-to-b from-brand-50 to-white">
      <div className="w-full max-w-md text-center space-y-4">
        <img src="/logo.png" alt="Próximo Paso" className="h-10 w-auto mx-auto" />
        <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto" aria-hidden />
        <h1 className="text-2xl font-extrabold">Algo salió mal de nuestro lado</h1>
        <p className="text-[15px] text-gray-600">
          No fue nada que hicieras tú. Prueba otra vez; si vuelve a pasar, escríbenos y lo revisamos.
        </p>
        {error.digest && <p className="text-xs text-gray-400">Referencia: {error.digest}</p>}
        <div className="flex flex-col sm:flex-row gap-2 justify-center pt-2">
          <button onClick={reset} className="btn-primary inline-flex items-center justify-center gap-2">
            <RotateCcw className="w-4 h-4" aria-hidden /> Intentar de nuevo
          </button>
          <Link href="/ayuda" className="btn-secondary">Pedir ayuda</Link>
        </div>
      </div>
    </main>
  );
}
