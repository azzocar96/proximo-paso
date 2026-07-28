import { requireAdmin } from '@/lib/auth';
import { fetchSegmentationRows, parseSegmentFilters } from '@/lib/segmentation';
import { SegmentationPanel } from '@/components/segmentation/SegmentationPanel';

export const metadata = { title: 'Segmentación' };

export default async function SegmentacionAdminPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const { supabase } = await requireAdmin();
  const filters = parseSegmentFilters(searchParams);

  const [rows, { data: cycles }, { data: ministries }] = await Promise.all([
    fetchSegmentationRows(supabase, filters),
    supabase.from('course_cycles').select('id,name').is('deleted_at', null).order('created_at', { ascending: false }),
    supabase.from('ministries').select('id,name').eq('status', 'active').order('name'),
  ]);

  const sp: Record<string, string> = {};
  for (const [k, v] of Object.entries(searchParams)) sp[k] = Array.isArray(v) ? v[0] ?? '' : v ?? '';
  const qs = new URLSearchParams(sp).toString();

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold">Segmentación de participantes</h1>
      <p className="text-sm text-gray-600">
        Filtra y agrupa por ciclo/mes de inscripción, paso del programa, resultado del test,
        ministerio de interés y rango de edad — sin buscar persona por persona.
      </p>
      <SegmentationPanel
        rows={rows}
        sp={sp}
        options={{ cycles: cycles ?? [], ministries: ministries ?? [] }}
        basePath="/admin/segmentacion"
        exportHref={`/api/reportes?tipo=segmentacion${qs ? `&${qs}` : ''}`}
        canOpenFicha
      />
    </div>
  );
}
