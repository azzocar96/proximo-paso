'use server';
import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { FormState } from '@/lib/actions/auth';
import { getActiveEnrollment, getProgress } from '@/lib/course';
import { z } from 'zod';

const formSchema = z.object({
  interest_areas: z.array(z.string().max(80)).max(20),
  talents: z.array(z.string().max(80)).max(20),
  experience: z.string().max(3000).optional().or(z.literal('')),
  weekly_availability: z.array(z.string().max(40)).max(10),
  available_times: z.array(z.string().max(40)).max(10),
  // hasta 3 ministerios, en orden de preferencia (índice 0 = 1ª opción)
  ministry_interest_ids: z.array(z.string().uuid()).max(3),
  previous_church_experience: z.string().max(3000).optional().or(z.literal('')),
  comments: z.string().max(3000).optional().or(z.literal('')),
  contact_consent: z.boolean(),
  extra: z.record(z.string(), z.any()).optional(),
  // campos del formulario real de la iglesia (Fase 2)
  marital_status: z.enum(['single', 'married', 'widowed', 'divorced']).optional().or(z.literal('')),
  gender: z.enum(['female', 'male']).optional().or(z.literal('')),
  education_level: z.enum(['primary', 'secondary', 'university']).optional().or(z.literal('')),
  education_degree: z.string().max(160).optional().or(z.literal('')),
  occupation: z.string().max(160).optional().or(z.literal('')),
  church_attendance_time: z.enum(['lt_1y', '1_3y', '3_4y', '4y_plus']).optional().or(z.literal('')),
  theological_studies: z.boolean().optional(),
  theological_studies_degree: z.string().max(160).optional().or(z.literal('')),
  guidance_interest: z.string().max(2000).optional().or(z.literal('')),
});

export async function saveDreamTeam(payload: unknown, complete: boolean): Promise<FormState> {
  const parsed = formSchema.safeParse(payload);
  if (!parsed.success) return { error: 'Revisa los campos del formulario.' };
  const d = parsed.data;
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Sesión no válida.' };
  const enrollment = await getActiveEnrollment(supabase, user.id);
  if (!enrollment) return { error: 'No estás inscrito en un ciclo.' };
  const p = await getProgress(supabase, enrollment.id);
  if (!p?.dream_team_unlocked && !p?.dream_team_done)
    return { error: 'El formulario se desbloquea al completar el Paso 3.' };
  if (complete && !d.contact_consent)
    return { error: 'Para enviar el formulario debes autorizar que la iglesia te contacte.' };

  const { data: form, error } = await supabase.from('dream_team_forms').upsert({
    user_id: user.id, enrollment_id: enrollment.id,
    interest_areas: d.interest_areas, talents: d.talents,
    experience: d.experience || null,
    weekly_availability: d.weekly_availability, available_times: d.available_times,
    ministry_interest_ids: d.ministry_interest_ids,
    previous_church_experience: d.previous_church_experience || null,
    comments: d.comments || null, contact_consent: d.contact_consent,
    marital_status: d.marital_status || null,
    gender: d.gender || null,
    education_level: d.education_level || null,
    education_degree: d.education_degree || null,
    occupation: d.occupation || null,
    church_attendance_time: d.church_attendance_time || null,
    theological_studies: d.theological_studies ?? false,
    theological_studies_degree: d.theological_studies_degree || null,
    guidance_interest: d.guidance_interest || null,
  }, { onConflict: 'enrollment_id' }).select('id').single();
  if (error || !form) return { error: 'No pudimos guardar el formulario.' };

  if (d.extra) {
    for (const [qid, value] of Object.entries(d.extra)) {
      if (value == null || value === '') continue;
      await supabase.from('dream_team_answers').upsert(
        { form_id: form.id, question_id: qid, value: JSON.parse(JSON.stringify(value)) },
        { onConflict: 'form_id,question_id' });
    }
  }
  if (complete) {
    const { error: e2 } = await supabase.rpc('complete_dream_team', { p_form: form.id });
    if (e2) return { error: e2.message };
  }
  revalidatePath('/dream-team'); revalidatePath('/progreso'); revalidatePath('/inicio');
  return { success: complete ? '¡Formulario Dream Team enviado!' : 'Borrador guardado.' };
}
