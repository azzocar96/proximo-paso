import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export type Role = 'participant' | 'coordinator' | 'admin' | 'superadmin' | 'pastor';

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

// Nota (Fase 3a): "admin" quedó inerte — fn_role() puede seguir devolviendo
// 'admin' para cuentas legacy, pero ya no da acceso de staff/admin. Su
// reemplazo es "director de ministerio" (fn_is_ministry_leader/ministry_leaders,
// ver requireMinistryLeader). El nivel más alto ahora es superadmin o pastor.
export async function requireStaff() {
  const { supabase, user } = await requireUser();
  const { data: role } = await supabase.rpc('fn_role');
  if (!['coordinator', 'pastor', 'superadmin'].includes(role as string)) redirect('/inicio');
  return { supabase, user, role: role as Role };
}

export async function requireAdmin() {
  const { supabase, user, role } = await requireStaff();
  if (!['pastor', 'superadmin'].includes(role)) redirect('/admin');
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
