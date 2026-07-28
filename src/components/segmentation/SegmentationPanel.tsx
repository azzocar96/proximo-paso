import Link from 'next/link';
import type { SegmentRow } from '@/lib/segmentation';
import { ENROLLMENT_LABEL } from '@/lib/utils';

type Options = {
  cycles: { id: string; name: string }[];
  ministries: { id: string; name: string }[];
};

/**
 * Componente compartido entre /admin/segmentacion y /liderazgo/segmentacion.
 * No decide quién ve qué: rows ya viene filtrado por RLS + fetchSegmentationRows.
 * Server component puro (sin JS de cliente): los filtros son un <form method="get">
 * que recarga la página con la misma URL que consume /api/reportes?tipo=segmentacion.
 */
export function SegmentationPanel({
  rows, sp, options, basePath, exportHref, canOpenFicha,
}: {
  rows: SegmentRow[];
  sp: Record<string, string>;
  options: Options;
  basePath: string;
  exportHref: string;
  canOpenFicha: boolean;
}) {
  const groupBy = sp.agrupar || 'ninguno';
  const groups = rows.length ? groupRows(rows, groupBy) : [];

  return (
    <div className="space-y-6">
      <form className="card grid sm:grid-cols-2 md:grid-cols-4 gap-3 text-sm" method="get" action={basePath}>
        <div>
          <label className="label">Ciclo</label>
          <select className="input" name="ciclo" defaultValue={sp.ciclo ?? ''}>
            <option value="">Todos</option>
            {options.cycles.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Mes de inscripción</label>
          <input className="input" type="month" name="mes" defaultValue={sp.mes ?? ''} />
        </div>
        <div>
          <label className="label">Paso / estado</label>
          <select className="input" name="estado" defaultValue={sp.estado ?? ''}>
            <option value="">Todos</option>
            {Object.entries(ENROLLMENT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Ministerio de interés</label>
          <select className="input" name="ministerio" defaultValue={sp.ministerio ?? ''}>
            <option value="">Todos</option>
            {options.ministries.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Resultado del test</label>
          <input className="input" name="test" placeholder="Ej.: D, I, S, C…" defaultValue={sp.test ?? ''} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div><label className="label">Edad mín.</label><input className="input" type="number" min={0} name="edad_min" defaultValue={sp.edad_min ?? ''} /></div>
          <div><label className="label">Edad máx.</label><input className="input" type="number" min={0} name="edad_max" defaultValue={sp.edad_max ?? ''} /></div>
        </div>
        <div>
          <label className="label">Agrupar por</label>
          <select className="input" name="agrupar" defaultValue={groupBy}>
            <option value="ninguno">Sin agrupar</option>
            <option value="ciclo">Ciclo</option>
            <option value="estado">Paso / estado</option>
            <option value="ministerio">Ministerio</option>
            <option value="test">Resultado del test</option>
            <option value="edad">Rango de edad</option>
          </select>
        </div>
        <div className="flex items-end gap-2">
          <button className="btn-primary flex-1">Filtrar</button>
          <Link href={basePath} className="btn-secondary flex-1 text-center">Limpiar</Link>
        </div>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-gray-600">
          {rows.length} persona{rows.length === 1 ? '' : 's'} encontrada{rows.length === 1 ? '' : 's'}.
        </p>
        <a className="btn-secondary !py-1.5 !px-3 text-sm" href={exportHref}>Exportar CSV</a>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">Sin resultados para estos filtros.</p>
      ) : (
        <div className="space-y-6">
          {groups.map(([label, groupRowsArr]) => (
            <section key={label} className="space-y-2">
              {groupBy !== 'ninguno' && <h2 className="font-bold text-sm text-brand-700">{label} · {groupRowsArr.length}</h2>}
              <div className="card overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-gray-500 border-b">
                    <th className="py-2">Nombre</th><th>Correo</th><th>Teléfono</th><th>Edad</th>
                    <th>Ciclo</th><th>Paso/estado</th><th>Resultado test</th><th>Ministerios</th></tr></thead>
                  <tbody className="divide-y">
                    {groupRowsArr.map((r) => (
                      <tr key={r.id}>
                        <td className="py-2 font-medium">
                          {canOpenFicha
                            ? <Link className="text-brand-600 underline" href={`/admin/participantes/${r.id}`}>{r.name || '—'}</Link>
                            : (r.name || '—')}
                        </td>
                        <td>{r.email}</td>
                        <td>{r.phone ?? '—'}</td>
                        <td>{r.age ?? '—'}</td>
                        <td>{r.cycleName ?? '—'}</td>
                        <td>{r.enrollmentStatus ? (ENROLLMENT_LABEL[r.enrollmentStatus] ?? r.enrollmentStatus) : '—'}</td>
                        <td>{r.testResult ?? '—'}</td>
                        <td>{r.ministryNames.join(', ') || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function groupRows(rows: SegmentRow[], groupBy: string): [string, SegmentRow[]][] {
  if (groupBy === 'ninguno') return [['Todos', rows]];
  const keyFn: (r: SegmentRow) => string[] =
    groupBy === 'ciclo' ? (r) => [r.cycleName ?? 'Sin ciclo'] :
    groupBy === 'estado' ? (r) => [r.enrollmentStatus ? (ENROLLMENT_LABEL[r.enrollmentStatus] ?? r.enrollmentStatus) : 'Sin estado'] :
    groupBy === 'ministerio' ? (r) => (r.ministryNames.length ? r.ministryNames : ['Sin ministerio']) :
    groupBy === 'test' ? (r) => [r.testResult ?? 'Sin resultado'] :
    groupBy === 'edad' ? (r) => [r.ageBracket] :
    () => ['Todos'];
  const map = new Map<string, SegmentRow[]>();
  for (const r of rows) {
    for (const k of keyFn(r)) {
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(r);
    }
  }
  return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
}
