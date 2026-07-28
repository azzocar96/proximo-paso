import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import {
  fmtDate, calcAge, ENROLLMENT_LABEL, MINISTRY_ASSIGN_LABEL, CERT_LABEL,
  EDUCATION_LEVEL_LABEL, CHURCH_ATTENDANCE_LABEL,
} from '@/lib/utils';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { OverridePanel, SuggestPanel } from './ui';

export const metadata = { title: 'Ficha del participante' };
export default async function FichaPage({ params }: { params: { id: string } }) {
  const { supabase } = await requireAdmin();
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', params.id).maybeSingle();
  if (!profile) notFound();

  const [{ data: enrollments }, { data: attempts }, { data: dtForms }, { data: assignments }, { data: certs }, { data: ministries }] = await Promise.all([
    supabase.from('enrollments').select('*, course_cycles(name)').eq('user_id', params.id).order('created_at', { ascending: false }),
    supabase.from('assessment_attempts').select('id,completed_at,enrollment_id, assessment_results(total_score,dimension_scores,summary,external_result)').eq('user_id', params.id),
    supabase.from('dream_team_forms').select('*').eq('user_id', params.id),
    supabase.from('ministry_assignments').select('*, ministries(name)').eq('user_id', params.id),
    supabase.from('certificates').select('*').eq('user_id', params.id),
    supabase.from('ministries').select('id,name').eq('status', 'active').order('name'),
  ]);

  const active = (enrollments ?? []).find((e) => !['withdrawn', 'cancelled'].includes(e.status));
  let progress: any = null;
  if (active) {
    const { data } = await supabase.rpc('get_progress', { p_enrollment: active.id });
    progress = data;
  }
  const att = active
    ? (await supabase.from('attendance_records')
        .select('recorded_at,method, course_sessions(step_number)')
        .eq('user_id', params.id).eq('enrollment_id', active.id)).data
    : [];
  const dt = (dtForms ?? []).find((f) => f.enrollment_id === active?.id) ?? (dtForms ?? [])[0];

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold">{profile.first_name} {profile.middle_name ?? ''} {profile.last_name}</h1>
      <div className="grid md:grid-cols-2 gap-4">
        <section className="card text-sm space-y-1">
          <h2 className="font-bold mb-2">Datos</h2>
          <p>✉️ {profile.email}</p>
          {profile.phone && <p>📞 {profile.phone}</p>}
          {profile.birth_date && <p>🎂 {fmtDate(profile.birth_date)}{calcAge(profile.birth_date) != null ? ` (${calcAge(profile.birth_date)} años)` : ''}</p>}
          {profile.city && <p>📍 {[profile.address, profile.city, profile.state, profile.zip_code].filter(Boolean).join(', ')}</p>}
          {(profile.emergency_contact_name || profile.emergency_contact_phone) && (
            <p>🚨 Emergencia: {[profile.emergency_contact_name, profile.emergency_contact_phone].filter(Boolean).join(' · ')}</p>
          )}
          <p>Registro: {fmtDate(profile.created_at)} · Cuenta: {profile.account_status === 'active' ? 'activa' : profile.account_status}</p>
        </section>
        <section className="card text-sm">
          <h2 className="font-bold mb-2">Progreso {active ? `— ${(active as any).course_cycles?.name}` : ''}</h2>
          {progress ? (
            <ul className="space-y-1">
              {progress.steps?.map((s: any) => (
                <li key={s.step}>{s.attended ? '✅' : s.unlocked ? '🟡' : '🔒'} Paso {s.step} {s.date ? `· ${fmtDate(s.date)}` : ''}</li>
              ))}
              <li>{progress.test_done ? '✅' : '⬜'} Test de personalidad</li>
              <li>{progress.dream_team_done ? '✅' : '⬜'} Dream Team</li>
            </ul>
          ) : <p className="text-gray-500">Sin inscripción activa.</p>}
          {(att ?? []).length > 0 && (
            <p className="text-xs text-gray-400 mt-2">
              Asistencias: {(att ?? []).map((a: any) => `P${a.course_sessions?.step_number}${a.method !== 'qr_geolocation' ? '*' : ''}`).join(', ')} (* = manual)
            </p>
          )}
        </section>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <section className="card text-sm">
          <h2 className="font-bold mb-2">Resultado del test 🔒</h2>
          {(attempts ?? []).filter((a) => a.completed_at).map((a: any) => {
            const r = Array.isArray(a.assessment_results) ? a.assessment_results[0] : a.assessment_results;
            return (
              <div key={a.id} className="space-y-1">
                {r?.dimension_scores && Object.entries(r.dimension_scores as Record<string, number>)
                  .sort((x, y) => y[1] - x[1])
                  .map(([k, v]) => <p key={k}>{k}: <b>{v}</b></p>)}
                {r?.summary && <p>{r.summary}</p>}
                {r?.external_result && <p><b>Resultado autoreportado (test externo):</b> {r.external_result}</p>}
                {!r && <p className="text-gray-500">Completado (sin puntuación — posible test externo o excepción).</p>}
              </div>
            );
          })}
          {(attempts ?? []).filter((a) => a.completed_at).length === 0 && <p className="text-gray-500">Sin test completado.</p>}
          <p className="text-xs text-gray-400 mt-2">Información privada — visible solo para administradores.</p>
        </section>
        <section className="card text-sm">
          <h2 className="font-bold mb-2">Dream Team</h2>
          {dt ? (
            <div className="space-y-1">
              {dt.interest_areas?.length > 0 && <p><b>Intereses:</b> {dt.interest_areas.join(', ')}</p>}
              {dt.talents?.length > 0 && <p><b>Talentos:</b> {dt.talents.join(', ')}</p>}
              {dt.weekly_availability?.length > 0 && <p><b>Disponibilidad:</b> {dt.weekly_availability.join(', ')}{dt.available_times?.length ? ` (${dt.available_times.join(', ')})` : ''}</p>}
              {dt.previous_church_experience && <p><b>Experiencia en iglesias:</b> {dt.previous_church_experience}</p>}
              {dt.education_level && (
                <p><b>Educación:</b> {EDUCATION_LEVEL_LABEL[dt.education_level] ?? dt.education_level}{dt.education_degree ? ` — ${dt.education_degree}` : ''}</p>
              )}
              {dt.occupation && <p><b>Ocupación actual:</b> {dt.occupation}</p>}
              {dt.church_attendance_time && <p><b>Tiempo asistiendo a la iglesia:</b> {CHURCH_ATTENDANCE_LABEL[dt.church_attendance_time] ?? dt.church_attendance_time}</p>}
              {dt.theological_studies && <p><b>Estudios teológicos:</b> sí{dt.theological_studies_degree ? ` — ${dt.theological_studies_degree}` : ''}</p>}
              {dt.guidance_interest && <p><b>Le gustaría recibir orientación en:</b> {dt.guidance_interest}</p>}
              {dt.comments && <p><b>Comentarios:</b> {dt.comments}</p>}
              <p className="text-xs text-gray-400">{dt.completed_at ? `Enviado: ${fmtDate(dt.completed_at)}` : 'Borrador sin enviar'} · Contacto autorizado: {dt.contact_consent ? 'sí' : 'no'}</p>
            </div>
          ) : <p className="text-gray-500">Sin formulario.</p>}
        </section>
      </div>

      <section className="card text-sm space-y-2">
        <h2 className="font-bold">Ministerios</h2>
        {(assignments ?? []).map((a: any) => (
          <p key={a.id}>{a.ministries?.name}: <StatusBadge status={a.status} label={MINISTRY_ASSIGN_LABEL[a.status]} />{a.notes ? ` — ${a.notes}` : ''}</p>
        ))}
        {(assignments ?? []).length === 0 && <p className="text-gray-500">Sin asignaciones ni intereses.</p>}
        <SuggestPanel userId={params.id} ministries={(ministries as any) ?? []} />
      </section>

      <section className="card text-sm space-y-2">
        <h2 className="font-bold">Certificados</h2>
        {(certs ?? []).map((c: any) => (
          <p key={c.id}>{c.course_name} · {fmtDate(c.completion_date)} · <StatusBadge status={c.status} label={CERT_LABEL[c.status]} /> · código {c.verify_code}</p>
        ))}
        {(certs ?? []).length === 0 && <p className="text-gray-500">Sin certificados.</p>}
      </section>

      {active && <OverridePanel enrollmentId={active.id} />}
    </div>
  );
}
