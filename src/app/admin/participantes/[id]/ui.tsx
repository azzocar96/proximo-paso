'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { overrideRequirement, suggestAssignment, setActiveMember } from '@/lib/actions/admin';
import { Alert } from '@/components/ui/Alert';
import { fmtDate } from '@/lib/utils';

export function ActiveMemberToggle({ userId, active, since, approvedByName }: {
  userId: string; active: boolean; since: string | null; approvedByName: string | null;
}) {
  const [msg, setMsg] = useState<{ error?: string; success?: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <section className="card space-y-2 text-sm">
      <h2 className="font-bold">Miembro activo</h2>
      {msg?.error && <Alert kind="error">{msg.error}</Alert>}
      {msg?.success && <Alert kind="success">{msg.success}</Alert>}
      <p>
        Estado actual: {active ? <span className="badge bg-green-100 text-green-800">Miembro activo</span> : <span className="badge bg-gray-100 text-gray-500">No es miembro activo</span>}
      </p>
      {active && since && (
        <p className="text-xs text-gray-500">
          Desde: {fmtDate(since)}{approvedByName ? ` · Aprobado por: ${approvedByName}` : ' · Automático (completó el curso)'}
        </p>
      )}
      <p className="text-xs text-gray-500">
        Un miembro activo ya no ve el curso desde cero y accede de una vez al muro general de la comunidad.
        Se otorga automáticamente al aprobar el certificado, o manualmente aquí.
      </p>
      <button className={active ? 'btn-secondary !py-2' : 'btn-primary !py-2'} disabled={pending}
        onClick={() => start(async () => { setMsg(await setActiveMember(userId, !active)); router.refresh(); })}>
        {active ? 'Quitar miembro activo' : 'Marcar como miembro activo'}
      </button>
    </section>
  );
}

export function OverridePanel({ enrollmentId }: { enrollmentId: string }) {
  const [msg, setMsg] = useState<{ error?: string; success?: string } | null>(null);
  const [reason, setReason] = useState('');
  const [kind, setKind] = useState<'test' | 'dream_team'>('test');
  const [pending, start] = useTransition();
  return (
    <section className="card space-y-3 border-amber-200 bg-amber-50">
      <h2 className="font-bold text-sm">Excepción administrativa</h2>
      <p className="text-xs text-gray-600">Marca el test o el Dream Team como completados sin que el participante los haya hecho. Requiere motivo y queda registrado en auditoría.</p>
      {msg?.error && <Alert kind="error">{msg.error}</Alert>}
      {msg?.success && <Alert kind="success">{msg.success}</Alert>}
      <div className="flex flex-wrap gap-2">
        <select className="input !w-auto !py-2" value={kind} onChange={(e) => setKind(e.target.value as any)}>
          <option value="test">Test de personalidad</option>
          <option value="dream_team">Formulario Dream Team</option>
        </select>
        <input className="input flex-1 min-w-40" placeholder="Motivo (obligatorio)" value={reason} onChange={(e) => setReason(e.target.value)} />
        <button className="btn-secondary !py-2" disabled={pending || reason.trim().length < 5}
          onClick={() => start(async () => setMsg(await overrideRequirement(enrollmentId, kind, reason)))}>
          Aplicar excepción
        </button>
      </div>
    </section>
  );
}

export function SuggestPanel({ userId, ministries }: { userId: string; ministries: { id: string; name: string }[] }) {
  const [msg, setMsg] = useState<{ error?: string; success?: string } | null>(null);
  const [mid, setMid] = useState('');
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2 pt-2 border-t">
      {msg?.error && <Alert kind="error">{msg.error}</Alert>}
      {msg?.success && <Alert kind="success">{msg.success}</Alert>}
      <div className="flex gap-2">
        <select className="input" value={mid} onChange={(e) => setMid(e.target.value)}>
          <option value="">— Sugerir ministerio —</option>
          {ministries.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <button className="btn-secondary !py-2 shrink-0" disabled={pending || !mid}
          onClick={() => start(async () => setMsg(await suggestAssignment(mid, userId)))}>Sugerir</button>
      </div>
      <p className="text-xs text-gray-500">La sugerencia nunca es automática por el test: siempre la decide una persona.</p>
    </div>
  );
}
