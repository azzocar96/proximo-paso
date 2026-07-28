import { requireAdmin } from '@/lib/auth';
import { getSettings, str } from '@/lib/settings';
import { AssessmentAdmin } from './ui';

export const metadata = { title: 'Test' };
export default async function EvaluacionesPage() {
  const { supabase } = await requireAdmin();
  const [{ data: assessments }, settings] = await Promise.all([
    supabase.from('assessments')
      .select('*, assessment_sections(id,title,position, assessment_questions(id,text,question_type,position, assessment_options(id,text,score,dimension)))')
      .is('deleted_at', null).order('created_at', { ascending: false }),
    getSettings(['assessment_mode', 'assessment_external_url', 'assessment_active_id']),
  ]);
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold">Test de personalidad</h1>
      <AssessmentAdmin
        assessments={(assessments as any) ?? []}
        mode={str(settings, 'assessment_mode', 'internal_test')}
        externalUrl={str(settings, 'assessment_external_url', '')}
        activeId={str(settings, 'assessment_active_id', '')}
      />
    </div>
  );
}
