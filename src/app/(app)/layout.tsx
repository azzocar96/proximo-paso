import Link from 'next/link';
import {
  Home, TrendingUp, ScanLine, Megaphone, User, BookOpen,
  HeartHandshake, Mail, Mic, Wrench, LogOut, Users, Newspaper, Inbox, HandHeart,
} from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { signOut } from '@/lib/actions/auth';

const NAV = [
  { href: '/inicio', label: 'Inicio', Icon: Home },
  { href: '/progreso', label: 'Progreso', Icon: TrendingUp },
  { href: '/escanear', label: 'Asistir', Icon: ScanLine },
  { href: '/anuncios', label: 'Anuncios', Icon: Megaphone },
  { href: '/perfil', label: 'Perfil', Icon: User },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { supabase, user } = await requireUser();
  const [{ data: role }, { data: mySpeakerSteps }, { data: myLedMinistries }, { data: nav, error: navError }] =
    await Promise.all([
      supabase.rpc('fn_role'),
      supabase.from('step_speakers').select('step_number').eq('user_id', user.id),
      supabase.from('ministry_leaders').select('ministry_id').eq('user_id', user.id),
      supabase.rpc('fn_my_nav'),
    ]);
  // Fase 3g: el servidor de un ministerio no es director ni orador, pero puede
  // tener responsabilidades reales (mostrar el QR, confirmar asistencias).
  const { data: servantRoles } = await supabase.rpc('fn_my_servant_roles');
  const isServant = ((servantRoles as any[]) ?? []).length > 0;
  // Nota (Fase 3a): "admin" quedó inerte — el nivel más alto ahora es pastor/superadmin.
  const isStaff = ['coordinator', 'pastor', 'superadmin'].includes(role as string);
  const isSpeaker = (mySpeakerSteps ?? []).length > 0;
  const isLeader = (myLedMinistries ?? []).length > 0 || ['pastor', 'superadmin'].includes(role as string);
  // Regla de negocio (migración 013): ministerios y muros se abren al completar el
  // curso; quien está en proceso solo ve lo relativo a su proceso. El criterio vive
  // en fn_my_nav para que menú, perfil y páginas nunca se contradigan.
  // Si la RPC falla (por ejemplo si el front se despliega antes que la migración),
  // mostramos los enlaces: enseñar de más es recuperable, esconder de más deja a la
  // gente sin app y en silencio — la lección del incidente de permisos (migración 010).
  const navFailed = Boolean(navError);
  const canSeeMinistries = navFailed || (nav as any)?.can_ministries === true;
  const canSeeWall = navFailed || (nav as any)?.can_wall === true;
  return (
    <div className="min-h-screen pb-24 md:pb-0 md:flex">
      <aside className="hidden md:flex md:flex-col w-64 shrink-0 bg-white border-r border-gray-200 min-h-screen p-4 gap-0.5">
        <div className="px-3 py-4 mb-2">
          {/* Logo real de la iglesia (logo.png), no el ícono placeholder */}
          <img src="/logo.png" alt="Próximo Paso" className="h-9 w-auto" />
        </div>
        {NAV.map(({ href, label, Icon }) => (
          <Link key={href} href={href} className="nav-item">
            <Icon className="nav-item-icon" aria-hidden /> {label}
          </Link>
        ))}
        <Link href="/curso" className="nav-item"><BookOpen className="nav-item-icon" aria-hidden /> Mi curso</Link>
        {canSeeMinistries && (
          <Link href="/ministerios" className="nav-item"><HeartHandshake className="nav-item-icon" aria-hidden /> Ministerios</Link>
        )}
        {canSeeWall && (
          <Link href="/muro" className="nav-item"><Newspaper className="nav-item-icon" aria-hidden /> Muro</Link>
        )}
        <Link href="/solicitudes" className="nav-item"><Inbox className="nav-item-icon" aria-hidden /> Solicitudes</Link>
        <Link href="/contacto" className="nav-item"><Mail className="nav-item-icon" aria-hidden /> Contacto</Link>
        {(isSpeaker || isStaff || isLeader || isServant) && <div className="my-2 border-t border-gray-100" />}
        {isServant && (
          <Link href="/servicio" className="nav-item !text-brand-700 hover:!bg-brand-50">
            <HandHeart className="nav-item-icon !text-brand-600" aria-hidden /> Mi servicio
          </Link>
        )}
        {isLeader && (
          <Link href="/liderazgo" className="nav-item !text-brand-700 hover:!bg-brand-50">
            <Users className="nav-item-icon !text-brand-600" aria-hidden /> Mi ministerio
          </Link>
        )}
        {isSpeaker && (
          <Link href="/orador" className="nav-item !text-brand-700 hover:!bg-brand-50">
            <Mic className="nav-item-icon !text-brand-600" aria-hidden /> Mi paso
          </Link>
        )}
        {isStaff && (
          <Link href="/admin" className="nav-item !text-brand-700 hover:!bg-brand-50">
            <Wrench className="nav-item-icon !text-brand-600" aria-hidden /> Panel admin
          </Link>
        )}
        <form action={signOut} className="mt-auto">
          <button className="nav-item w-full text-left">
            <LogOut className="nav-item-icon" aria-hidden /> Cerrar sesión
          </button>
        </form>
      </aside>
      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-6">{children}</main>
      <nav className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 grid grid-cols-5 z-40" aria-label="Navegación principal">
        {NAV.map(({ href, label, Icon }) => (
          <Link key={href} href={href} className="flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium text-gray-500 hover:text-brand-600">
            <Icon className="w-5 h-5" aria-hidden />{label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
