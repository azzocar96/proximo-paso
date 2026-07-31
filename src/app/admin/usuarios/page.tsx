import { requireAdmin } from '@/lib/auth';
import { UsersTable, RoleChangeRequests } from './ui';
import { ActiveMemberRequests } from '@/components/ActiveMemberRequests';
import { fmtDate } from '@/lib/utils';
import Link from 'next/link';

export const metadata = { title: 'Usuarios' };
export default async function UsuariosPage({ searchParams }: { searchParams: { q?: string } }) {
  const { supabase, role } = await requireAdmin();
  const q = (searchParams.q ?? '').trim();
  let query = supabase.from('profiles')
    .select('id,first_name,last_name,email,phone,account_status,created_at, user_roles!user_roles_user_id_fkey(role)')
    .order('created_at', { ascending: false }).limit(100);
  if (q) query = query.or(`email.ilike.%${q}%,first_name.ilike.%${q}%,last_name.ilike.%${q}%,phone.ilike.%${q}%`);
  const { data: users } = await query;
  const { data: roleRequests } = await supabase.from('member_requests')
    .select('id,details,created_at, profiles!member_requests_user_id_fkey(first_name,last_name,email)')
    .eq('kind', 'role_change').eq('status', 'pending').order('created_at');
  // Fase 3c: quiénes tienen permiso puntual de publicar en el muro general
  const { data: publisherRows, error: publishersError } = await supabase.from('wall_publishers').select('user_id');
  const publishers = (publisherRows ?? []).map((r: { user_id: string }) => r.user_id);
  // Fase 3f: los que dicen que ya hicieron el curso antes de existir la app.
  const { data: activeReqs, error: activeReqsError } = await supabase.rpc('get_active_member_requests');
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold">Usuarios</h1>
      <form className="flex gap-2 max-w-md">
        <input className="input" name="q" defaultValue={q} placeholder="Buscar por nombre, correo o teléfono" />
        <button className="btn-secondary !py-2">Buscar</button>
      </form>
      {publishersError && (
        <p className="text-xs text-red-600">
          No se pudo leer quién puede publicar en el muro: {publishersError.message}
        </p>
      )}
      <ActiveMemberRequests requests={((activeReqs as any[]) ?? []) as any} loadError={activeReqsError?.message ?? null} />
      {(roleRequests ?? []).length > 0 && (
        <RoleChangeRequests requests={(roleRequests as any[]).map((r) => ({ ...r, since: fmtDate(r.created_at) }))} />
      )}
      <UsersTable users={(users as any) ?? []} canSetRoles={role === 'superadmin' || role === 'pastor'} publishers={publishers} />
      <p className="text-xs text-gray-500">
        Solo el administrador o el pastor pueden cambiar roles. Ver la ficha completa de cada participante desde
        {' '}<Link href="/admin/ciclos" className="underline">su ciclo</Link> o buscándolo aquí.
      </p>
    </div>
  );
}
