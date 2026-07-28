'use client';
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { startAttempt, saveAnswer, completeAttempt, declareExternalDone } from '@/lib/actions/assessment';
import { Alert } from '@/components/ui/Alert';

type Option = { id: string; text: string; position: number };
type Question = { id: string; question_type: string; text: string; required: boolean; position: number; scale_min: number | null; scale_max: number | null; assessment_options: Option[] };
type Section = { id: string; title: string; position: number; assessment_questions: Question[] };
type Assessment = { id: string; title: string; assessment_sections: Section[] };

export function TestRunner({ assessment }: { assessment: Assessment }) {
  const questions = useMemo(() => {
    const sections = [...assessment.assessment_sections].sort((a, b) => a.position - b.position);
    return sections.flatMap((s) => [...s.assessment_questions].sort((a, b) => a.position - b.position).map((q) => ({ ...q, section: s.title })));
  }, [assessment]);

  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  if (!attemptId) {
    return (
      <div className="card text-center space-y-3">
        {error && <Alert kind="error">{error}</Alert>}
        <p className="text-sm text-gray-600">{questions.length} preguntas · tus respuestas se guardan a medida que avanzas.</p>
        <button className="btn-primary w-full" disabled={pending} onClick={() => start(async () => {
          const r = await startAttempt(assessment.id);
          if (r.error) setError(r.error); else setAttemptId(r.attemptId!);
        })}>Comenzar el test</button>
      </div>
    );
  }

  const q = questions[idx];
  const a = answers[q.id];
  const answered = q.question_type === 'multiple_choice' ? (a?.option_ids?.length > 0)
    : q.question_type === 'single_choice' ? !!a?.option_ids?.length
    : q.question_type === 'scale' ? a?.scale_value != null
    : !!a?.text_value?.trim();
  const canNext = !q.required || answered;

  async function persist() {
    if (answers[q.id]) await saveAnswer(attemptId!, q.id, answers[q.id]);
  }

  return (
    <div className="card space-y-4">
      <div className="flex justify-between text-xs text-gray-500">
        <span>{(q as any).section}</span><span>{idx + 1} / {questions.length}</span>
      </div>
      <div className="h-2 rounded-full bg-gray-100"><div className="h-full bg-brand-600 rounded-full" style={{ width: `${((idx + 1) / questions.length) * 100}%` }} /></div>
      <p className="font-semibold text-lg">{q.text}{q.required && ' *'}</p>
      {error && <Alert kind="error">{error}</Alert>}

      {(q.question_type === 'single_choice' || q.question_type === 'multiple_choice') && (
        <div className="grid gap-2">
          {[...q.assessment_options].sort((x, y) => x.position - y.position).map((o) => {
            const sel: string[] = a?.option_ids ?? [];
            const on = sel.includes(o.id);
            return (
              <button key={o.id} type="button"
                className={`rounded-xl border-2 px-4 py-3 text-left font-medium ${on ? 'border-brand-600 bg-brand-50' : 'border-gray-200 hover:border-brand-600'}`}
                onClick={() => {
                  const next = q.question_type === 'single_choice' ? [o.id] : on ? sel.filter((x) => x !== o.id) : [...sel, o.id];
                  setAnswers((prev) => ({ ...prev, [q.id]: { option_ids: next } }));
                }}>
                {on ? '☑' : '☐'} {o.text}
              </button>
            );
          })}
        </div>
      )}

      {q.question_type === 'scale' && (
        <div className="flex gap-2 justify-center flex-wrap">
          {Array.from({ length: (q.scale_max ?? 5) - (q.scale_min ?? 1) + 1 }, (_, i) => (q.scale_min ?? 1) + i).map((v) => (
            <button key={v} type="button"
              className={`w-12 h-12 rounded-full border-2 font-bold ${a?.scale_value === v ? 'border-brand-600 bg-brand-600 text-white' : 'border-gray-300 hover:border-brand-600'}`}
              onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: { scale_value: v } }))}>{v}</button>
          ))}
        </div>
      )}

      {(q.question_type === 'short_text' || q.question_type === 'long_text') && (
        q.question_type === 'short_text'
          ? <input className="input" value={a?.text_value ?? ''} onChange={(e) => setAnswers((p) => ({ ...p, [q.id]: { text_value: e.target.value } }))} />
          : <textarea className="input min-h-28" value={a?.text_value ?? ''} onChange={(e) => setAnswers((p) => ({ ...p, [q.id]: { text_value: e.target.value } }))} />
      )}

      <div className="flex gap-2">
        {idx > 0 && <button className="btn-secondary flex-1" disabled={pending} onClick={() => start(async () => { await persist(); setIdx(idx - 1); })}>Anterior</button>}
        {idx < questions.length - 1
          ? <button className="btn-primary flex-1" disabled={!canNext || pending} onClick={() => start(async () => { await persist(); setIdx(idx + 1); })}>Siguiente</button>
          : <button className="btn-primary flex-1" disabled={!canNext || pending} onClick={() => start(async () => {
              await persist();
              const r = await completeAttempt(attemptId!);
              if (r?.error) setError(r.error); else router.refresh();
            })}>{pending ? 'Enviando…' : 'Finalizar test'}</button>}
      </div>
    </div>
  );
}

export function ExternalTest({ url, assessmentId }: { url: string; assessmentId: string }) {
  const [msg, setMsg] = useState<{ error?: string; success?: string } | null>(null);
  const [result, setResult] = useState('');
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold">Test de personalidad</h1>
      <div className="card space-y-4">
        <p className="text-gray-700 text-sm">La iglesia configuró el test en una plataforma externa. Complétalo y luego vuelve aquí para marcarlo como terminado.</p>
        {url
          ? <a href={url} target="_blank" rel="noopener noreferrer" className="btn-primary w-full">Abrir el test externo ↗</a>
          : <Alert kind="warn">El enlace del test externo aún no está configurado. Avisa a la iglesia.</Alert>}
        {msg?.error && <Alert kind="error">{msg.error}</Alert>}
        {msg?.success && <Alert kind="success">{msg.success}</Alert>}
        {url && !msg?.success && (
          <>
            <div>
              <label className="label">¿Qué resultado obtuviste? (opcional)</label>
              <input className="input" list="resultado-test-opciones" value={result} maxLength={80}
                placeholder="Ej.: D, I, S, C…" onChange={(e) => setResult(e.target.value)} />
              <datalist id="resultado-test-opciones">
                <option value="D" /><option value="I" /><option value="S" /><option value="C" />
              </datalist>
              <p className="text-xs text-gray-500 mt-1">
                Escribe el resultado que te dio el test de la iglesia (puede ser cualquier etiqueta, no solo D/I/S/C).
              </p>
            </div>
            <button className="btn-secondary w-full" disabled={pending} onClick={() => start(async () => {
              const r = await declareExternalDone(assessmentId, result);
              setMsg(r); if (r?.success) router.refresh();
            })}>{pending ? 'Guardando…' : 'Ya completé el test'}</button>
          </>
        )}
      </div>
    </div>
  );
}
