'use client';
import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';

type BIP = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };
const LLAVE = 'pp_instalar_oculto';

// Aviso discreto para instalar la app en el teléfono. En Android/Chrome usa el
// diálogo nativo; en iPhone explica el gesto (Safari no ofrece diálogo).
// Se puede cerrar, y se recuerda en el navegador para no insistir.
export function InstalarApp() {
  const [bip, setBip] = useState<BIP | null>(null);
  const [ios, setIos] = useState(false);
  const [oculto, setOculto] = useState(true);

  useEffect(() => {
    try { if (localStorage.getItem(LLAVE)) return; } catch { /* sin almacenamiento: se muestra igual */ }
    const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
    if (standalone) return;
    const esIos = /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent);
    setIos(esIos);
    setOculto(!esIos);
    const onBip = (e: Event) => { e.preventDefault(); setBip(e as BIP); setOculto(false); };
    window.addEventListener('beforeinstallprompt', onBip);
    return () => window.removeEventListener('beforeinstallprompt', onBip);
  }, []);

  if (oculto) return null;
  const cerrar = () => { setOculto(true); try { localStorage.setItem(LLAVE, '1'); } catch { /* nada */ } };
  return (
    <div className="card !py-3 flex items-center gap-3 border-brand-200/60 bg-brand-50/40">
      <span className="w-9 h-9 rounded-xl bg-white border border-brand-100 inline-flex items-center justify-center shrink-0">
        <Download className="w-4 h-4 text-brand-600" aria-hidden />
      </span>
      <div className="text-sm min-w-0 flex-1">
        <p className="font-semibold">Lleva Próximo Paso en tu teléfono</p>
        <p className="text-gray-600">
          {ios ? 'En Safari toca Compartir y luego "Añadir a pantalla de inicio".' : 'Instálala como app: abre más rápido y sin buscar el enlace.'}
        </p>
      </div>
      {bip && (
        <button onClick={async () => { await bip.prompt(); const r = await bip.userChoice; if (r.outcome === 'accepted') cerrar(); }}
          className="btn-primary !py-1.5 !px-3 shrink-0">Instalar</button>
      )}
      <button onClick={cerrar} aria-label="Cerrar" className="text-gray-400 hover:text-gray-700 shrink-0"><X className="w-4 h-4" aria-hidden /></button>
    </div>
  );
}
