'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { User, Bell, MessageSquare, LifeBuoy, LogOut, ChevronDown } from 'lucide-react';
import { signOut } from '@/lib/actions/auth';
import { Avatar } from '@/components/ui/Avatar';

// Tocar el avatar abre el menú de la cuenta. Es la única salida en el
// teléfono (la barra inferior no tiene "Cerrar sesión") y en el escritorio
// evita bajar hasta el final de la lateral.
export function AvatarMenu({ iniciales, nombre, email, foto }: { iniciales: string; nombre: string; email: string; foto?: string | null }) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent | TouchEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false); };
    document.addEventListener('mousedown', fuera);
    document.addEventListener('touchstart', fuera);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', fuera);
      document.removeEventListener('touchstart', fuera);
      document.removeEventListener('keydown', esc);
    };
  }, [abierto]);

  const item = 'flex items-center gap-2.5 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 rounded-lg';
  return (
    <div ref={ref} className="relative ml-1">
      <button type="button" onClick={() => setAbierto((v) => !v)} aria-haspopup="menu" aria-expanded={abierto} aria-label="Menú de tu cuenta"
        className="inline-flex items-center gap-1 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
        <Avatar texto={iniciales} foto={foto} />
        <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${abierto ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {abierto && (
        <div role="menu" className="absolute right-0 mt-2 w-64 rounded-xl bg-white border border-gray-200 shadow-[0_12px_32px_rgb(0_0_0/0.12)] p-1.5 z-50">
          <div className="px-3 py-2.5 border-b border-gray-100 mb-1">
            <p className="text-sm font-semibold truncate">{nombre}</p>
            <p className="text-xs text-gray-500 truncate">{email}</p>
          </div>
          <Link href="/perfil" role="menuitem" className={item} onClick={() => setAbierto(false)}><User className="w-4 h-4 text-gray-400" aria-hidden /> Mi perfil</Link>
          <Link href="/notificaciones" role="menuitem" className={item} onClick={() => setAbierto(false)}><Bell className="w-4 h-4 text-gray-400" aria-hidden /> Notificaciones</Link>
          <Link href="/mensajes" role="menuitem" className={item} onClick={() => setAbierto(false)}><MessageSquare className="w-4 h-4 text-gray-400" aria-hidden /> Mensajes</Link>
          <Link href="/ayuda" role="menuitem" className={item} onClick={() => setAbierto(false)}><LifeBuoy className="w-4 h-4 text-gray-400" aria-hidden /> Ayuda</Link>
          <div className="border-t border-gray-100 my-1" />
          <form action={signOut}>
            <button type="submit" role="menuitem" className={`${item} w-full text-left !text-red-700 hover:!bg-red-50`}>
              <LogOut className="w-4 h-4" aria-hidden /> Cerrar sesión
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
