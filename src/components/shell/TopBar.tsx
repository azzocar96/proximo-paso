'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Bell, Inbox, MessageSquare } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Avatar } from '@/components/ui/Avatar';

export type Contadores = { solicitudes: number; notificaciones: number; mensajes: number };

function Insignia({ n }: { n: number }) {
  if (!n) return null;
  return (
    <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-brand-600 text-white text-[10px] font-bold inline-flex items-center justify-center ring-2 ring-white tabular-nums">
      {n > 99 ? '99+' : n}
    </span>
  );
}

// La barra de arriba: tres bandejas con contador y el avatar. Los números
// llegan del servidor en el primer pintado y después se refrescan solos: al
// cambiar de pantalla, al volver a la pestaña, y en vivo cuando entra un aviso
// o un mensaje (Realtime sobre las tablas de la 029). Si algo falla, la barra
// simplemente no muestra números; nunca rompe la página.
export function TopBar({ userId, iniciales, nombre, inicial }: {
  userId: string; iniciales: string; nombre: string; inicial: Contadores;
}) {
  const [c, setC] = useState<Contadores>(inicial);
  const path = usePathname();

  const refrescar = useCallback(async () => {
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc('fn_my_counters');
      if (error) { console.error('[topbar/fn_my_counters]', error.message); return; }
      if (data) setC(data as Contadores);
    } catch (e) { console.error('[topbar]', (e as Error)?.message ?? e); }
  }, []);

  useEffect(() => { refrescar(); }, [path, refrescar]);

  useEffect(() => {
    const onFocus = () => { if (document.visibilityState === 'visible') refrescar(); };
    document.addEventListener('visibilitychange', onFocus);
    window.addEventListener('focus', onFocus);
    const supabase = createClient();
    const canal = supabase.channel(`bandejas-${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, refrescar)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, refrescar)
      .subscribe();
    const cada = window.setInterval(refrescar, 90_000);
    return () => {
      document.removeEventListener('visibilitychange', onFocus);
      window.removeEventListener('focus', onFocus);
      window.clearInterval(cada);
      supabase.removeChannel(canal);
    };
  }, [userId, refrescar]);

  const items = [
    { href: '/solicitudes', label: 'Solicitudes', Icon: Inbox, n: c.solicitudes },
    { href: '/notificaciones', label: 'Notificaciones', Icon: Bell, n: c.notificaciones },
    { href: '/mensajes', label: 'Mensajes', Icon: MessageSquare, n: c.mensajes },
  ];

  return (
    <header className="sticky top-0 z-30 glass border-b border-gray-200/70">
      <div className="max-w-3xl mx-auto w-full px-4 h-14 flex items-center gap-2">
        <Link href="/inicio" className="md:hidden mr-auto" aria-label="Inicio">
          <img src="/logo.png" alt="Próximo Paso" className="h-7 w-auto" />
        </Link>
        <div className="hidden md:block mr-auto text-sm text-gray-500">Hola, <span className="font-semibold text-gray-900">{nombre}</span></div>
        {items.map(({ href, label, Icon, n }) => {
          const active = path === href || path.startsWith(href + '/');
          return (
            <Link key={href} href={href} aria-label={n ? `${label} (${n} sin leer)` : label} title={label}
              className={`relative inline-flex items-center justify-center w-10 h-10 rounded-full transition-colors ${active ? 'bg-brand-50 text-brand-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`}>
              <Icon className="w-5 h-5" aria-hidden />
              <Insignia n={n} />
            </Link>
          );
        })}
        <Link href="/perfil" aria-label="Mi perfil" title="Mi perfil" className="ml-1 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
          <Avatar texto={iniciales} />
        </Link>
      </div>
    </header>
  );
}
