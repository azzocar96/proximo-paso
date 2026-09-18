import Link from 'next/link';
import { ScanLine, CalendarDays, BookOpen, Megaphone, CheckCircle2, CircleDot, Lock, ArrowRight, HeartHandshake } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { getActiveEnrollment, getProgress, progressPercent, nextActivity } from '@/lib/course';
import { fmtDate, fmtTime, ENROLLMENT_LABEL } from '@/lib/utils';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EnrollButton } from '@/app/(app)/curso/ui';
import { InstalarApp } from '@/components/shell/InstalarApp';
import { Recorrido } from '@/components/ui/Recorrido';

export const metadata = { title: 'Inicio' };
export default async function InicioPage() {
  const { supabase, user } = await requireUser();
  // Todo lo que no depende de lo demás sale a la vez: antes eran cinco viajes
  // seguidos a la base por cada apertura de la pantalla más usada de la app.
  const [profileRes, ministryRes, pendingRes, annRes, enrollment] = await Promise.all([
    supabase.from('profiles').select('first_name,active_member').eq('id', user.id).single(),
    // Invitación (no obligación) a servir: solo para el miembro activo que todavía
    // no está en ningún equipo y no tiene una solicitud en curso. Servir es opcional.
    supabase.from('ministry_assignments').select('id').eq('user_id', user.id).in('status', ['assigned', 'active']),
    supabase.from('member_requests').select('id').eq('user_id', user.id).eq('status', 'pending'),
    supabase.from('announcements').select('id,title,content,publish_at')
      .order('priority', { ascending: false }).order('publish_at', { ascending: false }).limit(1).maybeSingle(),
    getActiveEnrollment(supabase, user.id),
  ]);
  for (const [nombre, r] of [['profiles', profileRes], ['ministry_assignments', ministryRes], ['member_requests', pendingRes], ['announcements', annRes]] as const) {
    if (r.error) console.error(`[inicio/${nombre}]`, r.error.message);
  }
  const profile = profileRes.data;
  const ann = annRes.data;
  const invitarAServir = Boolean(profile?.active_member)
    && (ministryRes.data ?? []).length === 0 && (pendingRes.data ?? []).length === 0;
  // Lo que sí depende de la inscripción va después, y solo la rama que toque.
  const progress = enrollment ? await getProgress(supabase, enrollment.id) : null;
  // Sin inscripción: traer el ciclo abierto para que se inscriba AQUÍ, sin
  // buscarlo. Es el punto donde más gente se queda a medias: crea la cuenta y
  // cree que ya está inscrita.
  let ciclosAbiertos: { id: string; name: string; location_name: string | null; primera: string | null }[] = [];
  if (!enrollment) {
    const { data: abiertos, error } = await supabase.from('course_cycles')
      .select('id,name,location_name,registration_end,course_sessions(session_date,step_number)')
      .eq('status', 'registration_open').is('deleted_at', null).order('registration_start');
    if (error) console.error('[inicio/course_cycles]', error.message);
    const hoy = new Date().toISOString().slice(0, 10);
    ciclosAbiertos = (abiertos ?? [])
      .filter((c: any) => !c.registration_end || c.registration_end > new Date().toISOString())
      .map((c: any) => {
        const fechas = (c.course_sessions ?? []).map((x: any) => x.session_date).filter(Boolean).sort();
        return { id: c.id, name: c.name, location_name: c.location_name, primera: fechas[0] ?? null };
      })
      // Un ciclo cuya primera clase ya pasó no se ofrece: la base lo rechazaría igual.
      .filter((c) => !c.primera || c.primera >= hoy);
  }

  const nextSession = progress?.steps.find((s) => !s.attended && s.date);
  const today = new Date().toISOString().slice(0, 10);
  const sessionToday = progress?.steps.find((s) => s.date === today && s.status === 'open');

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold">Hola, {profile?.first_name || 'bienvenido'}</h1>
        <p className="text-sm text-gray-500">Qué bueno verte por aquí.</p>
      </div>

      <InstalarApp />

      {invitarAServir && (
        <section className="card space-y-2 border-brand-200/60 bg-brand-50/40">
          <p className="font-semibold inline-flex items-center gap-2">
            <HeartHandshake className="w-4 h-4 text-brand-600" aria-hidden /> Ya eres parte de la comunidad
          </p>
          <p className="text-sm text-gray-600">
            Si en algún momento quieres servir en un ministerio, puedes postularte cuando gustes. No
            hace falta pertenecer a un equipo para seguir aquí: el muro y la vida de la iglesia son
            tuyos igual.
          </p>
          <Link href="/ministerios" className="text-sm font-semibold text-brand-700 inline-flex items-center gap-1">
            Ver los ministerios <ArrowRight className="w-3.5 h-3.5" aria-hidden />
          </Link>
        </section>
      )}

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
            <h2 className="font-bold">{enrollment.course_cycles?.name}</h2>
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
          <Recorrido progress={progress} />
          <p className="text-sm"><span className="font-semibold">Siguiente:</span> {nextActivity(progress)}</p>
          {nextSession?.date && (
            <p className="text-sm text-gray-600 inline-flex items-center gap-1.5">
              <CalendarDays className="w-4 h-4 text-brand-600" aria-hidden />
              {nextSession.name}: {fmtDate(nextSession.date)}{nextSession.start_time ? ` · ${fmtTime(nextSession.start_time)}` : ''}
            </p>
          )}
          <div className="flex gap-2 flex-wrap">
            <Link href="/progreso" className="btn-secondary text-sm !py-2">Ver mi progreso</Link>
            {enrollment.status === 'certified'
              ? <Link href="/certificado" className="btn-primary text-sm !py-2">Ver mi certificado</Link>
              : <Link href="/proxima-clase" className="btn-secondary text-sm !py-2">Próxima clase</Link>}
          </div>
        </section>
      ) : (
        <section className="card space-y-4 py-6 border-brand-200/70">
          <div className="flex items-start gap-3">
            <span className="flex items-center justify-center w-12 h-12 rounded-2xl bg-brand-50 text-brand-600 shrink-0">
              <BookOpen className="w-6 h-6" aria-hidden />
            </span>
            <div>
              <h2 className="font-bold text-lg leading-snug">Te falta un paso: inscribirte al curso</h2>
              <p className="text-gray-600 text-sm mt-1">
                Tu cuenta ya existe, pero todavía no estás en ningún ciclo. Sin esto, el domingo tu
                asistencia no queda registrada.
              </p>
            </div>
          </div>

          {ciclosAbiertos.length > 0 ? (
            <div className="space-y-3">
              {ciclosAbiertos.map((c) => (
                <div key={c.id} className="rounded-xl border border-gray-200 p-3 space-y-2">
                  <p className="font-semibold">{c.name}</p>
                  <p className="text-sm text-gray-600">
                    {c.primera ? <>Primera clase: <b>{fmtDate(c.primera)}</b></> : 'Fechas por confirmar'}
                    {c.location_name ? <> · {c.location_name}</> : null}
                  </p>
                  <EnrollButton cycleId={c.id} />
                </div>
              ))}
              <p className="text-xs text-gray-500">
                Es un solo toque. Si te arrepientes, puedes retirarte desde <Link href="/curso" className="underline">Mi curso</Link>.
              </p>
            </div>
          ) : (
            <div className="rounded-xl bg-gray-50 p-3 text-sm text-gray-700">
              Ahora mismo no hay un ciclo con inscripciones abiertas. En cuanto se abra el próximo, te
              aparecerá aquí para que te anotes con un toque.
            </div>
          )}
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
