'use client';
import { useState } from 'react';
import { Share2, Check } from 'lucide-react';

// Compartir con el diálogo del teléfono; si no existe, copia el enlace.
export function Compartir({ titulo, texto, url, className = '' }: { titulo: string; texto: string; url: string; className?: string }) {
  const [hecho, setHecho] = useState(false);
  const onClick = async () => {
    try {
      if (navigator.share) { await navigator.share({ title: titulo, text: texto, url }); return; }
      await navigator.clipboard.writeText(url);
      setHecho(true); setTimeout(() => setHecho(false), 2000);
    } catch { /* la persona canceló o no hay permiso: no pasa nada */ }
  };
  return (
    <button type="button" onClick={onClick} className={`btn-secondary inline-flex items-center gap-2 ${className}`}>
      {hecho ? <Check className="w-4 h-4 text-green-600" aria-hidden /> : <Share2 className="w-4 h-4" aria-hidden />}
      {hecho ? 'Enlace copiado' : 'Compartir'}
    </button>
  );
}
