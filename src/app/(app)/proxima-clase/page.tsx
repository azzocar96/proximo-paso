import Link from 'next/link';
import { Church, CalendarDays, Clock3, MapPin, Lock } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { getActiveEnrollment, getProgress } from '@/lib/course';
import { fmtDate, fmtTime } from '@/lib/utils';

export const metadata = { title: 'Próxima clase' };
export default async function ProximaClasePage() {
  const { supabase, user } = await requireUser();
  const enrollment = await getActiveEnrollment(supabase, user.id);
  const p = enrollment ? await getProgress(supabase, enrollment.id) : null;
  const next = p?.steps.find((s) => !s.attended);
  if (!p || !next) {
    return <div className="card text-center space-y-3">
      <p>{p ? '¡Completaste todas las clases!' : 'Inscríbete en un ciclo para ver tu próxima clase.'}</p>
      <Link href={p ? '/certificado' : '/curso'} className="btn-primary">{p ? 'Ver mi certificado' : 'Inscribirme'}</Link>
    </div>;
  }
  const { data: session } = await supabase.from('course_sessions').select('*').eq('id', next.session_id).single();
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold">Próxima clase</h1>
      <div className="card space-y-3">
        <span className="flex items-center justify-center w-14 h-14 rounded-2xl bg-brand-50 text-brand-600"><Church className="w-7 h-7" aria-hidden /></span>
        <h2 className="text-xl font-bold">{next.name}</h2>
        {session?.description && <p className="text-gray-600">{session.description}</p>}
        <p className="font-semibold inline-flex items-center gap-1.5"><CalendarDays className="w-4 h-4 text-brand-600" aria-hidden /> {next.date ? fmtDate(next.date) : 'Fecha por confirmar'}</p>
        {next.start_time && <p className="inline-flex items-center gap-1.5"><Clock3 className="w-4 h-4 text-brand-600" aria-hidden /> {fmtTime(next.start_time)}{next.end_time ? ` – ${fmtTime(next.end_time)}` : ''}</p>}
        {session?.location_name && <p className="inline-flex items-center gap-1.5"><MapPin className="w-4 h-4 text-brand-600" aria-hidden /> {session.location_name}</p>}
        {!next.unlocked && (
          <p className="text-sm text-amber-700 bg-amber-50 rounded-xl p-3 flex items-center gap-2">
            <Lock className="w-4 h-4 shrink-0" aria-hidden /> Para asistir a esta clase primero debes completar el paso o requisito anterior.
          </p>
        )}
        {next.unlocked && <Link href="/escanear" className="btn-primary w-full">Registrar asistencia con QR</Link>}
      </div>
    </div>
  );
}
