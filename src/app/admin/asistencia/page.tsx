import { requireStaff } from '@/lib/auth';
import { AttendancePanel } from './ui';

export const metadata = { title: 'Asistencia' };
export default async function AsistenciaAdminPage({ searchParams }: { searchParams: { sesion?: string } }) {
  const { supabase } = await requireStaff();
  const { data: sessions } = await supabase.from('course_sessions')
    .select('id,step_number,name,session_date,status, course_cycles(name)')
    .order('session_date', { ascending: false }).limit(60);
  const selected = searchParams.sesion ?? (sessions?.[0]?.id ?? null);
  let records: any[] = [], enrolled: any[] = [];
  if (selected) {
    const [{ data: r }, { data: s }] = await Promise.all([
      supabase.from('attendance_records')
        .select('id,user_id,method,result,distance_meters,accuracy_meters,recorded_at,manual_reason, profiles(first_name,last_name,email)')
        .eq('session_id', selected).order('recorded_at'),
      supabase.from('course_sessions').select('cycle_id').eq('id', selected).single()
        .then(async ({ data: sess }) => sess
          ? supabase.from('enrollments').select('user_id,status, profiles(first_name,last_name,email)')
              .eq('cycle_id', sess.cycle_id).not('status', 'in', '("withdrawn","cancelled")')
          : { data: [] } as any),
    ]);
    records = r ?? []; enrolled = (s as any) ?? [];
  }
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold">Asistencia — corrección manual</h1>
      <AttendancePanel sessions={(sessions as any) ?? []} selectedId={selected} records={records} enrolled={enrolled} />
    </div>
  );
}
