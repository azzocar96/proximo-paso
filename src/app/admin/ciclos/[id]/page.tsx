import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStaff } from '@/lib/auth';
import { CycleForm } from '../form';
import { SessionForm, CoordinatorForm, SuggestDateNote, RescheduleForm, CertificationSessionForm } from './ui';
import { fmtDate, ENROLLMENT_LABEL } from '@/lib/utils';
import { StatusBadge } from '@/components/ui/StatusBadge';

export const metadata = { title: 'Ciclo' };
export default async function CicloDetailPage({ params }: { params: { id: string } }) {
  const { supabase, role } = await requireStaff();
  // Nota (Fase 3a): "admin" quedó inerte — el nivel más alto ahora es pastor/superadmin.
  const isAdmin = ['pastor', 'superadmin'].includes(role);
  const { data: cycle } = await supabase.from('course_cycles').select('*').eq('id', params.id).maybeSingle();
  if (!cycle) notFound();
  const [{ data: sessions }, { data: enrollments }, { data: coords }, { data: suggested }] = await Promise.all([
    supabase.from('course_sessions').select('*').eq('cycle_id', params.id).order('step_number'),
    supabase.from('enrollments').select('id,status,created_at, profiles(id,first_name,last_name,email,phone)').eq('cycle_id', params.id).order('created_at'),
    supabase.from('cycle_coordinators').select('id, profiles(first_name,last_name,email)').eq('cycle_id', params.id),
    supabase.rpc('suggest_certificate_date', { p_cycle: params.id }),
  ]);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold">{cycle.name}</h1>

      <section className="space-y-3">
        <h2 className="font-bold text-lg">Sesiones</h2>
        <div className="grid gap-3">
          {(sessions ?? []).map((s) => (
            <details key={s.id} className="card">
              <summary className="cursor-pointer flex items-center justify-between">
                <span className="font-semibold">
                  {s.is_certification ? '🎓 Certificación' : `Paso ${s.step_number}`}: {s.name} {s.session_date ? `· ${fmtDate(s.session_date)}` : '· sin fecha'}
                </span>
                <span className="flex items-center gap-2">
                  <StatusBadge status={s.status} label={{ scheduled: 'Programada', open: 'Abierta', closed: 'Cerrada', cancelled: 'Cancelada' }[s.status as string]} />
                  <Link href={`/admin/sesiones/${s.id}/qr`} className="btn-secondary !py-1.5 !px-3 text-sm">QR</Link>
                </span>
              </summary>
              <div className="pt-4">
                <SessionForm session={s} />
                {/* key con la fecha: remonta el form tras reprogramar para no mostrar la fecha vieja */}
                {isAdmin && <RescheduleForm key={`${s.id}-${s.session_date ?? 'sin-fecha'}`} session={s} />}
              </div>
            </details>
          ))}
        </div>
        {suggested && <SuggestDateNote suggested={suggested as unknown as string} current={cycle.certificate_delivery_date} />}
        {isAdmin && !(sessions ?? []).some((s) => s.is_certification) && (
          <CertificationSessionForm cycleId={cycle.id}
            suggestedDate={cycle.certificate_delivery_date ?? (suggested as unknown as string) ?? null} />
        )}
      </section>

      {isAdmin && (
        <section className="space-y-3">
          <h2 className="font-bold text-lg">Datos del ciclo</h2>
          <CycleForm cycle={cycle} />
        </section>
      )}

      {isAdmin && (
        <section className="space-y-3">
          <h2 className="font-bold text-lg">Coordinadores del ciclo</h2>
          <div className="card space-y-3">
            <ul className="text-sm space-y-1">
              {(coords ?? []).map((c: any) => (
                <li key={c.id}>👤 {c.profiles?.first_name} {c.profiles?.last_name} — {c.profiles?.email}</li>
              ))}
              {(coords ?? []).length === 0 && <li className="text-gray-500">Sin coordinadores asignados.</li>}
            </ul>
            <CoordinatorForm cycleId={cycle.id} />
            <p className="text-xs text-gray-500">El usuario además debe tener rol Coordinador (Usuarios → cambiar rol).</p>
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="font-bold text-lg">Inscritos ({(enrollments ?? []).length})</h2>
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-gray-500 border-b">
              <th className="py-2">Nombre</th><th>Correo</th><th>Estado</th><th></th></tr></thead>
            <tbody className="divide-y">
              {(enrollments ?? []).map((e: any) => (
                <tr key={e.id}>
                  <td className="py-2">{e.profiles?.first_name} {e.profiles?.last_name}</td>
                  <td>{e.profiles?.email}</td>
                  <td><StatusBadge status={e.status} label={ENROLLMENT_LABEL[e.status]} /></td>
                  <td>{isAdmin && <Link className="text-brand-600 underline" href={`/admin/participantes/${e.profiles?.id}`}>Ficha</Link>}</td>
                </tr>
              ))}
              {(enrollments ?? []).length === 0 && <tr><td colSpan={4} className="py-3 text-gray-500">Nadie inscrito aún.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
