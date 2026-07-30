import { MapPin, GraduationCap, CheckCircle2 } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { fmtDate, CYCLE_LABEL, ENROLLMENT_LABEL } from '@/lib/utils';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EnrollButton, WithdrawButton } from './ui';

export const metadata = { title: 'Mi curso' };
export default async function CursoPage() {
  const { supabase, user } = await requireUser();
  const { data: myEnrollments } = await supabase.from('enrollments')
    .select('*, course_cycles(id,name,description,status,location_name,full_address,certificate_delivery_date)')
    .eq('user_id', user.id).order('created_at', { ascending: false });
  const { data: openCycles } = await supabase.from('course_cycles')
    .select('*').eq('status', 'registration_open').order('registration_start');
  const enrolledIds = new Set((myEnrollments ?? []).filter(e => !['withdrawn','cancelled'].includes(e.status)).map((e) => e.cycle_id));

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold">Mi curso</h1>
      {(myEnrollments ?? []).filter(e => !['withdrawn','cancelled'].includes(e.status)).map((e) => (
        <section key={e.id} className="card space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-bold">{(e as any).course_cycles?.name}</h2>
            <StatusBadge status={e.status} label={ENROLLMENT_LABEL[e.status]} />
          </div>
          {(e as any).course_cycles?.description && <p className="text-sm text-gray-600">{(e as any).course_cycles.description}</p>}
          {(e as any).course_cycles?.location_name && (
            <p className="text-sm text-gray-600 inline-flex items-center gap-1.5"><MapPin className="w-4 h-4 text-brand-600 shrink-0" aria-hidden /> {(e as any).course_cycles.location_name} — {(e as any).course_cycles.full_address}</p>
          )}
          {(e as any).course_cycles?.certificate_delivery_date && (
            <p className="text-sm text-gray-600 inline-flex items-center gap-1.5"><GraduationCap className="w-4 h-4 text-brand-600 shrink-0" aria-hidden /> Entrega de certificados: {fmtDate((e as any).course_cycles.certificate_delivery_date)}</p>
          )}
          {['enrolled','registered'].includes(e.status) && <WithdrawButton enrollmentId={e.id} />}
        </section>
      ))}

      <h2 className="text-lg font-bold">Ciclos con inscripción abierta</h2>
      {(openCycles ?? []).length === 0 && (
        <p className="card text-gray-600 text-sm">Por ahora no hay ciclos con inscripciones abiertas. Vuelve pronto o revisa los anuncios.</p>
      )}
      {(openCycles ?? []).map((c) => (
        <section key={c.id} className="card space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="font-bold">{c.name}</h3>
            <StatusBadge status={c.status} label={CYCLE_LABEL[c.status]} />
          </div>
          {c.description && <p className="text-sm text-gray-600">{c.description}</p>}
          <p className="text-sm text-gray-600">
            {c.registration_end ? `Inscripciones hasta: ${fmtDate(c.registration_end)}` : ''}
            {c.capacity ? ` · Cupos: ${c.capacity}` : ''}
          </p>
          {enrolledIds.has(c.id)
            ? <p className="text-sm font-semibold text-green-700 inline-flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" aria-hidden /> Ya estás inscrito en este ciclo</p>
            : <EnrollButton cycleId={c.id} />}
        </section>
      ))}
    </div>
  );
}
