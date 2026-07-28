import Link from 'next/link';
import { requireStaff } from '@/lib/auth';
import { CYCLE_LABEL, fmtDate } from '@/lib/utils';
import { StatusBadge } from '@/components/ui/StatusBadge';

export const metadata = { title: 'Ciclos' };
export default async function CiclosPage() {
  const { supabase, role } = await requireStaff();
  const { data: cycles } = await supabase.from('course_cycles').select('*')
    .is('deleted_at', null).order('created_at', { ascending: false });
  const isAdmin = ['admin', 'superadmin'].includes(role);
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">Ciclos del curso</h1>
        {isAdmin && <Link href="/admin/ciclos/nuevo" className="btn-primary !py-2">+ Nuevo ciclo</Link>}
      </div>
      <div className="grid gap-3">
        {(cycles ?? []).map((c) => (
          <Link key={c.id} href={`/admin/ciclos/${c.id}`} className="card hover:shadow-md flex justify-between items-center">
            <div>
              <p className="font-bold">{c.name}</p>
              <p className="text-xs text-gray-500">
                {c.registration_start ? `Inscripción: ${fmtDate(c.registration_start)}` : 'Sin fechas de inscripción'}
                {c.capacity ? ` · Cupos: ${c.capacity}` : ''}
              </p>
            </div>
            <StatusBadge status={c.status} label={CYCLE_LABEL[c.status]} />
          </Link>
        ))}
        {(cycles ?? []).length === 0 && <p className="card text-sm text-gray-600">No hay ciclos aún.</p>}
      </div>
    </div>
  );
}
