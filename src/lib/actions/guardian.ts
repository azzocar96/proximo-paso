'use server';
// Menores y su representante (regla de sep-2026).
// Toda la autorización real vive en las RPC de las migraciones 026 y 027:
// aquí no se decide nada, solo se llama y se traduce el resultado.
import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { FormState } from '@/lib/actions/auth';

function friendly(error: { code?: string; message: string }): string {
  // P0001 = raise exception escrito a mano: son mensajes pensados para leerse.
  if (error.code === 'P0001') return error.message;
  return 'No pudimos completar la acción. Vuelve a intentarlo en un minuto.';
}

/** El representante autoriza desde su enlace. No necesita cuenta. */
export async function authorizeGuardian(token: string, confirma: boolean): Promise<FormState> {
  if (!confirma) return { error: 'Marca la casilla para dar tu autorización.' };
  const supabase = createClient();
  const { data, error } = await supabase.rpc('grant_guardian_authorization', {
    p_token: token, p_confirma: true,
  });
  if (error) return { error: friendly(error) };
  const nombre = (data as any)?.menor ?? 'la cuenta';
  return { success: `Listo. Autorizaste la cuenta de ${nombre}. Ya puede usar la app.` };
}

/** El administrador autoriza a mano (habló con el representante por otra vía). */
export async function adminGrantGuardian(userId: string, motivo: string): Promise<FormState> {
  const supabase = createClient();
  const { error } = await supabase.rpc('admin_grant_guardian_authorization', {
    p_user: userId, p_motivo: motivo,
  });
  if (error) return { error: friendly(error) };
  revalidatePath('/admin/representantes');
  return { success: 'Autorización registrada.' };
}

export async function adminRevokeGuardian(userId: string, motivo: string): Promise<FormState> {
  const supabase = createClient();
  const { error } = await supabase.rpc('admin_revoke_guardian_authorization', {
    p_user: userId, p_motivo: motivo,
  });
  if (error) return { error: friendly(error) };
  revalidatePath('/admin/representantes');
  return { success: 'Permiso retirado. La cuenta queda detenida.' };
}

/** Rehace el enlace y lo devuelve para copiarlo y mandarlo por WhatsApp. */
export async function adminGuardianLink(userId: string): Promise<{ error?: string; link?: string }> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('admin_guardian_link', { p_user: userId });
  if (error) return { error: friendly(error) };
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://proximo-paso.netlify.app';
  revalidatePath('/admin/representantes');
  return { link: `${site}/autorizar/${data as string}` };
}
