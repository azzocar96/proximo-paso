import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export type Role = 'participant' | 'coordinator' | 'admin' | 'superadmin';

export async function getSession() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function requireUser() {
  const { supabase, user } = await getSession();
  if (!user) redirect('/login');
  return { supabase, user };
}

export async function getRole(): Promise<Role> {
  const { supabase, user } = await getSession();
  if (!user) return 'participant';
  const { data } = await supabase.rpc('fn_role');
  return (data as Role) ?? 'participant';
}

export async function requireStaff() {
  const { supabase, user } = await requireUser();
  const { data: role } = await supabase.rpc('fn_role');
  if (!['coordinator', 'admin', 'superadmin'].includes(role as string)) redirect('/inicio');
  return { supabase, user, role: role as Role };
}

export async function requireAdmin() {
  const { supabase, user, role } = await requireStaff();
  if (!['admin', 'superadmin'].includes(role)) redirect('/admin');
  return { supabase, user, role };
}

/**
 * "Líder de ministerio" no es un rol jerárquico de user_roles: es un alcance
 * transversal (ministry_leaders) que solo permite ver a quienes marcaron
 * interés en el ministerio que lidera (impuesto por RLS, no por este chequeo).
 * Los admins/superadmins también pasan (fn_is_ministry_leader() los incluye).
 */
export async function requireMinistryLeader() {
  const { supabase, user } = await requireUser();
  const { data: isLeader } = await supabase.rpc('fn_is_ministry_leader');
  if (!isLeader) redirect('/inicio');
  return { supabase, user };
}
