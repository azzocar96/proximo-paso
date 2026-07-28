'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveDreamTeam } from '@/lib/actions/dreamteam';
import { Alert } from '@/components/ui/Alert';
import { EDUCATION_LEVEL_LABEL, CHURCH_ATTENDANCE_LABEL } from '@/lib/utils';

const AREAS = ['Alabanza', 'Bienvenida', 'Niños', 'Jóvenes', 'Multimedia', 'Intercesión', 'Logística', 'Limpieza', 'Seguridad', 'Consejería'];
const DAYS = ['Domingo AM', 'Domingo PM', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const TIMES = ['Mañana', 'Tarde', 'Noche'];
const MAX_MINISTRY_PREFS = 3;

export function DreamTeamForm({ ministries, questions, initial }: {
  ministries: { id: string; name: string }[];
  questions: { id: string; question_type: string; text: string; options: string[] | null; required: boolean }[];
  initial: any;
}) {
  const extraInit: Record<string, any> = {};
  for (const a of initial?.dream_team_answers ?? []) extraInit[a.question_id] = a.value;
  const [f, setF] = useState({
    interest_areas: (initial?.interest_areas ?? []) as string[],
    talents_text: ((initial?.talents ?? []) as string[]).join(', '),
    experience: initial?.experience ?? '',
    weekly_availability: (initial?.weekly_availability ?? []) as string[],
    available_times: (initial?.available_times ?? []) as string[],
    ministry_interest_ids: (initial?.ministry_interest_ids ?? []) as string[],
    previous_church_experience: initial?.previous_church_experience ?? '',
    comments: initial?.comments ?? '',
    contact_consent: initial?.contact_consent ?? false,
    extra: extraInit,
    education_level: initial?.education_level ?? '',
    education_degree: initial?.education_degree ?? '',
    occupation: initial?.occupation ?? '',
    church_attendance_time: initial?.church_attendance_time ?? '',
    theological_studies: initial?.theological_studies ?? false,
    theological_studies_degree: initial?.theological_studies_degree ?? '',
    guidance_interest: initial?.guidance_interest ?? '',
  });
  const [msg, setMsg] = useState<{ error?: string; success?: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const toggle = (key: 'interest_areas' | 'weekly_availability' | 'available_times', v: string) =>
    setF((p) => ({ ...p, [key]: p[key].includes(v) ? p[key].filter((x: string) => x !== v) : [...p[key], v] }));

  function toggleMinistry(id: string) {
    setF((p) => ({
      ...p,
      ministry_interest_ids: p.ministry_interest_ids.includes(id)
        ? p.ministry_interest_ids.filter((x: string) => x !== id)
        : p.ministry_interest_ids.length >= MAX_MINISTRY_PREFS
          ? p.ministry_interest_ids
          : [...p.ministry_interest_ids, id],
    }));
  }

  function payload() {
    return {
      interest_areas: f.interest_areas,
      talents: f.talents_text.split(',').map((s) => s.trim()).filter(Boolean),
      experience: f.experience,
      weekly_availability: f.weekly_availability,
      available_times: f.available_times,
      ministry_interest_ids: f.ministry_interest_ids,
      previous_church_experience: f.previous_church_experience,
      comments: f.comments,
      contact_consent: f.contact_consent,
      extra: f.extra,
      education_level: f.education_level,
      education_degree: f.education_degree,
      occupation: f.occupation,
      church_attendance_time: f.church_attendance_time,
      theological_studies: f.theological_studies,
      theological_studies_degree: f.theological_studies_degree,
      guidance_interest: f.guidance_interest,
    };
  }
  const submit = (complete: boolean) => start(async () => {
    const r = await saveDreamTeam(payload(), complete);
    setMsg(r);
    if (complete && r?.success) router.refresh();
  });

  return (
    <div className="space-y-4">
      {msg?.error && <Alert kind="error">{msg.error}</Alert>}
      {msg?.success && <Alert kind="success">{msg.success}</Alert>}

      <Chips label="Áreas de interés *" options={AREAS} selected={f.interest_areas} onToggle={(v) => toggle('interest_areas', v)} />
      <div className="card space-y-2">
        <label className="label">Talentos o habilidades (separa con comas) *</label>
        <input className="input" value={f.talents_text} placeholder="Ej.: canto, cocina, diseño gráfico"
          onChange={(e) => setF((p) => ({ ...p, talents_text: e.target.value }))} />
      </div>
      <div className="card space-y-2">
        <label className="label">Experiencia (trabajos, estudios, voluntariado)</label>
        <textarea className="input min-h-24" value={f.experience} onChange={(e) => setF((p) => ({ ...p, experience: e.target.value }))} />
      </div>
      <Chips label="Disponibilidad semanal *" options={DAYS} selected={f.weekly_availability} onToggle={(v) => toggle('weekly_availability', v)} />
      <Chips label="Horarios disponibles" options={TIMES} selected={f.available_times} onToggle={(v) => toggle('available_times', v)} />
      <div className="card space-y-2">
        <p className="label">Elige hasta 3 ministerios de tu interés, en orden de preferencia *</p>
        <p className="text-xs text-gray-500">
          Toca en el orden que prefieras: el primero que toques será tu 1ª opción. Vuelve a tocar uno para quitarlo.
        </p>
        <div className="flex flex-wrap gap-2">
          {ministries.map((m) => {
            const order = f.ministry_interest_ids.indexOf(m.id);
            const selected = order !== -1;
            const disabled = !selected && f.ministry_interest_ids.length >= MAX_MINISTRY_PREFS;
            return (
              <button key={m.id} type="button" disabled={disabled} onClick={() => toggleMinistry(m.id)}
                className={`rounded-full px-4 py-2 text-sm font-medium border-2 flex items-center gap-1.5 ${
                  selected ? 'border-brand-600 bg-brand-50 text-brand-700'
                  : disabled ? 'border-gray-100 text-gray-300 cursor-not-allowed'
                  : 'border-gray-200 text-gray-600 hover:border-brand-600'
                }`}>
                {selected && (
                  <span className="w-5 h-5 rounded-full bg-brand-600 text-white text-xs flex items-center justify-center">{order + 1}</span>
                )}
                {m.name}
              </button>
            );
          })}
        </div>
      </div>
      <div className="card space-y-2">
        <label className="label">Experiencia previa en iglesias</label>
        <textarea className="input min-h-24" value={f.previous_church_experience}
          onChange={(e) => setF((p) => ({ ...p, previous_church_experience: e.target.value }))} />
      </div>

      <div className="card space-y-3">
        <p className="label !mb-0">Datos adicionales</p>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Nivel de educación</label>
            <select className="input" value={f.education_level} onChange={(e) => setF((p) => ({ ...p, education_level: e.target.value }))}>
              <option value="">— selecciona —</option>
              {Object.entries(EDUCATION_LEVEL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Título obtenido</label>
            <input className="input" value={f.education_degree} onChange={(e) => setF((p) => ({ ...p, education_degree: e.target.value }))} />
          </div>
          <div>
            <label className="label">Ocupación actual</label>
            <input className="input" value={f.occupation} onChange={(e) => setF((p) => ({ ...p, occupation: e.target.value }))} />
          </div>
          <div>
            <label className="label">Tiempo asistiendo a la iglesia</label>
            <select className="input" value={f.church_attendance_time} onChange={(e) => setF((p) => ({ ...p, church_attendance_time: e.target.value }))}>
              <option value="">— selecciona —</option>
              {Object.entries(CHURCH_ATTENDANCE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" className="w-5 h-5" checked={f.theological_studies}
            onChange={(e) => setF((p) => ({ ...p, theological_studies: e.target.checked }))} />
          <span>¿Tienes estudios teológicos?</span>
        </label>
        {f.theological_studies && (
          <div>
            <label className="label">Título de estudios teológicos</label>
            <input className="input" value={f.theological_studies_degree}
              onChange={(e) => setF((p) => ({ ...p, theological_studies_degree: e.target.value }))} />
          </div>
        )}
        <div>
          <label className="label">¿En qué te gustaría recibir orientación o recursos?</label>
          <textarea className="input min-h-20" value={f.guidance_interest}
            onChange={(e) => setF((p) => ({ ...p, guidance_interest: e.target.value }))} />
        </div>
      </div>

      {questions.map((q) => (
        <div key={q.id} className="card space-y-2">
          <label className="label">{q.text}{q.required && ' *'}</label>
          {q.question_type === 'single_choice' && Array.isArray(q.options) ? (
            <div className="flex flex-wrap gap-2">
              {q.options.map((o) => (
                <Chip key={o} on={f.extra[q.id] === o} onClick={() => setF((p) => ({ ...p, extra: { ...p.extra, [q.id]: o } }))}>{o}</Chip>
              ))}
            </div>
          ) : q.question_type === 'multiple_choice' && Array.isArray(q.options) ? (
            <div className="flex flex-wrap gap-2">
              {q.options.map((o) => {
                const cur: string[] = f.extra[q.id] ?? [];
                return <Chip key={o} on={cur.includes(o)} onClick={() => setF((p) => ({
                  ...p, extra: { ...p.extra, [q.id]: cur.includes(o) ? cur.filter((x) => x !== o) : [...cur, o] } }))}>{o}</Chip>;
              })}
            </div>
          ) : (
            <textarea className="input" value={f.extra[q.id] ?? ''}
              onChange={(e) => setF((p) => ({ ...p, extra: { ...p.extra, [q.id]: e.target.value } }))} />
          )}
        </div>
      ))}

      <div className="card space-y-2">
        <label className="label">Comentarios</label>
        <textarea className="input min-h-20" value={f.comments} onChange={(e) => setF((p) => ({ ...p, comments: e.target.value }))} />
      </div>
      <label className="card flex items-start gap-3 text-sm cursor-pointer">
        <input type="checkbox" className="mt-1 w-5 h-5" checked={f.contact_consent}
          onChange={(e) => setF((p) => ({ ...p, contact_consent: e.target.checked }))} />
        <span>Autorizo a la iglesia a contactarme para conversar sobre mi participación en un ministerio. *</span>
      </label>
      <div className="flex gap-2">
        <button className="btn-secondary flex-1" disabled={pending} onClick={() => submit(false)}>Guardar borrador</button>
        <button className="btn-primary flex-1" disabled={pending} onClick={() => submit(true)}>{pending ? 'Enviando…' : 'Enviar formulario'}</button>
      </div>
    </div>
  );
}

function Chips({ label, options, selected, onToggle }: { label: string; options: string[]; selected: string[]; onToggle: (v: string) => void }) {
  return (
    <div className="card space-y-2">
      <p className="label">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => <Chip key={o} on={selected.includes(o)} onClick={() => onToggle(o)}>{o}</Chip>)}
      </div>
    </div>
  );
}
function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={`rounded-full px-4 py-2 text-sm font-medium border-2 ${on ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-600 hover:border-brand-600'}`}>
      {on ? '✓ ' : ''}{children}
    </button>
  );
}
