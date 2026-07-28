import { requireAdmin } from '@/lib/auth';
import { ENROLLMENT_LABEL } from '@/lib/utils';

export const metadata = { title: 'Reportes' };
export default async function ReportesPage() {
  const { supabase } = await requireAdmin();
  const { data: cycles } = await supabase.from('course_cycles').select('id,name').is('deleted_at', null).order('created_at', { ascending: false });
  const { data: byStatus } = await supabase.from('enrollments').select('status');
  const counts: Record<string, number> = {};
  for (const e of byStatus ?? []) counts[e.status] = (counts[e.status] ?? 0) + 1;
  const EXPORTS = [
    { key: 'inscripciones', label: 'Inscripciones (con estado y ciclo)' },
    { key: 'asistencia', label: 'Asistencia (por sesión, con método y distancia)' },
    { key: 'certificados', label: 'Certificados' },
    { key: 'dream-team', label: 'Formularios Dream Team' },
    { key: 'ministerios', label: 'Asignaciones ministeriales' },
    { key: 'usuarios', label: 'Usuarios' },
  ];
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold">Reportes</h1>
      <section className="card">
        <h2 className="font-bold mb-3">Inscripciones por estado</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Object.entries(counts).map(([k, v]) => (
            <div key={k} className="rounded-xl bg-gray-50 p-3 text-center">
              <p className="text-2xl font-bold text-brand-700">{v}</p>
              <p className="text-xs text-gray-600">{ENROLLMENT_LABEL[k] ?? k}</p>
            </div>
          ))}
          {Object.keys(counts).length === 0 && <p className="text-sm text-gray-500 col-span-4">Sin datos aún.</p>}
        </div>
      </section>
      <section className="card space-y-3">
        <h2 className="font-bold">Exportar CSV</h2>
        <p className="text-sm text-gray-600">Filtra por ciclo con el parámetro de la lista (opcional) y descarga.</p>
        {EXPORTS.map((x) => (
          <div key={x.key} className="flex flex-wrap items-center justify-between gap-2 border-b last:border-0 pb-2">
            <span className="text-sm">{x.label}</span>
            <div className="flex gap-2">
              <a className="btn-secondary !py-1.5 !px-3 text-sm" href={`/api/reportes?tipo=${x.key}`}>Todo</a>
              {['inscripciones', 'asistencia'].includes(x.key) && (cycles ?? []).map((c) => (
                <a key={c.id} className="btn-secondary !py-1.5 !px-3 text-sm" href={`/api/reportes?tipo=${x.key}&ciclo=${c.id}`}>{c.name}</a>
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
