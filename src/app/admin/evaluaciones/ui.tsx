'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createAssessment, toggleAssessment, addSection, addQuestion, saveSetting } from '@/lib/actions/admin';
import { Alert } from '@/components/ui/Alert';

export function AssessmentAdmin({ assessments, mode, externalUrl, activeId }: {
  assessments: any[]; mode: string; externalUrl: string; activeId: string;
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ error?: string; success?: string } | null>(null);
  const [pending, start] = useTransition();
  const [m, setM] = useState(mode);
  const [url, setUrl] = useState(externalUrl);
  const [title, setTitle] = useState('');

  const run = (fn: () => Promise<any>) => start(async () => { setMsg(await fn()); router.refresh(); });

  return (
    <div className="space-y-5">
      {msg?.error && <Alert kind="error">{msg.error}</Alert>}
      {msg?.success && <Alert kind="success">{msg.success}</Alert>}

      <section className="card space-y-3">
        <h2 className="font-bold">Modo del test</h2>
        <div className="flex flex-wrap gap-3 items-center">
          <label className="flex items-center gap-2"><input type="radio" checked={m === 'internal_test'} onChange={() => setM('internal_test')} /> Test interno</label>
          <label className="flex items-center gap-2"><input type="radio" checked={m === 'external_url'} onChange={() => setM('external_url')} /> Enlace externo</label>
          {m === 'external_url' && <input className="input flex-1 min-w-60" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />}
          <button className="btn-primary !py-2" disabled={pending} onClick={() => run(async () => {
            const r1 = await saveSetting('assessment_mode', m);
            if (m === 'external_url') await saveSetting('assessment_external_url', url);
            return r1;
          })}>Guardar modo</button>
        </div>
        <p className="text-xs text-gray-500">⚠️ No inventes resultados psicológicos: usa un test validado por la iglesia (interno o externo). El seed incluye solo una DEMO.</p>
      </section>

      <section className="card space-y-3">
        <h2 className="font-bold">Evaluaciones</h2>
        <div className="flex gap-2">
          <input className="input" placeholder="Título de nueva evaluación" value={title} onChange={(e) => setTitle(e.target.value)} />
          <button className="btn-secondary !py-2 shrink-0" disabled={pending || title.trim().length < 3}
            onClick={() => run(async () => { const r = await createAssessment(title, ''); setTitle(''); return r; })}>Crear</button>
        </div>
        {assessments.map((a) => (
          <details key={a.id} className="border rounded-xl p-3">
            <summary className="cursor-pointer flex justify-between items-center">
              <span className="font-semibold">{a.title} {a.is_demo && <span className="badge bg-amber-100 text-amber-800">DEMO</span>} {activeId === a.id && <span className="badge bg-green-100 text-green-800">Activa en el flujo</span>}</span>
              <span className="flex gap-2">
                <button className="text-sm underline" disabled={pending} onClick={(e) => { e.preventDefault(); run(() => toggleAssessment(a.id, !a.is_active)); }}>
                  {a.is_active ? 'Desactivar' : 'Activar'}
                </button>
                {activeId !== a.id && (
                  <button className="text-sm underline text-brand-600" disabled={pending}
                    onClick={(e) => { e.preventDefault(); run(() => saveSetting('assessment_active_id', a.id)); }}>Usar en el flujo</button>
                )}
              </span>
            </summary>
            <AssessmentEditor assessment={a} run={run} pending={pending} />
          </details>
        ))}
      </section>
    </div>
  );
}

function AssessmentEditor({ assessment, run, pending }: { assessment: any; run: (fn: () => Promise<any>) => void; pending: boolean }) {
  const [secTitle, setSecTitle] = useState('');
  const [q, setQ] = useState({ sectionId: '', type: 'single_choice', text: '', options: '', scaleMax: 5 });
  const sections = [...(assessment.assessment_sections ?? [])].sort((a: any, b: any) => a.position - b.position);
  return (
    <div className="pt-3 space-y-4 text-sm">
      {sections.map((s: any) => (
        <div key={s.id} className="border-l-4 border-brand-100 pl-3">
          <p className="font-semibold">{s.title}</p>
          <ul className="list-disc ml-5 text-gray-600">
            {[...(s.assessment_questions ?? [])].sort((a: any, b: any) => a.position - b.position).map((qq: any) => (
              <li key={qq.id}>{qq.text} <span className="text-xs text-gray-400">({qq.question_type}{qq.assessment_options?.length ? `, ${qq.assessment_options.length} opciones` : ''})</span></li>
            ))}
          </ul>
        </div>
      ))}
      <div className="flex gap-2">
        <input className="input" placeholder="Nueva sección" value={secTitle} onChange={(e) => setSecTitle(e.target.value)} />
        <button className="btn-secondary !py-2 shrink-0" disabled={pending || !secTitle.trim()}
          onClick={() => run(async () => { const r = await addSection(assessment.id, secTitle, sections.length + 1); setSecTitle(''); return r; })}>+ Sección</button>
      </div>
      {sections.length > 0 && (
        <div className="space-y-2 border rounded-xl p-3">
          <p className="font-semibold">Nueva pregunta</p>
          <div className="grid md:grid-cols-2 gap-2">
            <select className="input" value={q.sectionId} onChange={(e) => setQ({ ...q, sectionId: e.target.value })}>
              <option value="">— Sección —</option>
              {sections.map((s: any) => <option key={s.id} value={s.id}>{s.title}</option>)}
            </select>
            <select className="input" value={q.type} onChange={(e) => setQ({ ...q, type: e.target.value })}>
              <option value="single_choice">Selección única</option>
              <option value="multiple_choice">Selección múltiple</option>
              <option value="scale">Escala</option>
              <option value="short_text">Texto corto</option>
              <option value="long_text">Texto largo</option>
            </select>
          </div>
          <input className="input" placeholder="Texto de la pregunta" value={q.text} onChange={(e) => setQ({ ...q, text: e.target.value })} />
          {(q.type === 'single_choice' || q.type === 'multiple_choice') && (
            <textarea className="input" placeholder={'Una opción por línea: texto | puntos | dimensión\nEj.: Cantar | 3 | ARTE'}
              value={q.options} onChange={(e) => setQ({ ...q, options: e.target.value })} />
          )}
          {q.type === 'scale' && (
            <label className="flex items-center gap-2">Escala 1 a
              <input className="input !w-20" type="number" min={2} max={10} value={q.scaleMax} onChange={(e) => setQ({ ...q, scaleMax: Number(e.target.value) })} />
            </label>
          )}
          <button className="btn-primary !py-2" disabled={pending || !q.sectionId || !q.text.trim()}
            onClick={() => run(async () => {
              const options = q.options.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
                const [text, score, dimension] = l.split('|').map((x) => x.trim());
                return { text, score: Number(score) || 0, dimension: dimension || undefined };
              });
              const sec = q.sectionId;
              const r = await addQuestion(sec, {
                question_type: q.type, text: q.text, required: true, position: 99,
                scale_min: q.type === 'scale' ? 1 : undefined, scale_max: q.type === 'scale' ? q.scaleMax : undefined,
                options: options.length ? options : undefined,
              });
              setQ({ sectionId: sec, type: q.type, text: '', options: '', scaleMax: q.scaleMax });
              return r;
            })}>Agregar pregunta</button>
        </div>
      )}
    </div>
  );
}
