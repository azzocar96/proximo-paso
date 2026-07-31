'use server';
// Fase 3f — "ya soy miembro activo": la persona lo pide, alguien con autoridad lo aprueba.
// Toda la autorización real vive en las RPCs de la migración 017.
import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { FormState } from '@/lib/actions/auth';

/**
 * Los mensajes escritos a mano en las RPC (código P0001) están pensados para
 * que los lea cualquiera y se muestran tal cual. Cualquier otro error de
 * Postgres o de PostgREST es ruido técnico: "Could not find the function
 * public.request_active_member in the schema cache" no le dice nada a nadie.
 */
function friendly(error: { code?: string; message: string }): string {
  if (error.code === 'P0001') return error.message;
  return 'No pudimos completar la acción. Vuelve a intentarlo en un minuto.';
}

export async function requestActiveMember(note: string): Promise<FormState> {
  const supabase = createClient();
  const { error } = await supabase.rpc('request_active_member', { p_note: note || null });
  if (error) return { error: friendly(error) };
  revalidatePath('/perfil');
  return { success: 'Listo. Tu solicitud quedó en revisión: alguien del equipo la verá y la respuesta aparecerá aquí mismo, en tu perfil.' };
}

export async function cancelActiveMemberRequest(): Promise<FormState> {
  const supabase = createClient();
  const { error } = await supabase.rpc('cancel_active_member_request');
  if (error) return { error: friendly(error) };
  revalidatePath('/perfil');
  return { success: 'Retiraste tu solicitud.' };
}

export async function approveActiveMember(userId: string, note?: string): Promise<FormState> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('approve_active_member', {
    p_user: userId, p_note: note || null,
  });
  if (error) return { error: friendly(error) };
  revalidateReviewPages();
  const name = (data as any)?.name;
  return { success: name ? `${name} ya es miembro activo.` : 'Aprobado.' };
}

export async function rejectActiveMember(userId: string, reason: string): Promise<FormState> {
  if (!reason || reason.trim().length < 5) {
    return { error: 'Escribe el motivo (mínimo 5 caracteres). La persona lo va a leer.' };
  }
  const supabase = createClient();
  const { data, error } = await supabase.rpc('reject_active_member', {
    p_user: userId, p_reason: reason,
  });
  if (error) return { error: friendly(error) };
  revalidateReviewPages();
  const name = (data as any)?.name;
  return { success: name ? `Solicitud de ${name} rechazada con tu motivo.` : 'Solicitud rechazada.' };
}

function revalidateReviewPages() {
  revalidatePath('/liderazgo');
  revalidatePath('/admin/usuarios');
  revalidatePath('/perfil');
}
