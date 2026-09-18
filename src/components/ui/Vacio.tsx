import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';

// Estado vacío con intención: un ícono, una frase que explica y, si aplica, el
// siguiente paso. Nunca un "no hay datos" a secas.
export function Vacio({ Icon, titulo, texto, accion }: {
  Icon: LucideIcon; titulo: string; texto?: string; accion?: { href: string; label: string };
}) {
  return (
    <div className="card text-center py-10 flex flex-col items-center gap-3">
      <span className="w-12 h-12 rounded-2xl bg-gray-50 border border-gray-100 inline-flex items-center justify-center">
        <Icon className="w-5 h-5 text-gray-400" aria-hidden />
      </span>
      <p className="font-semibold">{titulo}</p>
      {texto && <p className="text-sm text-gray-500 max-w-sm">{texto}</p>}
      {accion && <Link href={accion.href} className="btn-primary mt-1">{accion.label}</Link>}
    </div>
  );
}
