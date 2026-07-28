import { requireMinistryLeader } from '@/lib/auth';
import { fetchSegmentationRows, parseSegmentFilters } from '@/lib/segmentation';
import { SegmentationPanel } from '@/components/segmentation/SegmentationPanel';

export const metadata = { title: 'Mi ministerio · Segmentación' };

export default async function SegmentacionLiderPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const { supabase, user } = await requireMinistryLeader();
  const filters = parseSegmentFilters(searchParams);

  const [rows, { data: cycles }, { data: myMinistries }] = await Promise.all([
    fetchSegmentationRows(supabase, filters),
    supabase.from('course_cycles').select('id,name').is('deleted_at', null).order('created_at', { ascending: false }),
    supabase.from('ministry_leaders').select('ministries(id,name)').eq('user_id', user.id),
  ]);
  const ministries = (myMinistries ?? [])
    .map((m: any) => (Array.isArray(m.ministries) ? m.ministries[0] : m.ministries))
    .filter(Boolean) as { id: string; name: string }[];

  const sp: Record<string, string> = {};
  for (const [k, v] of Object.entries(searchParams)) sp[k] = Array.isArray(v) ? v[0] ?? '' : v ?? '';
  const qs = new URLSearchParams(sp).toString();

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold">Personas interesadas en tu ministerio</h1>
      <p className="text-sm text-gray-600">
        Solo ves aquí a quienes marcaron interés en el o los ministerios que lideras — nunca la lista completa.
      </p>
      <SegmentationPanel
        rows={rows}
        sp={sp}
        options={{ cycles: cycles ?? [], ministries }}
        basePath="/liderazgo/segmentacion"
        exportHref={`/api/reportes?tipo=segmentacion${qs ? `&${qs}` : ''}`}
        canOpenFicha={false}
      />
    </div>
  );
}
