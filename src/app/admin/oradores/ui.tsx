'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { assignStepSpeaker, removeStepSpeaker } from '@/lib/actions/admin';
import { Alert } from '@/components/ui/Alert';

export function SpeakersPanel({ steps, speakers }: { steps: number[]; speakers: any[] }) {
  const [msg, setMsg] = useState<{ error?: string; success?: string } | null>(null);
  const [step, setStep] = useState<number | ''>('');
  const [email, setEmail] = useState('');
  const [bio, setBio] = useState('');
  const [phone, setPhone] = useState('');
  const [pending, start] = useTransition();
  const router = useRouter();
  const byStep = Object.fromEntries(speakers.map((s) => [s.step_number, s]));

  return (
    <div className="space-y-3">
      {msg?.error && <Alert kind="error">{msg.error}</Alert>}
      {msg?.success && <Alert kind="success">{msg.success}</Alert>}
      <div className="card space-y-3 text-sm">
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className="label">Paso</label>
            <select className="input" value={step} onChange={(e) => setStep(e.target.value ? Number(e.target.value) : '')}>
              <option value="">— elige —</option>
              {steps.map((n) => <option key={n} value={n}>Paso {n}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Correo del orador</label>
            <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="correo@ejemplo.com" />
          </div>
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          <div><label className="label">Biografía breve (opcional)</label>
            <input className="input" value={bio} onChange={(e) => setBio(e.target.value)} /></div>
          <div><label className="label">Teléfono de contacto (opcional)</label>
            <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
        </div>
        <button className="btn-primary !py-2" disabled={pending || !step || !email}
          onClick={() => start(async () => {
            const res = await assignStepSpeaker(step as number, email, bio, phone);
            setMsg(res);
            if (res?.success) { setEmail(''); setBio(''); setPhone(''); setStep(''); }
            router.refresh();
          })}>
          Asignar orador
        </button>
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        {steps.map((n) => {
          const s = byStep[n];
          return (
            <div key={n} className="card space-y-1 text-sm">
              <p className="font-semibold">Paso {n}</p>
              {s ? (
                <>
                  <p>{s.profiles?.first_name} {s.profiles?.last_name} <span className="text-xs text-gray-400">{s.profiles?.email}</span></p>
                  {s.bio && <p className="text-xs text-gray-600">{s.bio}</p>}
                  {s.contact_phone && <p className="text-xs text-gray-500">Tel: {s.contact_phone}</p>}
                  <button className="text-red-600 underline text-xs" disabled={pending}
                    onClick={() => start(async () => { setMsg(await removeStepSpeaker(n)); router.refresh(); })}>
                    Quitar
                  </button>
                </>
              ) : <p className="text-gray-500">Sin orador asignado.</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
