import { requireUser } from '@/lib/auth';
import { fmtDate } from '@/lib/utils';

export const metadata = { title: 'Anuncios' };
export default async function AnunciosPage() {
  const { supabase } = await requireUser();
  const { data: anns } = await supabase.from('announcements')
    .select('id,title,content,image_url,publish_at,priority')
    .order('priority', { ascending: false }).order('publish_at', { ascending: false }).limit(50);
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold">Anuncios</h1>
      {(anns ?? []).length === 0 && <p className="card text-sm text-gray-600">No hay anuncios por ahora.</p>}
      {(anns ?? []).map((a) => (
        <article key={a.id} className="card space-y-2">
          {a.image_url && <img src={a.image_url} alt="" className="rounded-xl w-full object-cover max-h-52" />}
          <div className="flex items-center gap-2">
            {a.priority > 0 && <span className="badge bg-accent/20 text-amber-800">Importante</span>}
            <h2 className="font-bold">{a.title}</h2>
          </div>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{a.content}</p>
          <p className="text-xs text-gray-400">{fmtDate(a.publish_at)}</p>
        </article>
      ))}
    </div>
  );
}
