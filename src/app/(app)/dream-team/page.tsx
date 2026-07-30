import { HandHeart, Lock } from 'lucide-react';
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { getActiveEnrollment, getProgress } from '@/lib/course';
import { DreamTeamForm } from './ui';

export const metadata = { title: 'Dream Team' };
export default async function DreamTeamPage() {
  const { supabase, user } = await requireUser();
  const enrollment = await getActiveEnrollment(supabase, user.id);
  const p = enrollment ? await getProgress(supabase, enrollment.id) : null;
  if (!p) return <Locked msg="Inscríbete en un ciclo para acceder al formulario." href="/curso" cta="Ver ciclos" />;
  if (!p.dream_team_unlocked && !p.dream_team_done)
    return <Locked msg="El formulario Dream Team se desbloquea cuando completas el Paso 3." href="/progreso" cta="Ver mi progreso" />;

  const [{ data: ministries }, { data: questions }, { data: form }] = await Promise.all([
    supabase.from('ministries').select('id,name').eq('status', 'active').order('name'),
    supabase.from('dream_team_questions').select('*').eq('is_active', true).order('position'),
    supabase.from('dream_team_forms').select('*, dream_team_answers(question_id,value)').eq('enrollment_id', enrollment!.id).maybeSingle(),
  ]);

  if (form?.completed_at) {
    return (
      <div className="space-y-5">
        <h1 className="text-2xl font-extrabold">Dream Team</h1>
        <div className="card border-green-200 bg-green-50 text-center space-y-3">
          <span className="mx-auto flex items-center justify-center w-14 h-14 rounded-2xl bg-green-100 text-green-700"><HandHeart className="w-7 h-7" aria-hidden /></span>
          <p className="font-bold">Formulario enviado</p>
          <p className="text-sm text-gray-600">La iglesia revisará tus intereses y te contactará para conectarte con un ministerio.</p>
          <Link href="/progreso" className="btn-primary">Ver mi progreso</Link>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold">Formulario Dream Team</h1>
      <p className="text-sm text-gray-600">Cuéntanos tus dones, experiencia y disponibilidad para conectarte con el ministerio ideal.</p>
      <DreamTeamForm ministries={ministries ?? []} questions={questions ?? []} initial={form ?? null} />
    </div>
  );
}
function Locked({ msg, href, cta }: { msg: string; href: string; cta: string }) {
  return (
    <div className="card text-center space-y-3">
      <span className="mx-auto flex items-center justify-center w-14 h-14 rounded-2xl bg-gray-100 text-gray-400"><Lock className="w-6 h-6" aria-hidden /></span><p>{msg}</p>
      <Link href={href} className="btn-primary">{cta}</Link>
    </div>
  );
}
