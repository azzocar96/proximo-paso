// Iniciales sobre un fondo suave. Sin foto de perfil a propósito: no hay
// almacenamiento de imágenes de personas (menores incluidos) y no hace falta.
export function iniciales(nombre?: string | null, apellido?: string | null): string {
  const a = (nombre ?? '').trim()[0] ?? '';
  const b = (apellido ?? '').trim()[0] ?? '';
  return (a + b).toUpperCase() || '·';
}

export function Avatar({ texto, size = 'md', className = '' }: { texto: string; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const dims = { sm: 'w-7 h-7 text-[11px]', md: 'w-9 h-9 text-xs', lg: 'w-14 h-14 text-lg' }[size];
  return (
    <span aria-hidden className={`inline-flex items-center justify-center rounded-full bg-brand-50 text-brand-700 font-bold tracking-wide ring-1 ring-brand-100 ${dims} ${className}`}>
      {texto}
    </span>
  );
}
