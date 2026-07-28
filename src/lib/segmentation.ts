import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Filtros de segmentación de participantes. Los usa tanto la pantalla
 * (/admin/segmentacion y /liderazgo/segmentacion) como la exportación CSV
 * (/api/reportes?tipo=segmentacion) — misma función, mismos parámetros, para
 * no mantener dos implementaciones de la misma consulta.
 *
 * El alcance real de "quién ve a quién" lo impone RLS (003 + 004), no este
 * archivo: un admin ve todos los perfiles visibles; un líder de ministerio
 * solo ve, a nivel de base de datos, a quienes marcaron interés en un
 * ministerio que lidera. Esta función simplemente arma y filtra sobre lo que
 * el cliente de Supabase ya devuelve para el usuario autenticado.
 */
export type SegmentFilters = {
  cycleId?: string;
  month?: string; // 'YYYY-MM' del mes de inscripción (enrollments.created_at)
  status?: string; // estado de inscripción ("paso" del programa)
  ministryId?: string;
  testResult?: string; // coincide (contiene, sin distinguir mayúsculas) con el resultado autoreportado o la dimensión dominante
  ageMin?: number;
  ageMax?: number;
};

export type SegmentRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  age: number | null;
  ageBracket: string;
  cycleId: string | null;
  cycleName: string | null;
  enrollmentStatus: string | null;
  enrollmentMonth: string | null;
  testResult: string | null;
  ministryIds: string[];
  ministryNames: string[];
};

function firstOf<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

function paramValue(v: string | string[] | undefined): string {
  if (Array.isArray(v)) return v[0] ?? '';
  return v ?? '';
}

/** Lee los filtros desde un URLSearchParams (API route) o desde el objeto
 * searchParams de una página del App Router (server component). */
export function parseSegmentFilters(
  sp: URLSearchParams | Record<string, string | string[] | undefined>
): SegmentFilters {
  const get = (k: string): string =>
    sp instanceof URLSearchParams ? sp.get(k) ?? '' : paramValue(sp[k]);
  const num = (k: string): number | undefined => {
    const v = get(k);
    if (!v) return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  return {
    cycleId: get('ciclo') || undefined,
    month: get('mes') || undefined,
    status: get('estado') || undefined,
    ministryId: get('ministerio') || undefined,
    testResult: get('test') || undefined,
    ageMin: num('edad_min'),
    ageMax: num('edad_max'),
  };
}

function calcAge(birthDate: string | null | undefined): number | null {
  if (!birthDate) return null;
  const b = new Date(birthDate.includes('T') ? birthDate : birthDate + 'T00:00:00');
  if (Number.isNaN(b.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age;
}

export function ageBracket(age: number | null): string {
  if (age == null) return 'Sin dato';
  if (age < 18) return 'Menor de 18';
  if (age <= 25) return '18–25';
  if (age <= 35) return '26–35';
  if (age <= 50) return '36–50';
  return '51+';
}

function dominantTestResult(
  dimensionScores: Record<string, number> | null | undefined,
  externalResult: string | null | undefined
): string | null {
  if (externalResult && externalResult.trim()) return externalResult.trim();
  if (dimensionScores && Object.keys(dimensionScores).length > 0) {
    const sorted = Object.entries(dimensionScores).sort((a, b) => b[1] - a[1]);
    return sorted[0]?.[0] ?? null;
  }
  return null;
}

/**
 * Arma las filas de segmentación para el usuario autenticado (admin o líder
 * de ministerio) y aplica los filtros. La visibilidad real de cada fila la
 * decide RLS; aquí solo filtramos/derivamos sobre lo ya autorizado.
 */
export async function fetchSegmentationRows(
  supabase: SupabaseClient,
  filters: SegmentFilters
): Promise<SegmentRow[]> {
  const { data, error } = await supabase.from('profiles').select(`
    id, first_name, middle_name, last_name, email, phone, birth_date,
    enrollments(status, cycle_id, created_at, course_cycles(name)),
    dream_team_forms(ministry_interest_ids),
    assessment_attempts(completed_at, assessment_results(dimension_scores, external_result))
  `);
  if (error) throw new Error(error.message);

  const profileRows = (data ?? []) as any[];

  // resolver nombres de ministerios (una sola consulta para todos los ids usados)
  const ministryIdsSet = new Set<string>();
  for (const p of profileRows) {
    for (const f of p.dream_team_forms ?? []) {
      for (const mid of f.ministry_interest_ids ?? []) ministryIdsSet.add(mid);
    }
  }
  let ministryNameById: Record<string, string> = {};
  if (ministryIdsSet.size > 0) {
    const { data: mins } = await supabase.from('ministries').select('id,name').in('id', Array.from(ministryIdsSet));
    for (const m of mins ?? []) ministryNameById[m.id as string] = m.name as string;
  }

  const rows: SegmentRow[] = [];
  for (const p of profileRows) {
    const age = calcAge(p.birth_date);
    const ministryIds = Array.from(
      new Set(((p.dream_team_forms ?? []) as any[]).flatMap((f) => f.ministry_interest_ids ?? []))
    ) as string[];

    const enrollmentsArr = (p.enrollments ?? []) as any[];
    const activeEnrollments = enrollmentsArr.filter((e) => !['withdrawn', 'cancelled'].includes(e.status));
    const enr = (activeEnrollments.length ? activeEnrollments : enrollmentsArr)
      .slice()
      .sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')))[0];

    let testResult: string | null = null;
    for (const at of (p.assessment_attempts ?? []) as any[]) {
      const r = firstOf(at.assessment_results);
      const val = dominantTestResult(r?.dimension_scores, r?.external_result);
      if (val) { testResult = val; break; }
    }

    const cycle = firstOf(enr?.course_cycles);
    const row: SegmentRow = {
      id: p.id,
      name: [p.first_name, p.middle_name, p.last_name].filter(Boolean).join(' '),
      email: p.email,
      phone: p.phone ?? null,
      age,
      ageBracket: ageBracket(age),
      cycleId: enr?.cycle_id ?? null,
      cycleName: cycle?.name ?? null,
      enrollmentStatus: enr?.status ?? null,
      enrollmentMonth: enr?.created_at ? String(enr.created_at).slice(0, 7) : null,
      testResult,
      ministryIds,
      ministryNames: ministryIds.map((id) => ministryNameById[id] ?? id),
    };

    if (filters.cycleId && row.cycleId !== filters.cycleId) continue;
    if (filters.month && row.enrollmentMonth !== filters.month) continue;
    if (filters.status && row.enrollmentStatus !== filters.status) continue;
    if (filters.ministryId && !row.ministryIds.includes(filters.ministryId)) continue;
    if (filters.testResult && !(row.testResult ?? '').toLowerCase().includes(filters.testResult.toLowerCase())) continue;
    if (filters.ageMin != null && (row.age == null || row.age < filters.ageMin)) continue;
    if (filters.ageMax != null && (row.age == null || row.age > filters.ageMax)) continue;

    rows.push(row);
  }
  return rows;
}
