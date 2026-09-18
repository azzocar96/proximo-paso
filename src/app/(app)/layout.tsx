import { LogOut } from 'lucide-react';
import { SideNav, BottomNav } from '@/components/shell/AppNav';
import { TopBar, type Contadores } from '@/components/shell/TopBar';
import { iniciales } from '@/components/ui/Avatar';
import { requireUser } from '@/lib/auth';
import { signOut } from '@/lib/actions/auth';
import { vigilar } from '@/lib/supabase/vigilar';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { supabase, user } = await requireUser();
  const [{ data: role }, { data: mySpeakerSteps }, { data: myLedMinistries }, { data: nav, error: navError }, perfilRes, contRes] =
    await Promise.all([
      supabase.rpc('fn_role'),
      supabase.from('step_speakers').select('step_number').eq('user_id', user.id),
      supabase.from('ministry_leaders').select('ministry_id').eq('user_id', user.id),
      supabase.rpc('fn_my_nav'),
      supabase.from('profiles').select('first_name,last_name').eq('id', user.id).maybeSingle(),
      supabase.rpc('fn_my_counters'),
    ]);
  if (perfilRes.error) console.error('[app/layout/profiles]', perfilRes.error.message);
  if (contRes.error) console.error('[app/layout/fn_my_counters]', contRes.error.message);
  const contadores: Contadores = (contRes.data as Contadores | null) ?? { solicitudes: 0, notificaciones: 0, mensajes: 0 };
  const nombre = perfilRes.data?.first_name || 'bienvenido';
  const ini = iniciales(perfilRes.data?.first_name, perfilRes.data?.last_name);
  // Fase 3g: el servidor de un ministerio no es director ni orador, pero puede
  // tener responsabilidades reales (mostrar el QR, confirmar asistencias).
  const { data: servantRoles } = await vigilar('app/(app)/layout/fn_my_servant_roles', supabase.rpc('fn_my_servant_roles'));
  const isServant = (servantRoles ?? []).length > 0;
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
  const canSeeMinistries = navFailed || nav?.can_ministries === true;
  const canSeeWall = navFailed || nav?.can_wall === true;
  return (
    <div className="min-h-screen pb-24 md:pb-0 md:flex">
      <aside className="hidden md:flex md:flex-col w-64 shrink-0 bg-white border-r border-gray-200 min-h-screen p-4 gap-0.5">
        <div className="px-3 py-4 mb-2">
          {/* Logo real de la iglesia (logo.png), no el ícono placeholder */}
          <img src="/logo.png" alt="Próximo Paso" className="h-9 w-auto" />
        </div>
        <SideNav f={{ canSeeMinistries, canSeeWall, isServant, isLeader, isSpeaker, isStaff }} />
        <form action={signOut} className="mt-auto">
          <button className="nav-item w-full text-left">
            <LogOut className="nav-item-icon" aria-hidden /> Cerrar sesión
          </button>
        </form>
      </aside>
      <div className="flex-1 min-w-0 flex flex-col">
        <TopBar userId={user.id} iniciales={ini} nombre={nombre} inicial={contadores} />
        <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-6">{children}</main>
      </div>
      <BottomNav />
    </div>
  );
}
