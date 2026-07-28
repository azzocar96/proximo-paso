import { requireUser } from '@/lib/auth';
import { ProfileForm, AvatarForm } from './ui';
import { signOut } from '@/lib/actions/auth';

export const metadata = { title: 'Mi perfil' };
export default async function PerfilPage() {
  const { supabase, user } = await requireUser();
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold">Mi perfil</h1>
      <div className="card flex items-center gap-4">
        {profile?.photo_url
          ? <img src={profile.photo_url} alt="Foto de perfil" className="w-16 h-16 rounded-full object-cover" />
          : <div className="w-16 h-16 rounded-full bg-brand-100 flex items-center justify-center text-2xl">👤</div>}
        <div className="flex-1">
          <p className="font-bold">{profile?.first_name} {profile?.last_name}</p>
          <p className="text-sm text-gray-600">{profile?.email}</p>
        </div>
      </div>
      <AvatarForm />
      <ProfileForm profile={profile} />
      <form action={signOut} className="md:hidden">
        <button className="btn-secondary w-full">Cerrar sesión</button>
      </form>
    </div>
  );
}
