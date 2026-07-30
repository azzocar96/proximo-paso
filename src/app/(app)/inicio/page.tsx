import Link from 'next/link';
import { ScanLine, CalendarDays, BookOpen, Megaphone, CheckCircle2, CircleDot, Lock, ArrowRight } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { getActiveEnrollment, getProgress, progressPercent, nextActivity } from '@/lib/course';
import { fmtDate, fmtTime, ENROLLMENT_LABEL } from '@/lib/utils';
import { StatusBadge } from '@/components/ui/StatusBadge';

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
      <div>
        <h1 className="text-2xl font-extrabold">Hola, {profile?.first_name || 'bienvenido'}</h1>
        <p className="text-sm text-gray-500">Qué bueno verte por aquí.</p>
      </div>

      {sessionToday && (
        <Link href="/escanear" className="card card-hover relative overflow-hidden flex items-center justify-between !border-transparent bg-gradient-to-r from-brand-600 to-brand-500 text-white">
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-grid-dark opacity-40" />
          <div className="relative">
            <p className="font-bold text-lg">¡Hoy es {sessionToday.name}!</p>
            <p className="text-brand-100 text-sm">Toca aquí para escanear el QR y registrar tu asistencia.</p>
          </div>
          <ScanLine className="relative w-9 h-9 opacity-90" aria-hidden />
        </Link>
      )}

      {enrollment && progress ? (
        <section className="card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold">{(enrollment as any).course_cycles?.name}</h2>
            <StatusBadge status={enrollment.status} label={ENROLLMENT_LABEL[enrollment.status]} />
          </div>
          <div>
            <div className="flex justify-between text-sm mb-1.5">
              <span className="text-gray-500">Tu progreso</span>
              <span className="font-bold tabular-nums">{progressPercent(progress)}%</span>
            </div>
            <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-brand-600 to-accent transition-all" style={{ width: `${progressPercent(progress)}%` }} />
            </div>
          </div>
          <p className="text-sm"><span className="font-semibold">Siguiente:</span> {nextActivity(progress)}</p>
          {nextSession?.date && (
            <p className="text-sm text-gray-600 inline-flex items-center gap-1.5">
              <CalendarDays className="w-4 h-4 text-brand-600" aria-hidden />
              {nextSession.name}: {fmtDate(nextSession.date)}{nextSession.start_time ? ` · ${fmtTime(nextSession.start_time)}` : ''}
            </p>
          )}
          <div className="flex gap-2 flex-wrap">
            <Link href="/progreso" className="btn-secondary text-sm !py-2">Ver mi progreso</Link>
            <Link href="/proxima-clase" className="btn-secondary text-sm !py-2">Próxima clase</Link>
          </div>
        </section>
      ) : (
        <section className="card text-center space-y-3 py-8">
          <span className="mx-auto flex items-center justify-center w-14 h-14 rounded-2xl bg-brand-50 text-brand-600">
            <BookOpen className="w-7 h-7" aria-hidden />
          </span>
          <h2 className="font-bold text-lg">Aún no estás inscrito en un ciclo</h2>
          <p className="text-gray-600 text-sm">Inscríbete en el próximo ciclo del curso para comenzar.</p>
          <Link href="/curso" className="btn-primary inline-flex">Ver ciclos disponibles</Link>
        </section>
      )}

      {progress && (
        <section className="grid grid-cols-2 gap-3">
          <Requisito done={progress.test_done} unlocked={progress.test_unlocked} href="/test" label="Test de personalidad" />
          <Requisito done={progress.dream_team_done} unlocked={progress.dream_team_unlocked} href="/dream-team" label="Dream Team" />
        </section>
      )}

      {ann && (
        <section className="card flex gap-3">
          <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-accent/10 text-amber-600 shrink-0">
            <Megaphone className="w-[18px] h-[18px]" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-amber-600 uppercase tracking-widest mb-0.5">Último anuncio</p>
            <h3 className="font-bold">{ann.title}</h3>
            <p className="text-sm text-gray-600 line-clamp-2">{ann.content}</p>
            <Link href="/anuncios" className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700 mt-1">
              Ver todos <ArrowRight className="w-3.5 h-3.5" aria-hidden />
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}

function Requisito({ done, unlocked, href, label }: { done: boolean; unlocked: boolean; href: string; label: string }) {
  const icon = done ? <CheckCircle2 className="w-4 h-4 text-green-600" aria-hidden />
    : unlocked ? <CircleDot className="w-4 h-4 text-amber-500" aria-hidden />
    : <Lock className="w-3.5 h-3.5 text-gray-400" aria-hidden />;
  const state = done ? 'Completado' : unlocked ? 'Pendiente' : 'Bloqueado';
  const cls = done ? 'border-green-200/70 bg-green-50/50' : unlocked ? 'border-amber-200/70 bg-amber-50/50' : 'border-gray-200 bg-gray-50 opacity-70';
  return (
    <Link href={unlocked || done ? href : '#'} aria-disabled={!unlocked && !done}
      className={`card !p-4 card-hover ${cls} ${!unlocked && !done ? 'pointer-events-none' : ''}`}>
      <p className="font-semibold text-sm">{label}</p>
      <p className="text-xs mt-1.5 inline-flex items-center gap-1.5 text-gray-600">{icon} {state}</p>
    </Link>
  );
}
