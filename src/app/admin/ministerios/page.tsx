import { requireAdmin } from '@/lib/auth';
import { MinistryForm, AssignmentsTable, MinistryLeadersPanel } from './ui';

export const metadata = { title: 'Ministerios' };
export default async function MinisteriosAdminPage() {
  const { supabase, role } = await requireAdmin();
  const [{ data: ministries }, { data: assignments }, { data: leaders }] = await Promise.all([
    supabase.from('ministries').select('*').is('deleted_at', null).order('name'),
    supabase.from('ministry_assignments')
      .select('*, ministries(name), profiles(id,first_name,last_name,email)')
      .order('updated_at', { ascending: false }).limit(200),
    supabase.from('ministry_leaders')
      .select('*, ministries(name), profiles(id,first_name,last_name,email)')
      .order('created_at', { ascending: false }),
  ]);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold">Ministerios</h1>
      <section className="space-y-3">
        <h2 className="font-bold">Catálogo</h2>
        <div className="grid md:grid-cols-2 gap-3">
          {(ministries ?? []).map((m) => (
            <details key={m.id} className="card">
              <summary className="cursor-pointer font-semibold">{m.name} {m.status !== 'active' && <span className="badge bg-gray-100 text-gray-500">Inactivo</span>}</summary>
              <div className="pt-3"><MinistryForm ministry={m} /></div>
            </details>
          ))}
        </div>
        <details className="card">
          <summary className="cursor-pointer font-semibold text-brand-600">+ Nuevo ministerio</summary>
          <div className="pt-3"><MinistryForm /></div>
        </details>
      </section>
      <section className="space-y-3">
        <h2 className="font-bold">Asignaciones y seguimiento</h2>
        <AssignmentsTable assignments={(assignments as any) ?? []} />
      </section>
      <section className="space-y-3">
        <h2 className="font-bold">Líderes de ministerio</h2>
        <p className="text-xs text-gray-500">
          Un líder ve, en /liderazgo/segmentacion, únicamente a quienes marcaron interés en el ministerio
          que lidera (Dream Team) — nunca la lista completa. Solo el superadministrador puede asignar o quitar líderes.
        </p>
        <MinistryLeadersPanel leaders={(leaders as any) ?? []} ministries={(ministries as any) ?? []} canManage={role === 'superadmin'} />
      </section>
    </div>
  );
}
