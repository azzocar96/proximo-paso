import { requireAdmin } from '@/lib/auth';
import { fmtDate } from '@/lib/utils';

export const metadata = { title: 'Auditoría' };
export default async function AuditoriaPage() {
  const { supabase } = await requireAdmin();
  const { data: logs } = await supabase.from('audit_logs')
    .select('*, profiles(first_name,last_name,email)')
    .order('created_at', { ascending: false }).limit(200);
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold">Auditoría</h1>
      <p className="text-sm text-gray-600">Acciones administrativas, excepciones y correcciones. Solo lectura.</p>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-gray-500 border-b">
            <th className="py-2">Fecha</th><th>Actor</th><th>Acción</th><th>Entidad</th><th>Motivo</th><th>Detalles</th></tr></thead>
          <tbody className="divide-y">
            {(logs ?? []).map((l: any) => (
              <tr key={l.id}>
                <td className="py-2 text-xs whitespace-nowrap">{new Date(l.created_at).toLocaleString('es-ES')}</td>
                <td className="text-xs">{l.profiles ? `${l.profiles.first_name} ${l.profiles.last_name}` : '—'}</td>
                <td className="font-mono text-xs">{l.action}</td>
                <td className="font-mono text-xs">{l.entity}</td>
                <td className="text-xs">{l.reason ?? '—'}</td>
                <td className="font-mono text-xs max-w-52 truncate">{l.details ? JSON.stringify(l.details) : '—'}</td>
              </tr>
            ))}
            {(logs ?? []).length === 0 && <tr><td colSpan={6} className="py-3 text-gray-500">Sin registros.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
