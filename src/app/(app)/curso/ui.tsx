'use client';
import { useState, useTransition } from 'react';
import { enroll, withdraw } from '@/lib/actions/course';
import { Alert } from '@/components/ui/Alert';

export function EnrollButton({ cycleId }: { cycleId: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ error?: string; success?: string } | null>(null);
  return (
    <div className="space-y-2">
      {msg?.error && <Alert kind="error">{msg.error}</Alert>}
      {msg?.success && <Alert kind="success">{msg.success}</Alert>}
      {!msg?.success && (
        <button className="btn-primary w-full" disabled={pending}
          onClick={() => start(async () => setMsg(await enroll(cycleId)))}>
          {pending ? 'Inscribiendo…' : 'Inscribirme en este ciclo'}
        </button>
      )}
    </div>
  );
}

export function WithdrawButton({ enrollmentId }: { enrollmentId: string }) {
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);
  if (!confirm) return <button className="text-sm text-red-600 underline" onClick={() => setConfirm(true)}>Retirarme del ciclo</button>;
  return (
    <div className="flex gap-2 items-center text-sm">
      <span>¿Seguro que deseas retirarte?</span>
      <button className="btn-danger !py-1.5 !px-3 text-sm" disabled={pending}
        onClick={() => start(async () => { await withdraw(enrollmentId); })}>Sí, retirarme</button>
      <button className="underline" onClick={() => setConfirm(false)}>Cancelar</button>
    </div>
  );
}
