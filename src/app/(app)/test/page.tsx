import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { getActiveEnrollment, getProgress } from '@/lib/course';
import { getSettings, str } from '@/lib/settings';
import { TestRunner, ExternalTest } from './ui';

export const metadata = { title: 'Test de personalidad' };
export default async function TestPage() {
  const { supabase, user } = await requireUser();
  const enrollment = await getActiveEnrollment(supabase, user.id);
  const p = enrollment ? await getProgress(supabase, enrollment.id) : null;

  if (!p) return <Locked msg="Inscríbete en un ciclo para acceder al test." href="/curso" cta="Ver ciclos" />;
  if (!p.test_unlocked && !p.test_done)
    return <Locked msg="El test se desbloquea cuando completas el Paso 3." href="/progreso" cta="Ver mi progreso" />;

  const s = await getSettings(['assessment_mode', 'assessment_external_url', 'assessment_active_id']);
  const mode = str(s, 'assessment_mode', 'internal_test');
  const activeId = str(s, 'assessment_active_id', '');

  // resultado existente
  const { data: attempt } = await supabase.from('assessment_attempts')
    .select('id, completed_at, assessment_results(total_score, dimension_scores, summary, external_result)')
    .eq('user_id', user.id).eq('enrollment_id', enrollment!.id)
    .not('completed_at', 'is', null).limit(1).maybeSingle();

  if (attempt) {
    const res: any = Array.isArray((attempt as any).assessment_results)
      ? (attempt as any).assessment_results[0] : (attempt as any).assessment_results;
    return (
      <div className="space-y-5">
        <h1 className="text-2xl font-extrabold">Test de personalidad</h1>
        <div className="card space-y-3 border-green-200 bg-green-50">
          <p className="font-bold">✅ Test completado</p>
          {res?.dimension_scores && Object.keys(res.dimension_scores).length > 0 && (
            <div>
              <p className="text-sm font-semibold mb-2">Tu resumen por dimensión:</p>
              <ul className="space-y-1 text-sm">
                {Object.entries(res.dimension_scores as Record<string, number>)
                  .sort((a, b) => b[1] - a[1])
                  .map(([k, v]) => <li key={k} className="flex justify-between"><span>{k}</span><b>{v}</b></li>)}
              </ul>
            </div>
          )}
          {res?.summary && <p className="text-sm">{res.summary}</p>}
          {res?.external_result && <p className="text-sm"><b>Resultado que reportaste:</b> {res.external_result}</p>}
          <p className="text-xs text-gray-500">Tus resultados son privados: solo tú y el equipo autorizado de la iglesia pueden verlos.</p>
          <Link href="/dream-team" className="btn-primary w-full">Continuar con Dream Team</Link>
        </div>
      </div>
    );
  }

  if (mode === 'external_url') {
    const url = str(s, 'assessment_external_url', '');
    return <ExternalTest url={url} assessmentId={activeId} />;
  }

  if (!activeId) return <Locked msg="La iglesia aún no configuró el test. Vuelve más tarde." href="/inicio" cta="Volver" />;
  const { data: assessment } = await supabase.from('assessments')
    .select('id,title,description,is_demo, assessment_sections(id,title,position, assessment_questions(id,question_type,text,required,position,scale_min,scale_max, assessment_options(id,text,position)))')
    .eq('id', activeId).eq('is_active', true).maybeSingle();
  if (!assessment) return <Locked msg="La iglesia aún no configuró el test. Vuelve más tarde." href="/inicio" cta="Volver" />;

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold">{assessment.title}</h1>
      {assessment.is_demo && (
        <p className="text-xs font-bold text-amber-700 bg-amber-50 rounded-xl p-3">
          ⚠️ Este es un test de DEMOSTRACIÓN. La iglesia debe cargar su test real desde el panel administrativo.
        </p>
      )}
      {assessment.description && <p className="text-gray-600 text-sm">{assessment.description}</p>}
      <TestRunner assessment={assessment as any} />
    </div>
  );
}

function Locked({ msg, href, cta }: { msg: string; href: string; cta: string }) {
  return (
    <div className="card text-center space-y-3">
      <p className="text-4xl" aria-hidden>🔒</p>
      <p>{msg}</p>
      <Link href={href} className="btn-primary">{cta}</Link>
    </div>
  );
}
