import type { SupabaseClient } from '@supabase/supabase-js';

/** Inscripción activa (no retirada/cancelada) más reciente del usuario. */
export async function getActiveEnrollment(supabase: SupabaseClient, userId: string) {
  const { data } = await supabase
    .from('enrollments')
    .select('*, course_cycles(*)')
    .eq('user_id', userId)
    .not('status', 'in', '("withdrawn","cancelled")')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

export type Progress = {
  enrollment_id: string; cycle_id: string; status: string;
  steps: { step: number; session_id: string; name: string; date: string | null; start_time: string | null; end_time: string | null; attended: boolean; pending: boolean; unlocked: boolean; status: string }[];
  steps_done: number; test_unlocked: boolean; test_done: boolean;
  dream_team_unlocked: boolean; dream_team_done: boolean; eligible_for_certificate: boolean;
};

export async function getProgress(supabase: SupabaseClient, enrollmentId: string): Promise<Progress | null> {
  const { data, error } = await supabase.rpc('get_progress', { p_enrollment: enrollmentId });
  if (error) return null;
  return data as Progress;
}

export function progressPercent(p: Progress): number {
  let total = 6, done = p.steps_done;
  if (p.test_done) done++;
  if (p.dream_team_done) done++;
  return Math.round((done / total) * 100);
}

export function nextActivity(p: Progress): string {
  const next = p.steps.find((s) => !s.attended);
  if (p.steps_done >= 3 && !p.test_done) return 'Completar el test de personalidad';
  if (p.steps_done >= 3 && !p.dream_team_done) return 'Completar el formulario Dream Team';
  if (next) return `Asistir al ${next.name}`;
  if (p.eligible_for_certificate) return 'Recibir tu certificado';
  return 'Curso completado';
}
