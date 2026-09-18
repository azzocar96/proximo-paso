'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';

// La sala de espera se revisa sola: cada 20 s y al volver a la pestaña vuelve
// a preguntar; en cuanto el representante autoriza, la página redirige a
// Inicio. Y hay un botón por si la persona no quiere esperar.
export function Comprobar() {
  const router = useRouter();
  const [girando, setGirando] = useState(false);
  useEffect(() => {
    const cada = window.setInterval(() => router.refresh(), 20_000);
    const onFocus = () => { if (document.visibilityState === 'visible') router.refresh(); };
    document.addEventListener('visibilitychange', onFocus);
    return () => { window.clearInterval(cada); document.removeEventListener('visibilitychange', onFocus); };
  }, [router]);
  return (
    <button type="button" className="btn-primary w-full inline-flex items-center justify-center gap-2"
      onClick={() => { setGirando(true); router.refresh(); setTimeout(() => setGirando(false), 1500); }}>
      <RefreshCw className={`w-4 h-4 ${girando ? 'animate-spin' : ''}`} aria-hidden /> Ya me autorizaron, continuar
    </button>
  );
}
