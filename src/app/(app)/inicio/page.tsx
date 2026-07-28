import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { getActiveEnrollment, getProgress, progressPercent, nextActivity } from '@/lib/course';
import { fmtDate, fmtTime } from '@/lib/utils';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ENROLLMENT_LABEL } from '@/lib/utils';

export const metadata = { title: 'Inicio' };
export default async function InicioPage() {
  const { supabase, user } = await requireUser();
  const { data: profile } = await supabase.from('profiles').select('first_name').eq('id', user.id).single();
  const enrollment = await getActiveEnrollment(supabase, user.id);
  const progress = enrollment ? await getProgress(supabase, enrollment.id) : null;
  const { data: ann } = await supabase.from('announcements').select('id,title,content,publish_at')
    .order('priority', { ascending: false }).order('publish_at', { ascending: false }).limit(1).maybeSingle();

  const nextSession = progress?.steps.find((s) => !s.attended && s.date);
  const today = new Date().toISOString().slice(0, 10);
  const sessionToday = progress?.steps.find((s) => s.date === today && s.status === 'open');

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold">Hola, {profile?.first_name || 'bienvenido'} 👋</h1>

      {sessionToday && (
        <Link href="/escanear" className="card flex items-center justify-between bg-brand-600 !border-brand-600 text-white hover:bg-brand-700">
          <div>
            <p className="font-bold text-lg">¡Hoy es {sessionToday.name}!</p>
            <p className="text-brand-100 text-sm">Toca aquí para escanear el QR y registrar tu asistencia.</p>
          </div>
          <span className="text-3xl" aria-hidden>📷</span>
        </Link>
      )}

      {enrollment && progress ? (
        <section className="card space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bold">{(enrollment as any).course_cycles?.name}</h2>
            <StatusBadge status={enrollment.status} label={ENROLLMENT_LABEL[enrollment.status]} />
          </div>
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-600">Tu progreso</span>
              <span className="font-bold">{progressPercent(progress)}%</span>
            </div>
            <div className="h-3 rounded-full bg-gray-100 overflow-hidden">
              <div className="h-full bg-brand-600 rounded-full transition-all" style={{ width: `${progressPercent(progress)}%` }} />
            </div>
          </div>
          <p className="text-sm"><span className="font-semibold">Siguiente:</span> {nextActivity(progress)}</p>
          {nextSession?.date && (
            <p className="text-sm text-gray-600">📅 {nextSession.name}: {fmtDate(nextSession.date)}{nextSession.start_time ? ` · ${fmtTime(nextSession.start_time)}` : ''}</p>
          )}
          <div className="flex gap-2 flex-wrap">
            <Link href="/progreso" className="btn-secondary text-sm !py-2">Ver mi progreso</Link>
            <Link href="/proxima-clase" className="btn-secondary text-sm !py-2">Próxima clase</Link>
          </div>
        </section>
      ) : (
        <section className="card text-center space-y-3">
          <p className="text-4xl" aria-hidden>📚</p>
          <h2 className="font-bold text-lg">Aún no estás inscrito en un ciclo</h2>
          <p className="text-gray-600 text-sm">Inscríbete en el próximo ciclo del curso para comenzar.</p>
          <Link href="/curso" className="btn-primary">Ver ciclos disponibles</Link>
        </section>
      )}

      {progress && (
        <section className="grid grid-cols-2 gap-3">
          <Requisito done={progress.test_done} unlocked={progress.test_unlocked} href="/test" label="Test de personalidad" />
          <Requisito done={progress.dream_team_done} unlocked={progress.dream_team_unlocked} href="/dream-team" label="Dream Team" />
        </section>
      )}

      {ann && (
        <section className="card">
          <p className="text-xs font-bold text-accent uppercase mb-1">📣 Último anuncio</p>
          <h3 className="font-bold">{ann.title}</h3>
          <p className="text-sm text-gray-600 line-clamp-2">{ann.content}</p>
          <Link href="/anuncios" className="text-sm text-brand-600 underline">Ver todos</Link>
        </section>
      )}
    </div>
  );
}

function Requisito({ done, unlocked, href, label }: { done: boolean; unlocked: boolean; href: string; label: string }) {
  const state = done ? '✅ Completado' : unlocked ? '🟡 Pendiente' : '🔒 Bloqueado';
  const cls = done ? 'border-green-200 bg-green-50' : unlocked ? 'border-amber-200 bg-amber-50' : 'border-gray-200 bg-gray-50 opacity-70';
  return (
    <Link href={unlocked || done ? href : '#'} aria-disabled={!unlocked && !done}
      className={`card !p-4 ${cls} ${!unlocked && !done ? 'pointer-events-none' : ''}`}>
      <p className="font-semibold text-sm">{label}</p>
      <p className="text-xs mt-1">{state}</p>
    </Link>
  );
}
