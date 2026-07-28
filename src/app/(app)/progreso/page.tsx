import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { getActiveEnrollment, getProgress, progressPercent } from '@/lib/course';
import { fmtDate, fmtTime } from '@/lib/utils';

export const metadata = { title: 'Mi progreso' };
export default async function ProgresoPage() {
  const { supabase, user } = await requireUser();
  const enrollment = await getActiveEnrollment(supabase, user.id);
  if (!enrollment) {
    return <div className="card text-center space-y-3">
      <p>Aún no estás inscrito en un ciclo.</p>
      <Link href="/curso" className="btn-primary">Inscribirme</Link>
    </div>;
  }
  const p = await getProgress(supabase, enrollment.id);
  if (!p) return <p className="card">No pudimos cargar tu progreso. Intenta de nuevo.</p>;

  const items: { label: string; sub?: string; state: 'done' | 'pending' | 'locked' ; href?: string }[] = [];
  for (const s of p.steps.filter((x) => x.step <= 3)) {
    items.push({ label: s.name, sub: s.date ? `${fmtDate(s.date)}${s.start_time ? ' · ' + fmtTime(s.start_time) : ''}` : 'Fecha por confirmar',
      state: s.attended ? 'done' : s.unlocked ? 'pending' : 'locked' });
  }
  items.push({ label: 'Test de personalidad', state: p.test_done ? 'done' : p.test_unlocked ? 'pending' : 'locked', href: '/test' });
  items.push({ label: 'Formulario Dream Team', state: p.dream_team_done ? 'done' : p.dream_team_unlocked ? 'pending' : 'locked', href: '/dream-team' });
  const s4 = p.steps.find((x) => x.step === 4);
  if (s4) items.push({ label: s4.name, sub: s4.date ? fmtDate(s4.date) : 'Fecha por confirmar',
    state: s4.attended ? 'done' : s4.unlocked ? 'pending' : 'locked' });
  items.push({ label: 'Certificado', state: p.eligible_for_certificate ? 'pending' : 'locked', href: '/certificado' });

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold">Mi progreso</h1>
      <div className="card">
        <div className="flex justify-between text-sm mb-1">
          <span>Avance total</span><span className="font-bold">{progressPercent(p)}%</span>
        </div>
        <div className="h-3 rounded-full bg-gray-100 overflow-hidden">
          <div className="h-full bg-brand-600 rounded-full" style={{ width: `${progressPercent(p)}%` }} />
        </div>
      </div>
      <ol className="space-y-3">
        {items.map((it, i) => (
          <li key={i}>
            <ItemCard {...it} />
          </li>
        ))}
      </ol>
    </div>
  );
}

function ItemCard({ label, sub, state, href }: { label: string; sub?: string; state: 'done' | 'pending' | 'locked'; href?: string }) {
  const icon = state === 'done' ? '✅' : state === 'pending' ? '🟡' : '🔒';
  const cls = state === 'done' ? 'border-green-200 bg-green-50' : state === 'pending' ? 'border-amber-200 bg-amber-50' : 'bg-gray-50 opacity-70';
  const inner = (
    <div className={`card flex items-center gap-4 ${cls}`}>
      <span className="text-2xl" aria-hidden>{icon}</span>
      <div className="flex-1">
        <p className="font-semibold">{label}</p>
        {sub && <p className="text-sm text-gray-600">{sub}</p>}
      </div>
      <span className="text-xs font-semibold text-gray-500">
        {state === 'done' ? 'Completado' : state === 'pending' ? 'Pendiente' : 'Bloqueado'}
      </span>
    </div>
  );
  return href && state !== 'locked' ? <a href={href}>{inner}</a> : inner;
}
