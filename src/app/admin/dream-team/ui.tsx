'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toggleDreamTeamQuestion, addDreamTeamQuestion } from '@/lib/actions/admin';
import { Alert } from '@/components/ui/Alert';

export function DreamTeamAdmin({ questions }: { questions: any[] }) {
  const [msg, setMsg] = useState<{ error?: string; success?: string } | null>(null);
  const [pending, start] = useTransition();
  const [nq, setNq] = useState({ text: '', type: 'short_text', options: '', required: false });
  const router = useRouter();
  const run = (fn: () => Promise<any>) => start(async () => { setMsg(await fn()); router.refresh(); });
  return (
    <section className="card space-y-3">
      <h2 className="font-bold">Preguntas adicionales configurables</h2>
      <p className="text-xs text-gray-500">Los campos base (intereses, talentos, disponibilidad, ministerios, consentimiento) siempre están. Aquí agregas o desactivas preguntas extra.</p>
      {msg?.error && <Alert kind="error">{msg.error}</Alert>}
      {msg?.success && <Alert kind="success">{msg.success}</Alert>}
      <ul className="divide-y text-sm">
        {questions.map((q) => (
          <li key={q.id} className="py-2 flex justify-between items-center gap-3">
            <span className={q.is_active ? '' : 'text-gray-400 line-through'}>{q.text}</span>
            <button className="text-sm underline shrink-0" disabled={pending}
              onClick={() => run(() => toggleDreamTeamQuestion(q.id, !q.is_active))}>
              {q.is_active ? 'Desactivar' : 'Activar'}
            </button>
          </li>
        ))}
      </ul>
      <div className="grid md:grid-cols-2 gap-2">
        <input className="input" placeholder="Texto de la nueva pregunta" value={nq.text} onChange={(e) => setNq({ ...nq, text: e.target.value })} />
        <select className="input" value={nq.type} onChange={(e) => setNq({ ...nq, type: e.target.value })}>
          <option value="short_text">Texto corto</option>
          <option value="long_text">Texto largo</option>
          <option value="single_choice">Selección única</option>
          <option value="multiple_choice">Selección múltiple</option>
        </select>
      </div>
      {(nq.type === 'single_choice' || nq.type === 'multiple_choice') && (
        <input className="input" placeholder="Opciones separadas por coma" value={nq.options} onChange={(e) => setNq({ ...nq, options: e.target.value })} />
      )}
      <button className="btn-secondary !py-2" disabled={pending || nq.text.trim().length < 5}
        onClick={() => run(async () => { const r = await addDreamTeamQuestion(nq.text, nq.type, nq.options, nq.required); setNq({ text: '', type: nq.type, options: '', required: false }); return r; })}>
        + Agregar pregunta
      </button>
    </section>
  );
}
