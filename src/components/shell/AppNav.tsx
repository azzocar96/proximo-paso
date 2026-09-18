'use client';
import {
  Home, TrendingUp, ScanLine, Megaphone, User, BookOpen, HeartHandshake, MessageSquare,
  Mic, Wrench, Users, Newspaper, Inbox, HandHeart,
} from 'lucide-react';
import { NavLink } from './NavLink';

// Los íconos viven AQUÍ, del lado del cliente. Un componente de servidor no
// puede pasar un ícono (una función) como prop a uno de cliente: compila, el
// build pasa, y revienta en producción en cuanto alguien entra con sesión.
// Ese fue el error "Algo salió mal de nuestro lado" del 18-sep.
const NAV = [
  { href: '/inicio', label: 'Inicio', Icon: Home },
  { href: '/progreso', label: 'Progreso', Icon: TrendingUp },
  { href: '/escanear', label: 'Asistir', Icon: ScanLine },
  { href: '/anuncios', label: 'Anuncios', Icon: Megaphone },
  { href: '/perfil', label: 'Perfil', Icon: User },
];

export type NavFlags = {
  canSeeMinistries: boolean; canSeeWall: boolean;
  isServant: boolean; isLeader: boolean; isSpeaker: boolean; isStaff: boolean;
};

export function SideNav({ f }: { f: NavFlags }) {
  return (
    <>
      {NAV.map((item) => <NavLink key={item.href} {...item} />)}
      <NavLink href="/curso" label="Mi curso" Icon={BookOpen} />
      {f.canSeeMinistries && <NavLink href="/ministerios" label="Ministerios" Icon={HeartHandshake} />}
      {f.canSeeWall && <NavLink href="/muro" label="Muro" Icon={Newspaper} />}
      <NavLink href="/solicitudes" label="Solicitudes" Icon={Inbox} />
      <NavLink href="/mensajes" label="Mensajes" Icon={MessageSquare} />
      {(f.isSpeaker || f.isStaff || f.isLeader || f.isServant) && <div className="my-2 border-t border-gray-100" />}
      {f.isServant && <NavLink href="/servicio" label="Mi servicio" Icon={HandHeart} accent />}
      {f.isLeader && <NavLink href="/liderazgo" label="Mi ministerio" Icon={Users} accent />}
      {f.isSpeaker && <NavLink href="/orador" label="Mi paso" Icon={Mic} accent />}
      {f.isStaff && <NavLink href="/admin" label="Panel admin" Icon={Wrench} accent />}
    </>
  );
}

export function BottomNav() {
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur border-t border-gray-200 grid grid-cols-5 z-40 pb-[env(safe-area-inset-bottom)]" aria-label="Navegación principal">
      {NAV.map((item) => <NavLink key={item.href} {...item} variant="bottom" />)}
    </nav>
  );
}
