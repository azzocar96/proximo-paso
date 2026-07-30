import Link from 'next/link';
import { Users, UserCheck, AlertCircle, Award, GraduationCap, HeartHandshake, ArrowRight, TrendingUp } from 'lucide-react';
import { requireStaff } from '@/lib/auth';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { CYCLE_LABEL } from '@/lib/utils';

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
  const maxStep = Math.max(1, ...byStep.map((s) => s.count));

  const cards = [
    { label: 'Inscritos', value: enrolled ?? 0, href: '/admin/reportes', Icon: Users },
    { label: 'Participantes activos', value: activeP ?? 0, href: '/admin/reportes', Icon: UserCheck },
    { label: 'Con requisitos pendientes', value: pendingReq ?? 0, href: '/admin/reportes', Icon: AlertCircle },
    { label: 'Elegibles para certificado', value: eligible ?? 0, href: '/admin/certificados', Icon: Award },
    { label: 'Certificados emitidos', value: issued ?? 0, href: '/admin/certificados', Icon: GraduationCap },
    { label: 'Pendientes de ministerio', value: pendingMin ?? 0, href: '/admin/ministerios', Icon: HeartHandshake },
  ];
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Dashboard</h1>
        <p className="text-sm text-gray-500">Vista general del programa en tiempo real.</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {cards.map(({ label, value, href, Icon }) => (
          <Link key={label} href={href} className="card card-hover relative overflow-hidden group">
            <div aria-hidden className="absolute -top-6 -right-6 w-20 h-20 rounded-full bg-brand-50 blur-xl opacity-0 group-hover:opacity-100 transition-opacity" />
            <span className="relative inline-flex items-center justify-center w-9 h-9 rounded-lg bg-brand-50 text-brand-600 mb-3">
              <Icon className="w-[18px] h-[18px]" aria-hidden />
            </span>
            <p className="relative text-3xl font-extrabold tracking-tight text-gray-900 tabular-nums">{value}</p>
            <p className="relative text-[13px] text-gray-500">{label}</p>
          </Link>
        ))}
      </div>
      {byStep.length > 0 && (
        <section className="card">
          <h2 className="font-bold mb-4 inline-flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-brand-600" aria-hidden /> Asistencia por paso (ciclos activos)
          </h2>
          <div className="space-y-3">
            {byStep.map((s) => (
              <div key={s.step} className="flex items-center gap-3">
                <span className="w-14 text-[13px] font-medium text-gray-500 shrink-0">Paso {s.step}</span>
                <div className="flex-1 h-2.5 rounded-full bg-gray-100 overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-brand-600 to-brand-500 transition-all"
                    style={{ width: `${Math.max(4, Math.round((s.count / maxStep) * 100))}%`, opacity: s.count === 0 ? 0.15 : 1 }} />
                </div>
                <span className="w-8 text-right text-sm font-bold text-gray-900 tabular-nums shrink-0">{s.count}</span>
              </div>
            ))}
          </div>
        </section>
      )}
      <section className="card">
        <h2 className="font-bold mb-2">Ciclos en curso</h2>
        {(cycles ?? []).length === 0 && <p className="text-sm text-gray-600">No hay ciclos abiertos o activos. <Link className="text-brand-600 underline" href="/admin/ciclos">Crear uno</Link>.</p>}
        <ul className="divide-y divide-gray-100">
          {(cycles ?? []).map((c) => (
            <li key={c.id}>
              <Link href={`/admin/ciclos/${c.id}`} className="py-3 flex justify-between items-center group">
                <span className="inline-flex items-center gap-3">
                  <span className="font-medium text-gray-800">{c.name}</span>
                  <StatusBadge status={c.status} label={CYCLE_LABEL[c.status]} />
                </span>
                <span className="inline-flex items-center gap-1 text-sm font-medium text-gray-400 group-hover:text-brand-600 transition-colors">
                  Gestionar <ArrowRight className="w-4 h-4" aria-hidden />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
