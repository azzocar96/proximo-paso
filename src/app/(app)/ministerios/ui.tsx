'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Clock, Send } from 'lucide-react';
import {
  requestMinistryJoin, requestLeave, requestSwitch, requestRoleChange, cancelMemberRequest,
} from '@/lib/actions/ministry';
import { Alert } from '@/components/ui/Alert';

type Ministry = { id: string; name: string };

/** Elegir hasta 3 ministerios EN ORDEN de preferencia (1º, 2º, 3º). */
export function JoinRequestPanel({ ministries }: { ministries: Ministry[] }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [msg, setMsg] = useState<{ error?: string; success?: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const toggle = (id: string) =>
    setPicked((p) => p.includes(id) ? p.filter((x) => x !== id) : p.length < 3 ? [...p, id] : p);
  if (ministries.length === 0) return null;
  return (
    <section className="card space-y-3">
      <div>
        <h2 className="font-bold">Únete a un ministerio</h2>
        <p className="text-xs text-gray-500">
          Elige hasta 3 en orden de preferencia. Tu solicitud les llega a los directores de todos
          los que elijas a la vez, y el primero que te acepte te suma a su equipo.
        </p>
      </div>
      {msg?.error && <Alert kind="error">{msg.error}</Alert>}
      {msg?.success && <Alert kind="success">{msg.success}</Alert>}
      <div className="flex flex-wrap gap-2">
        {ministries.map((m) => {
          const idx = picked.indexOf(m.id);
          return (
            <button key={m.id} type="button" onClick={() => toggle(m.id)}
              className={`rounded-full px-4 py-2 text-sm font-medium border transition-colors inline-flex items-center gap-2 ${
                idx >= 0 ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-gray-300 text-gray-600 hover:border-brand-600'}`}>
              {idx >= 0 && (
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-brand-600 text-white text-[11px] font-bold">
                  {idx + 1}
                </span>
              )}
              {m.name}
            </button>
          );
        })}
      </div>
      <button className="btn-primary !py-2 text-sm" disabled={pending || picked.length === 0}
        onClick={() => start(async () => {
          const res = await requestMinistryJoin(picked);
          setMsg(res);
          if (res?.success) { setPicked([]); router.refresh(); }
        })}>
        <Send className="w-4 h-4" aria-hidden /> Enviar solicitud ({picked.length}/3)
      </button>
    </section>
  );
}

/** Baja / cambio de ministerio / cambio de rol (solo con ministerio asignado). */
export function SelfServicePanel({ currentMinistryId, currentMinistryName, otherMinistries, pendingKinds }: {
  currentMinistryId: string; currentMinistryName: string; otherMinistries: Ministry[]; pendingKinds: string[];
}) {
  const [mode, setMode] = useState<'' | 'leave' | 'switch' | 'role_change'>('');
  const [target, setTarget] = useState('');
  const [details, setDetails] = useState('');
  const [msg, setMsg] = useState<{ error?: string; success?: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const has = (k: string) => pendingKinds.includes(k);
  const submit = () => start(async () => {
    const res = mode === 'leave' ? await requestLeave(currentMinistryId, details)
      : mode === 'switch' ? await requestSwitch(target, details)
      : await requestRoleChange(details);
    setMsg(res);
    if (res?.success) { setMode(''); setTarget(''); setDetails(''); router.refresh(); }
  });
  return (
    <section className="card space-y-3">
      <div>
        <h2 className="font-bold">¿Necesitas un cambio?</h2>
        <p className="text-xs text-gray-500">Tú decides: la solicitud le llega directo a quien corresponde y queda registrada.</p>
      </div>
      {msg?.error && <Alert kind="error">{msg.error}</Alert>}
      {msg?.success && <Alert kind="success">{msg.success}</Alert>}
      <div className="flex flex-wrap gap-2 text-sm">
        <button className={`btn-secondary !py-2 ${mode === 'leave' ? '!border-brand-600 !text-brand-700' : ''}`}
          disabled={has('leave')} onClick={() => setMode(mode === 'leave' ? '' : 'leave')}>
          Solicitar baja de {currentMinistryName}
        </button>
        <button className={`btn-secondary !py-2 ${mode === 'switch' ? '!border-brand-600 !text-brand-700' : ''}`}
          disabled={has('switch') || otherMinistries.length === 0} onClick={() => setMode(mode === 'switch' ? '' : 'switch')}>
          Cambiar de ministerio
        </button>
        <button className={`btn-secondary !py-2 ${mode === 'role_change' ? '!border-brand-600 !text-brand-700' : ''}`}
          disabled={has('role_change')} onClick={() => setMode(mode === 'role_change' ? '' : 'role_change')}>
          Solicitar cambio de rol
        </button>
      </div>
      {mode && (
        <div className="space-y-2 border-t border-gray-100 pt-3">
          {mode === 'switch' && (
            <div>
              <label className="label">Ministerio al que quieres cambiarte</label>
              <select className="input" value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value="">— elige —</option>
                {otherMinistries.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <p className="text-xs text-gray-500 mt-1">La verá el director de ese ministerio. Si te acepta, sales automáticamente de {currentMinistryName}.</p>
            </div>
          )}
          {mode === 'role_change' && (
            <p className="text-xs text-gray-500">Esta solicitud le llega únicamente al administrador general de la iglesia.</p>
          )}
          <div>
            <label className="label">{mode === 'role_change' ? 'Qué rol pides y por qué' : 'Motivo (opcional)'}</label>
            <textarea className="input" rows={2} value={details} onChange={(e) => setDetails(e.target.value)} />
          </div>
          <button className="btn-primary !py-2 text-sm" disabled={pending || (mode === 'switch' && !target)}
            onClick={submit}>
            Enviar solicitud
          </button>
        </div>
      )}
    </section>
  );
}

export function PendingRequestCard({ id, label, detail, since }: { id: string; label: string; detail: string; since: string }) {
  const [msg, setMsg] = useState<{ error?: string; success?: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <section className="card border-amber-200/70 bg-amber-50/50 space-y-1">
      {msg?.error && <Alert kind="error">{msg.error}</Alert>}
      <p className="text-[11px] font-bold text-amber-600 uppercase tracking-widest inline-flex items-center gap-1.5">
        <Clock className="w-3.5 h-3.5" aria-hidden /> Solicitud pendiente · {since}
      </p>
      <p className="font-semibold text-sm">{label}</p>
      {detail && <p className="text-sm text-gray-600">{detail}</p>}
      <button className="text-xs text-red-600 underline" disabled={pending}
        onClick={() => start(async () => { setMsg(await cancelMemberRequest(id)); router.refresh(); })}>
        Cancelar solicitud
      </button>
    </section>
  );
}
