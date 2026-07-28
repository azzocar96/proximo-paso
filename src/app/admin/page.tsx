import Link from 'next/link';
import { requireStaff } from '@/lib/auth';

export const metadata = { title: 'Dashboard' };
export default async function AdminDashboard() {
  const { supabase } = await requireStaff();
  const [{ count: enrolled }, { count: activeP }, { count: pendingReq }, { count: eligible }, { count: issued }, { count: pendingMin }, { data: cycles }] = await Promise.all([
    supabase.from('enrollments').select('id', { count: 'exact', head: true }).not('status', 'in', '("withdrawn","cancelled")'),
    supabase.from('enrollments').select('id', { count: 'exact', head: true }).in('status', ['enrolled', 'in_progress', 'requirements_pending']),
    supabase.from('enrollments').select('id', { count: 'exact', head: true }).eq('status', 'requirements_pending'),
    supabase.from('certificates').select('id', { count: 'exact', head: true }).in('status', ['eligible', 'pending_approval']),
    supabase.from('certificates').select('id', { count: 'exact', head: true }).in('status', ['issued', 'physical_pending', 'ready_for_pickup', 'delivered']),
    supabase.from('ministry_assignments').select('id', { count: 'exact', head: true }).in('status', ['suggested', 'interested', 'pending_contact']),
    supabase.from('course_cycles').select('id,name,status').is('deleted_at', null).in('status', ['registration_open', 'active']).order('created_at', { ascending: false }),
  ]);

  // asistencia por paso de ciclos activos
  const cycleIds = (cycles ?? []).map((c) => c.id);
  let byStep: { step: number; count: number }[] = [];
  if (cycleIds.length) {
    const { data: sessions } = await supabase.from('course_sessions').select('id,step_number,cycle_id').in('cycle_id', cycleIds);
    const sessionMap = new Map((sessions ?? []).map((s) => [s.id, s.step_number]));
    const { data: att } = await supabase.from('attendance_records').select('session_id').in('session_id', [...sessionMap.keys()]);
    const agg = new Map<number, number>();
    for (const a of att ?? []) {
      const st = sessionMap.get(a.session_id)!;
      agg.set(st, (agg.get(st) ?? 0) + 1);
    }
    byStep = [1, 2, 3, 4].map((s) => ({ step: s, count: agg.get(s) ?? 0 }));
  }

  const cards = [
    { label: 'Inscritos', value: enrolled ?? 0, href: '/admin/reportes' },
    { label: 'Participantes activos', value: activeP ?? 0, href: '/admin/reportes' },
    { label: 'Con requisitos pendientes', value: pendingReq ?? 0, href: '/admin/reportes' },
    { label: 'Elegibles para certificado', value: eligible ?? 0, href: '/admin/certificados' },
    { label: 'Certificados emitidos', value: issued ?? 0, href: '/admin/certificados' },
    { label: 'Pendientes de ministerio', value: pendingMin ?? 0, href: '/admin/ministerios' },
  ];
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold">Dashboard</h1>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {cards.map((c) => (
          <Link key={c.label} href={c.href} className="card hover:shadow-md">
            <p className="text-3xl font-extrabold text-brand-600">{c.value}</p>
            <p className="text-sm text-gray-600">{c.label}</p>
          </Link>
        ))}
      </div>
      {byStep.length > 0 && (
        <section className="card">
          <h2 className="font-bold mb-3">Asistencia por paso (ciclos activos)</h2>
          <div className="grid grid-cols-4 gap-3 text-center">
            {byStep.map((s) => (
              <div key={s.step} className="rounded-xl bg-brand-50 p-3">
                <p className="text-2xl font-bold text-brand-700">{s.count}</p>
                <p className="text-xs text-gray-600">Paso {s.step}</p>
              </div>
            ))}
          </div>
        </section>
      )}
      <section className="card">
        <h2 className="font-bold mb-2">Ciclos en curso</h2>
        {(cycles ?? []).length === 0 && <p className="text-sm text-gray-600">No hay ciclos abiertos o activos. <Link className="text-brand-600 underline" href="/admin/ciclos">Crear uno</Link>.</p>}
        <ul className="divide-y">
          {(cycles ?? []).map((c) => (
            <li key={c.id} className="py-2 flex justify-between items-center">
              <span>{c.name}</span>
              <Link href={`/admin/ciclos/${c.id}`} className="text-sm text-brand-600 underline">Gestionar</Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
