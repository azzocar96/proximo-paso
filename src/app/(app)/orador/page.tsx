import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { fmtDate } from '@/lib/utils';
import { SpeakerRequests } from './ui';

export const metadata = { title: 'Mi paso' };

/**
 * Bandeja del orador: quien está asignado en step_speakers ve aquí las
 * solicitudes de confirmación de asistencia de SU paso y puede aprobarlas
 * o rechazarlas (la RPC valida; las policies de 009 le dan la lectura).
 * No requiere rol de staff: el orador suele ser un participante normal.
 */
export default async function OradorPage() {
  const { supabase, user } = await requireUser();
  const { data: mySteps } = await supabase.from('step_speakers')
    .select('step_number,bio,contact_phone').eq('user_id', user.id).order('step_number');
  if (!mySteps || mySteps.length === 0) redirect('/inicio');
  const stepNumbers = mySteps.map((s) => s.step_number);

  const { data: pendingRequests } = await supabase.from('attendance_records')
    .select('id,user_id,request_note,recorded_at,session_id, profiles!attendance_records_user_id_fkey(first_name,last_name,email), course_sessions!inner(step_number,name,session_date,course_cycles(name))')
    .eq('result', 'pending_approval')
    .in('course_sessions.step_number', stepNumbers)
    .order('recorded_at');

  const { data: sessions } = await supabase.from('course_sessions')
    .select('id,step_number,name,session_date,status, course_cycles(name)')
    .in('step_number', stepNumbers).eq('is_certification', false)
    .order('session_date', { ascending: false }).limit(12);

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold">Mi paso</h1>
      <div className="card text-sm space-y-1">
        <p>Eres orador de: <b>{stepNumbers.map((n) => `Paso ${n}`).join(', ')}</b></p>
        <p className="text-xs text-gray-500">
          Puedes aprobar o rechazar las solicitudes de confirmación de asistencia de tu paso.
          Todo queda registrado en auditoría con tu nombre.
        </p>
      </div>
      <SpeakerRequests requests={(pendingRequests as any) ?? []} />
      <section className="card text-sm">
        <h2 className="font-bold mb-2">Próximas sesiones de tu paso</h2>
        <ul className="divide-y">
          {(sessions ?? []).map((s: any) => (
            <li key={s.id} className="py-2 flex justify-between">
              <span>{s.course_cycles?.name} · {s.name}</span>
              <span className="text-gray-500">{s.session_date ? fmtDate(s.session_date) : 'Sin fecha'}</span>
            </li>
          ))}
          {(sessions ?? []).length === 0 && <li className="py-2 text-gray-500">Sin sesiones programadas.</li>}
        </ul>
      </section>
    </div>
  );
}
