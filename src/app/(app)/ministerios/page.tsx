import { requireUser } from '@/lib/auth';
import { MINISTRY_ASSIGN_LABEL } from '@/lib/utils';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { InterestButton } from './ui';

export const metadata = { title: 'Ministerios' };
export default async function MinisteriosPage() {
  const { supabase, user } = await requireUser();
  const [{ data: ministries }, { data: mine }] = await Promise.all([
    supabase.from('ministries').select('*').eq('status', 'active').order('name'),
    supabase.from('ministry_assignments').select('ministry_id,status').eq('user_id', user.id),
  ]);
  const mineMap = new Map((mine ?? []).map((m) => [m.ministry_id, m.status]));
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold">Ministerios</h1>
      <p className="text-sm text-gray-600">Conoce los equipos de la iglesia. Puedes expresar tu interés y te contactarán.</p>
      {(ministries ?? []).map((m) => (
        <section key={m.id} className="card space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-bold">{m.name}</h2>
              {m.leader_name && <p className="text-xs text-gray-500">Líder: {m.leader_name}</p>}
            </div>
            {mineMap.has(m.id) && <StatusBadge status={mineMap.get(m.id)!} label={MINISTRY_ASSIGN_LABEL[mineMap.get(m.id)!]} />}
          </div>
          {m.description && <p className="text-sm text-gray-600">{m.description}</p>}
          {m.requirements && <p className="text-xs text-amber-700">Requisitos: {m.requirements}</p>}
          {!mineMap.has(m.id) && <InterestButton ministryId={m.id} />}
        </section>
      ))}
      {(ministries ?? []).length === 0 && <p className="card text-sm text-gray-600">La iglesia aún no publicó sus ministerios.</p>}
    </div>
  );
}
