'use server';
import { createClient } from '@/lib/supabase/server';
import { profileSchema, contactSchema } from '@/lib/schemas';
import { revalidatePath } from 'next/cache';
import type { FormState } from '@/lib/actions/auth';

export async function enroll(cycleId: string): Promise<FormState> {
  const supabase = createClient();
  const { error } = await supabase.rpc('enroll_in_cycle', { p_cycle: cycleId });
  if (error) return { error: error.message.replace(/^.*: /, '') };
  revalidatePath('/curso'); revalidatePath('/inicio');
  return { success: '¡Inscripción realizada! Nos vemos en el Paso 1.' };
}

export async function withdraw(enrollmentId: string): Promise<FormState> {
  const supabase = createClient();
  const { error } = await supabase.from('enrollments')
    .update({ status: 'withdrawn' }).eq('id', enrollmentId);
  if (error) return { error: 'No pudimos procesar el retiro.' };
  revalidatePath('/curso');
  return { success: 'Te retiraste del ciclo.' };
}

export async function updateProfile(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = profileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.errors[0].message };
  const d = parsed.data;
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Sesión no válida.' };
  // Si al editar el perfil la fecha convierte a la persona en menor, aplicamos
  // la misma regla que en el registro: no se puede quedar sin representante.
  if (d.birth_date) {
    const { data: policy } = await supabase.rpc('fn_registration_policy');
    const minAge = Number((policy as any)?.min_age ?? 18);
    const [by, bm, bd] = d.birth_date.split('-').map(Number);
    const now = new Date();
    let age = now.getFullYear() - by;
    if (now.getMonth() + 1 < bm || (now.getMonth() + 1 === bm && now.getDate() < bd)) age--;
    if (age < minAge) {
      const { data: prof } = await supabase.from('profiles')
        .select('guardian_name,guardian_contact,guardian_consent').eq('id', user.id).single();
      if (!prof?.guardian_name || !prof?.guardian_contact || prof?.guardian_consent !== true) {
        return { error: `Con esa fecha eres menor de ${minAge} años y necesitamos los datos de tu representante. Escríbenos desde Contacto y lo resolvemos.` };
      }
    }
  }
  const { error } = await supabase.from('profiles').update({
    first_name: d.first_name, middle_name: d.middle_name || null, last_name: d.last_name,
    birth_date: d.birth_date || null, phone: d.phone || null, address: d.address || null,
    city: d.city || null, state: d.state || null, zip_code: d.zip_code || null,
    emergency_contact_name: d.emergency_contact_name || null,
    emergency_contact_phone: d.emergency_contact_phone || null,
    show_birthday: d.show_birthday === 'on',
  }).eq('id', user.id);
  if (error) return { error: 'No pudimos guardar los cambios.' };
  revalidatePath('/perfil');
  return { success: 'Perfil actualizado.' };
}

// ---------- solicitar confirmación de asistencia (clase que ya pasó y no se marcó) ----------
export async function requestAttendanceApproval(sessionId: string, message: string): Promise<FormState> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('request_attendance_approval', { p_session: sessionId, p_message: message });
  if (error) return { error: error.message };
  const r = data as { ok: boolean; message: string };
  if (!r.ok) return { error: r.message };
  revalidatePath('/progreso'); revalidatePath('/inicio');
  return { success: r.message };
}

export async function uploadAvatar(formData: FormData): Promise<FormState> {
  const file = formData.get('photo') as File | null;
  if (!file || file.size === 0) return { error: 'Selecciona una imagen.' };
  if (file.size > 3 * 1024 * 1024) return { error: 'La imagen no puede superar 3 MB.' };
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return { error: 'Formato no permitido (usa JPG, PNG o WebP).' };
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Sesión no válida.' };
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `${user.id}/avatar.${ext}`;
  const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true });
  if (error) return { error: 'No pudimos subir la foto.' };
  const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);
  await supabase.from('profiles').update({ photo_url: pub.publicUrl }).eq('id', user.id);
  revalidatePath('/perfil');
  return { success: 'Foto actualizada.' };
}

export async function sendContact(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = contactSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.errors[0].message };
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from('contact_requests').insert({
    user_id: user?.id ?? null, ...parsed.data,
  });
  if (error) return { error: 'No pudimos enviar tu mensaje. Intenta de nuevo.' };
  return { success: 'Mensaje enviado. La iglesia te contactará pronto.' };
}

export async function expressMinistryInterest(ministryId: string): Promise<FormState> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Sesión no válida.' };
  const { error } = await supabase.from('ministry_assignments')
    .insert({ ministry_id: ministryId, user_id: user.id, status: 'interested' });
  if (error) {
    if (error.code === '23505') return { error: 'Ya expresaste interés en este ministerio.' };
    return { error: 'No pudimos registrar tu interés.' };
  }
  revalidatePath('/ministerios');
  return { success: 'Interés registrado. La iglesia te contactará.' };
}
