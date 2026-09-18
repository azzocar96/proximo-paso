'use server';
// Notificaciones y mensajes (migración 029). Todo pasa por funciones de la
// base: aquí solo se llama y se traduce el error a algo legible.
import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { FormState } from '@/lib/actions/auth';

function friendly(error: { code?: string; message: string }): string {
  if (error.code === 'P0001') return error.message;
  console.error('[bandejas]', error.code, error.message);
  return 'No pudimos completar la acción. Vuelve a intentarlo en un minuto.';
}

export async function marcarNotificacionesLeidas(ids?: string[]): Promise<FormState> {
  const supabase = createClient();
  const { error } = await supabase.rpc('mark_notifications_read', { p_ids: ids ?? null });
  if (error) return { error: friendly(error) };
  // A propósito NO se revalida /notificaciones: la lista recién abierta debe
  // seguir mostrando qué era nuevo; el contador de la barra sí se limpia.
  return { success: 'Listo.' };
}

export async function abrirConversacion(_prev: FormState, formData: FormData): Promise<FormState> {
  const supabase = createClient();
  const scope = String(formData.get('scope') ?? 'church');
  const { data, error } = await supabase.rpc('start_conversation', {
    p_subject: String(formData.get('subject') ?? ''),
    p_body: String(formData.get('body') ?? ''),
    p_scope: scope,
    p_ministry: scope === 'ministry' ? String(formData.get('ministry_id') ?? '') || null : null,
    p_step: scope === 'step' ? Number(formData.get('step_number') ?? 0) || null : null,
    p_member: String(formData.get('member_id') ?? '') || null,
  });
  if (error) return { error: friendly(error) };
  revalidatePath('/mensajes');
  redirect(`/mensajes/${data}`);
}

export async function responderConversacion(_prev: FormState, formData: FormData): Promise<FormState> {
  const supabase = createClient();
  const id = String(formData.get('conversation_id') ?? '');
  const { error } = await supabase.rpc('send_message', { p_conversation: id, p_body: String(formData.get('body') ?? '') });
  if (error) return { error: friendly(error) };
  revalidatePath(`/mensajes/${id}`);
  revalidatePath('/mensajes');
  return { success: 'Enviado.' };
}
