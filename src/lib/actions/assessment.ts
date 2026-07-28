'use server';
import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { FormState } from '@/lib/actions/auth';
import { getActiveEnrollment, getProgress } from '@/lib/course';

async function ensureTestUnlocked() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Sesión no válida');
  const enrollment = await getActiveEnrollment(supabase, user.id);
  if (!enrollment) throw new Error('No estás inscrito en un ciclo');
  const p = await getProgress(supabase, enrollment.id);
  if (!p?.test_unlocked) throw new Error('El test se desbloquea al completar el Paso 3');
  return { supabase, user, enrollment };
}

export async function startAttempt(assessmentId: string): Promise<{ error?: string; attemptId?: string }> {
  try {
    const { supabase, user, enrollment } = await ensureTestUnlocked();
    const { data: existing } = await supabase.from('assessment_attempts').select('id,completed_at')
      .eq('assessment_id', assessmentId).eq('user_id', user.id).eq('enrollment_id', enrollment.id).maybeSingle();
    if (existing) return { attemptId: existing.id };
    const { data, error } = await supabase.from('assessment_attempts')
      .insert({ assessment_id: assessmentId, user_id: user.id, enrollment_id: enrollment.id })
      .select('id').single();
    if (error) return { error: 'No pudimos iniciar el test.' };
    return { attemptId: data.id };
  } catch (e) { return { error: (e as Error).message }; }
}

export async function saveAnswer(attemptId: string, questionId: string, payload: {
  option_ids?: string[]; scale_value?: number; text_value?: string;
}): Promise<FormState> {
  const supabase = createClient();
  const { error } = await supabase.from('assessment_answers').upsert({
    attempt_id: attemptId, question_id: questionId,
    option_ids: payload.option_ids ?? null,
    scale_value: payload.scale_value ?? null,
    text_value: payload.text_value?.slice(0, 4000) ?? null,
  }, { onConflict: 'attempt_id,question_id' });
  if (error) return { error: 'No pudimos guardar la respuesta.' };
  return null;
}

export async function completeAttempt(attemptId: string): Promise<FormState> {
  const supabase = createClient();
  const { error } = await supabase.rpc('complete_assessment_attempt', { p_attempt: attemptId });
  if (error) return { error: error.message };
  revalidatePath('/test'); revalidatePath('/progreso'); revalidatePath('/inicio');
  return { success: 'Test completado.' };
}

/**
 * Modo external_url: la persona declara que lo completó (queda en auditoría vía
 * admin si se desea validar). `externalResult` es opcional: es la etiqueta que
 * la propia persona reporta haber obtenido en el test externo (p. ej. "D", "I",
 * "S", "C" u otra) — no calculamos ningún puntaje, solo la guardamos tal cual.
 */
export async function declareExternalDone(assessmentId: string, externalResult?: string): Promise<FormState> {
  try {
    const { supabase, user, enrollment } = await ensureTestUnlocked();
    const { data: existing } = await supabase.from('assessment_attempts').select('id')
      .eq('assessment_id', assessmentId).eq('user_id', user.id).eq('enrollment_id', enrollment.id).maybeSingle();
    let attemptId = existing?.id as string | undefined;
    if (!attemptId) {
      const { data, error } = await supabase.from('assessment_attempts')
        .insert({ assessment_id: assessmentId, user_id: user.id, enrollment_id: enrollment.id })
        .select('id').single();
      if (error) return { error: 'No pudimos registrar el test.' };
      attemptId = data.id;
    }
    const { error: e2 } = await supabase.rpc('complete_assessment_attempt', { p_attempt: attemptId });
    if (e2) return { error: e2.message };
    if (externalResult && externalResult.trim()) {
      const { error: e3 } = await supabase.rpc('set_external_test_result', { p_attempt: attemptId, p_result: externalResult.trim() });
      if (e3) return { error: e3.message };
    }
    revalidatePath('/test'); revalidatePath('/progreso');
    return { success: 'Registramos que completaste el test externo.' };
  } catch (e) { return { error: (e as Error).message }; }
}
