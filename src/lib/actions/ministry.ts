'use server';
// Fase 3b — solicitudes de ministerio y autogestión del miembro.
// Toda la autorización real vive en las RPCs de la migración 011.
import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { FormState } from '@/lib/actions/auth';

export async function requestMinistryJoin(ministryIds: string[]): Promise<FormState> {
  if (!ministryIds || ministryIds.length === 0) return { error: 'Elige al menos un ministerio.' };
  const supabase = createClient();
  const { error } = await supabase.rpc('request_ministry_join', { p_ministries: ministryIds });
  if (error) return { error: friendly(error) };
  revalidatePath('/liderazgo');
  revalidatePath('/ministerios');
  return { success: 'Solicitud enviada. Los directores de tus ministerios elegidos la verán y el primero que te acepte te suma a su equipo.' };
}

export async function requestLeave(currentMinistryId: string, details: string): Promise<FormState> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Sesión no válida.' };
  const { error } = await supabase.from('member_requests').insert({
    user_id: user.id, kind: 'leave', target_ministry_id: currentMinistryId, details: details || null,
  });
  if (error) return { error: friendly(error) };
  revalidatePath('/ministerios');
  revalidatePath('/liderazgo');
  return { success: 'Solicitud de baja enviada al director de tu ministerio.' };
}

export async function requestSwitch(targetMinistryId: string, details: string): Promise<FormState> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Sesión no válida.' };
  const { error } = await supabase.from('member_requests').insert({
    user_id: user.id, kind: 'switch', target_ministry_id: targetMinistryId, details: details || null,
  });
  if (error) return { error: friendly(error) };
  revalidatePath('/ministerios');
  revalidatePath('/liderazgo');
  return { success: 'Solicitud de cambio enviada al director del ministerio destino. Si te acepta, saldrás automáticamente del actual.' };
}

export async function requestRoleChange(details: string): Promise<FormState> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Sesión no válida.' };
  if (!details || details.trim().length < 5) return { error: 'Cuéntanos qué cambio de rol pides y por qué (mínimo 5 caracteres).' };
  const { error } = await supabase.from('member_requests').insert({
    user_id: user.id, kind: 'role_change', details,
  });
  if (error) return { error: friendly(error) };
  revalidatePath('/ministerios');
  revalidatePath('/admin/usuarios');
  return { success: 'Solicitud enviada al administrador general.' };
}

export async function cancelMemberRequest(requestId: string): Promise<FormState> {
  const supabase = createClient();
  const { error } = await supabase.rpc('cancel_member_request', { p_request: requestId });
  if (error) return { error: error.message };
  revalidatePath('/ministerios');
  return { success: 'Solicitud cancelada.' };
}

// ---------- lado director ----------
export async function acceptMinistryJoin(requestId: string, ministryId: string): Promise<FormState> {
  const supabase = createClient();
  const { error } = await supabase.rpc('accept_ministry_join', { p_request: requestId, p_ministry: ministryId });
  if (error) return { error: error.message };
  revalidatePath('/liderazgo');
  return { success: 'Persona aceptada en tu ministerio.' };
}

export async function acceptMemberRequest(requestId: string, note?: string): Promise<FormState> {
  const supabase = createClient();
  const { error } = await supabase.rpc('accept_member_request', { p_request: requestId, p_note: note || null });
  if (error) return { error: error.message };
  revalidatePath('/liderazgo');
  revalidatePath('/admin/usuarios');
  return { success: 'Solicitud aceptada.' };
}

export async function rejectMemberRequest(requestId: string, note: string): Promise<FormState> {
  const supabase = createClient();
  const { error } = await supabase.rpc('reject_member_request', { p_request: requestId, p_note: note });
  if (error) return { error: error.message };
  revalidatePath('/liderazgo');
  revalidatePath('/admin/usuarios');
  return { success: 'Solicitud rechazada.' };
}

export async function removeMinistryMember(ministryId: string, userId: string, reason: string): Promise<FormState> {
  const supabase = createClient();
  const { error } = await supabase.rpc('remove_ministry_member', { p_ministry: ministryId, p_user: userId, p_reason: reason });
  if (error) return { error: error.message };
  revalidatePath('/liderazgo');
  return { success: 'La persona fue dada de baja del ministerio y vuelve a la comunidad general.' };
}

function friendly(error: { code?: string; message: string }): string {
  if (error.code === '23505') return 'Ya tienes una solicitud pendiente de este tipo. Cancélala primero si quieres cambiarla.';
  // 42501 = la política de seguridad rechazó la fila. Con las reglas de la 013 esto
  // ocurre cuando alguien pide algo reservado a quienes ya completaron el curso.
  if (error.code === '42501') return 'Esta solicitud está reservada a quienes ya completaron el curso y forman parte de un ministerio.';
  return error.message;
}
