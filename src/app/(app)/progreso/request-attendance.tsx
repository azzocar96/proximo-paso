'use client';
import { useState, useTransition } from 'react';
import { requestAttendanceApproval } from '@/lib/actions/course';
import { Alert } from '@/components/ui/Alert';

export function RequestAttendance({ sessionId, label }: { sessionId: string; label: string }) {
  const [open, setOpen] = useState(false);
  const [msg, setMsgText] = useState('');
  const [result, setResult] = useState<{ error?: string; success?: string } | null>(null);
  const [pending, start] = useTransition();

  if (result?.success) return <Alert kind="success">{result.success}</Alert>;

  if (!open) {
    return (
      <button type="button" className="text-xs font-semibold text-brand-700 underline"
        onClick={() => setOpen(true)}>
        ¿Ya asististe a {label} pero no pudiste marcarlo? Pide confirmación
      </button>
    );
  }

  return (
    <div className="space-y-2">
      {result?.error && <Alert kind="error">{result.error}</Alert>}
      <textarea className="input min-h-16 text-sm"
        placeholder="Cuéntanos brevemente qué pasó (ej.: se me olvidó escanear el QR)"
        value={msg} onChange={(e) => setMsgText(e.target.value)} />
      <div className="flex gap-2">
        <button type="button" className="btn-primary !py-2 text-sm" disabled={pending || msg.trim().length < 5}
          onClick={() => start(async () => setResult(await requestAttendanceApproval(sessionId, msg)))}>
          {pending ? 'Enviando…' : 'Enviar solicitud'}
        </button>
        <button type="button" className="btn-secondary !py-2 text-sm" disabled={pending} onClick={() => setOpen(false)}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
