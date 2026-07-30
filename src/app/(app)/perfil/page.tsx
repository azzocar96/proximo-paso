import Link from 'next/link';
import { User, Users, BookOpen, HeartHandshake, Mail, Mic, Wrench, ChevronRight, Newspaper } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { ProfileForm, AvatarForm } from './ui';
import { signOut } from '@/lib/actions/auth';

export const metadata = { title: 'Mi perfil' };
export default async function PerfilPage() {
  const { supabase, user } = await requireUser();
  const [{ data: profile }, { data: role }, { data: mySpeakerSteps }, { data: myLedMinistries }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.rpc('fn_role'),
    supabase.from('step_speakers').select('step_number').eq('user_id', user.id),
    supabase.from('ministry_leaders').select('ministry_id').eq('user_id', user.id),
  ]);
  const isStaff = ['coordinator', 'pastor', 'superadmin'].includes(role as string);
  const isSpeaker = (mySpeakerSteps ?? []).length > 0;
  const quickLinks = [
    { href: '/curso', label: 'Mi curso', Icon: BookOpen },
    { href: '/ministerios', label: 'Ministerios', Icon: HeartHandshake },
    { href: '/contacto', label: 'Contacto', Icon: Mail },
    { href: '/muro', label: 'Muro', Icon: Newspaper },
    ...((myLedMinistries ?? []).length > 0 || ['pastor', 'superadmin'].includes(role as string)
      ? [{ href: '/liderazgo', label: 'Mi ministerio (director)', Icon: Users }] : []),
    ...(isSpeaker ? [{ href: '/orador', label: 'Mi paso (orador)', Icon: Mic }] : []),
    ...(isStaff ? [{ href: '/admin', label: 'Panel admin', Icon: Wrench }] : []),
  ];
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold">Mi perfil</h1>
      <div className="card flex items-center gap-4">
        {profile?.photo_url
          ? <img src={profile.photo_url} alt="Foto de perfil" className="w-16 h-16 rounded-full object-cover" />
          : <div className="w-16 h-16 rounded-full bg-brand-50 flex items-center justify-center text-brand-600"><User className="w-7 h-7" aria-hidden /></div>}
        <div className="flex-1">
          <p className="font-bold">{profile?.first_name} {profile?.last_name}</p>
          <p className="text-sm text-gray-600">{profile?.email}</p>
        </div>
      </div>
      {/* En móvil no hay sidebar: estos accesos solo viven aquí (fix auditoría fase 3) */}
      <section className="md:hidden card !p-2 divide-y divide-gray-100">
        {quickLinks.map(({ href, label, Icon }) => (
          <Link key={href} href={href} className="flex items-center gap-3 px-3 py-3 text-sm font-medium text-gray-700">
            <Icon className="w-[18px] h-[18px] text-brand-600 shrink-0" aria-hidden />
            <span className="flex-1">{label}</span>
            <ChevronRight className="w-4 h-4 text-gray-300" aria-hidden />
          </Link>
        ))}
      </section>
      <AvatarForm />
      <ProfileForm profile={profile} />
      <form action={signOut} className="md:hidden">
        <button className="btn-secondary w-full">Cerrar sesión</button>
      </form>
    </div>
  );
}
