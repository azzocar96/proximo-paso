import { requireAdmin } from '@/lib/auth';
import { DreamTeamAdmin } from './ui';
import { fmtDate } from '@/lib/utils';

export const metadata = { title: 'Dream Team' };
export default async function DreamTeamAdminPage() {
  const { supabase } = await requireAdmin();
  const [{ data: questions }, { data: forms }] = await Promise.all([
    supabase.from('dream_team_questions').select('*').order('position'),
    supabase.from('dream_team_forms')
      .select('id,interest_areas,talents,weekly_availability,completed_at,contact_consent, profiles(id,first_name,last_name,email)')
      .not('completed_at', 'is', null).order('completed_at', { ascending: false }).limit(100),
  ]);
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold">Formulario Dream Team</h1>
      <DreamTeamAdmin questions={(questions as any) ?? []} />
      <section className="card overflow-x-auto">
        <h2 className="font-bold mb-2">Respuestas recibidas ({(forms ?? []).length})</h2>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-gray-500 border-b"><th className="py-2">Participante</th><th>Intereses</th><th>Disponibilidad</th><th>Enviado</th><th></th></tr></thead>
          <tbody className="divide-y">
            {(forms ?? []).map((f: any) => (
              <tr key={f.id}>
                <td className="py-2">{f.profiles?.first_name} {f.profiles?.last_name}</td>
                <td className="text-xs">{(f.interest_areas ?? []).join(', ')}</td>
                <td className="text-xs">{(f.weekly_availability ?? []).join(', ')}</td>
                <td className="text-xs">{fmtDate(f.completed_at)}</td>
                <td><a className="text-brand-600 underline" href={`/admin/participantes/${f.profiles?.id}`}>Ficha</a></td>
              </tr>
            ))}
            {(forms ?? []).length === 0 && <tr><td colSpan={5} className="py-3 text-gray-500">Sin respuestas aún.</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  );
}
