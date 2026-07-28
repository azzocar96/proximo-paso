import { requireAdmin } from '@/lib/auth';
import { UsersTable } from './ui';
import Link from 'next/link';

export const metadata = { title: 'Usuarios' };
export default async function UsuariosPage({ searchParams }: { searchParams: { q?: string } }) {
  const { supabase, role } = await requireAdmin();
  const q = (searchParams.q ?? '').trim();
  let query = supabase.from('profiles')
    .select('id,first_name,last_name,email,phone,account_status,created_at, user_roles(role)')
    .order('created_at', { ascending: false }).limit(100);
  if (q) query = query.or(`email.ilike.%${q}%,first_name.ilike.%${q}%,last_name.ilike.%${q}%`);
  const { data: users } = await query;
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold">Usuarios</h1>
      <form className="flex gap-2 max-w-md">
        <input className="input" name="q" defaultValue={q} placeholder="Buscar por nombre o correo" />
        <button className="btn-secondary !py-2">Buscar</button>
      </form>
      <UsersTable users={(users as any) ?? []} canSetRoles={role === 'superadmin'} />
      <p className="text-xs text-gray-500">
        Solo el superadministrador puede cambiar roles. Ver la ficha completa de cada participante desde
        {' '}<Link href="/admin/ciclos" className="underline">su ciclo</Link> o buscándolo aquí.
      </p>
    </div>
  );
}
