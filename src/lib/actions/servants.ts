'use server';
// Fase 3g — servidores de ministerio y solicitudes en un solo lugar.
// Toda la autorización real vive en las RPC de la migración 019.
import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { FormState } from '@/lib/actions/auth';

function friendly(error: { code?: string; message: string }): string {
  // P0001 = raise exception escrito a mano: son mensajes pensados para leerse.
  if (error.code === 'P0001') return error.message;
  return 'No pudimos completar la acción. Vuelve a intentarlo en un minuto.';
}

export type ServantPerms = {
  title: string; contact: string; notes: string;
  showInProfile: boolean; canShowQr: boolean; canApproveAttendance: boolean;
  canPostWall: boolean; canGiveInfo: boolean; canAddMembers: boolean;
  steps: number[];
};

export async function setMinistryServant(ministryId: string, userId: string, p: ServantPerms): Promise<FormState> {
  if (!userId) return { error: 'Elige a la persona de tu equipo.' };
  const supabase = createClient();
  const { data, error } = await supabase.rpc('set_ministry_servant', {
    p_ministry: ministryId, p_user: userId,
    p_title: p.title || null, p_contact: p.contact || null, p_notes: p.notes || null,
    p_show_in_profile: p.showInProfile,
    p_can_show_qr: p.canShowQr,
    p_can_approve_attendance: p.canApproveAttendance,
    p_can_post_wall: p.canPostWall,
    p_can_give_info: p.canGiveInfo,
    p_can_add_members: p.canAddMembers,
    p_steps: p.steps.length ? p.steps : null,
  });
  if (error) return { error: friendly(error) };
  revalidateAll();
  const name = (data as any)?.name;
  return { success: name ? `Listo. ${name} queda con lo que le marcaste.` : 'Servidor guardado.' };
}

export async function removeMinistryServant(ministryId: string, userId: string): Promise<FormState> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('remove_ministry_servant', {
    p_ministry: ministryId, p_user: userId,
  });
  if (error) return { error: friendly(error) };
  revalidateAll();
  const name = (data as any)?.name;
  return { success: name ? `${name} deja de ser servidora. Sigue en tu equipo.` : 'Servidor retirado.' };
}

export async function requestMinistryDirector(ministryId: string, details: string): Promise<FormState> {
  if (!ministryId) return { error: 'Elige el ministerio que quieres dirigir.' };
  const supabase = createClient();
  const { error } = await supabase.rpc('request_ministry_director', {
    p_ministry: ministryId, p_details: details,
  });
  if (error) return { error: friendly(error) };
  revalidatePath('/solicitudes');
  return { success: 'Solicitud enviada. El administrador la verá y la respuesta aparecerá aquí.' };
}

export async function resolveDirectorRequest(requestId: string, accept: boolean, note?: string): Promise<FormState> {
  if (!accept && (!note || note.trim().length < 5)) {
    return { error: 'Escribe el motivo (mínimo 5 caracteres). La persona lo va a leer.' };
  }
  const supabase = createClient();
  const { data, error } = await supabase.rpc('resolve_director_request', {
    p_request: requestId, p_accept: accept, p_note: note || null,
  });
  if (error) return { error: friendly(error) };
  revalidateAll();
  const name = (data as any)?.name;
  return {
    success: accept
      ? (name ? `${name} ya dirige ese ministerio.` : 'Aprobada.')
      : (name ? `Solicitud de ${name} rechazada con tu motivo.` : 'Rechazada.'),
  };
}

function revalidateAll() {
  revalidatePath('/solicitudes');
  revalidatePath('/liderazgo');
  revalidatePath('/ministerios');
  revalidatePath('/servicio');
  revalidatePath('/admin/usuarios');
}
