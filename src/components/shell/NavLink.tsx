'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';

// El mismo enlace, sabiendo dónde está la persona. Antes ningún botón del
// menú marcaba la pantalla actual.
export function NavLink({ href, label, Icon, variant = 'side', accent = false }: {
  href: string; label: string; Icon: LucideIcon; variant?: 'side' | 'bottom'; accent?: boolean;
}) {
  const path = usePathname();
  const active = path === href || (href !== '/inicio' && path.startsWith(href + '/'));
  if (variant === 'bottom') {
    return (
      <Link href={href} aria-current={active ? 'page' : undefined}
        className={`relative flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition-colors ${active ? 'text-brand-600' : 'text-gray-500 hover:text-gray-900'}`}>
        {active && <span aria-hidden className="absolute top-0 h-0.5 w-8 rounded-full bg-brand-600" />}
        <Icon className="w-5 h-5" aria-hidden />{label}
      </Link>
    );
  }
  return (
    <Link href={href} aria-current={active ? 'page' : undefined}
      className={`nav-item ${active ? '!bg-brand-50 !text-brand-700' : ''} ${accent ? '!text-brand-700 hover:!bg-brand-50' : ''}`}>
      <Icon className={`nav-item-icon ${active || accent ? '!text-brand-600' : ''}`} aria-hidden /> {label}
    </Link>
  );
}
