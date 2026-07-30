import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { signOut } from '@/lib/actions/auth';

const NAV = [
  { href: '/inicio', label: 'Inicio', icon: '🏠' },
  { href: '/progreso', label: 'Progreso', icon: '📈' },
  { href: '/escanear', label: 'Asistir', icon: '📷' },
  { href: '/anuncios', label: 'Anuncios', icon: '📣' },
  { href: '/perfil', label: 'Perfil', icon: '👤' },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { supabase, user } = await requireUser();
  const [{ data: role }, { data: mySpeakerSteps }] = await Promise.all([
    supabase.rpc('fn_role'),
    supabase.from('step_speakers').select('step_number').eq('user_id', user.id),
  ]);
  // Nota (Fase 3a): "admin" quedó inerte — el nivel más alto ahora es pastor/superadmin.
  const isStaff = ['coordinator', 'pastor', 'superadmin'].includes(role as string);
  const isSpeaker = (mySpeakerSteps ?? []).length > 0;
  return (
    <div className="min-h-screen pb-24 md:pb-0 md:flex">
      <aside className="hidden md:flex md:flex-col w-60 shrink-0 bg-brand-800 text-white min-h-screen p-4 gap-1">
        <div className="px-2 py-4">
          {/* Logo real de la iglesia (logo.png), no el ícono placeholder */}
          <div className="bg-white rounded-xl px-3 py-2 inline-block">
            <img src="/logo.png" alt="Próximo Paso" className="h-8 w-auto" />
          </div>
        </div>
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className="rounded-xl px-4 py-3 hover:bg-brand-700 font-medium">
            {n.icon} {n.label}
          </Link>
        ))}
        <Link href="/curso" className="rounded-xl px-4 py-3 hover:bg-brand-700 font-medium">📚 Mi curso</Link>
        <Link href="/ministerios" className="rounded-xl px-4 py-3 hover:bg-brand-700 font-medium">🤝 Ministerios</Link>
        <Link href="/contacto" className="rounded-xl px-4 py-3 hover:bg-brand-700 font-medium">✉️ Contacto</Link>
        {isSpeaker && <Link href="/orador" className="rounded-xl px-4 py-3 bg-accent/20 hover:bg-accent/30 font-medium">🎤 Mi paso</Link>}
        {isStaff && <Link href="/admin" className="rounded-xl px-4 py-3 bg-accent/20 hover:bg-accent/30 font-medium">🛠️ Panel admin</Link>}
        <form action={signOut} className="mt-auto">
          <button className="rounded-xl px-4 py-3 hover:bg-brand-700 font-medium w-full text-left">🚪 Cerrar sesión</button>
        </form>
      </aside>
      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-6">{children}</main>
      <nav className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 grid grid-cols-5 z-40" aria-label="Navegación principal">
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className="flex flex-col items-center py-2.5 text-xs font-medium text-gray-600 hover:text-brand-600">
            <span className="text-xl" aria-hidden>{n.icon}</span>{n.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
