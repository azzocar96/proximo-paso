'use client';
import { useState, useTransition } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import { saveSession, assignCoordinator, cancelAndRescheduleSession } from '@/lib/actions/admin';
import { Alert } from '@/components/ui/Alert';
import { fmtDate } from '@/lib/utils';

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return <button className="btn-primary !py-2" disabled={pending}>{pending ? 'Guardando…' : label}</button>;
}

export function SessionForm({ session }: { session: any }) {
  const action = saveSession.bind(null, session.id);
  const [state, formAction] = useFormState(action, null);
  return (
    <form action={formAction} className="space-y-3">
      {state?.error && <Alert kind="error">{state.error}</Alert>}
      {state?.success && <Alert kind="success">{state.success}</Alert>}
      <div className="grid md:grid-cols-2 gap-3">
        <div><label className="label">Nombre</label><input className="input" name="name" defaultValue={session.name} required /></div>
        <div><label className="label">Fecha (elegida manualmente)</label><input className="input" type="date" name="session_date" defaultValue={session.session_date ?? ''} /></div>
      </div>
      <div><label className="label">Descripción</label><textarea className="input" name="description" defaultValue={session.description ?? ''} /></div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div><label className="label">Hora inicio</label><input className="input" type="time" name="start_time" defaultValue={session.start_time ?? ''} /></div>
        <div><label className="label">Hora fin</label><input className="input" type="time" name="end_time" defaultValue={session.end_time ?? ''} /></div>
        <div><label className="label">Radio (m)</label><input className="input" type="number" name="allowed_radius_meters" defaultValue={session.allowed_radius_meters ?? ''} placeholder="hereda del ciclo" /></div>
        <div><label className="label">Precisión mín. (m)</label><input className="input" type="number" name="min_accuracy_meters" defaultValue={session.min_accuracy_meters ?? 100} /></div>
      </div>
      <div className="grid md:grid-cols-3 gap-3">
        <div><label className="label">Lugar</label><input className="input" name="location_name" defaultValue={session.location_name ?? ''} placeholder="hereda del ciclo" /></div>
        <div><label className="label">Latitud</label><input className="input" type="number" step="any" name="latitude" defaultValue={session.latitude ?? ''} /></div>
        <div><label className="label">Longitud</label><input className="input" type="number" step="any" name="longitude" defaultValue={session.longitude ?? ''} /></div>
      </div>
      <Submit label="Guardar sesión" />
    </form>
  );
}

export function RescheduleForm({ session }: { session: any }) {
  const [mode, setMode] = useState<'same_week' | 'next_week'>('same_week');
  const [newDate, setNewDate] = useState(session.session_date ?? '');
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState<{ error?: string; success?: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const canSubmit = reason.trim().length >= 5 && (mode === 'next_week' || !!newDate);
  return (
    <div className="space-y-2 border-t pt-3 mt-3">
      <p className="text-xs font-semibold text-gray-600">Cancelar / reprogramar esta clase</p>
      {msg?.error && <Alert kind="error">{msg.error}</Alert>}
      {msg?.success && <Alert kind="success">{msg.success}</Alert>}
      <div className="grid md:grid-cols-2 gap-3 text-sm">
        <div>
          <label className="label">Modo</label>
          <select className="input" value={mode} onChange={(e) => setMode(e.target.value as any)}>
            <option value="same_week">Mover dentro de la misma semana (elegir nueva fecha)</option>
            <option value="next_week">Correr todo el ciclo restante una semana</option>
          </select>
        </div>
        {mode === 'same_week' && (
          <div><label className="label">Nueva fecha</label>
            <input className="input" type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} /></div>
        )}
      </div>
      <div><label className="label">Motivo (obligatorio)</label>
        <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej: lluvia, feriado, emergencia…" /></div>
      <button className="btn-secondary !py-2 text-sm" disabled={pending || !canSubmit}
        onClick={() => start(async () => {
          const res = await cancelAndRescheduleSession(session.id, mode, mode === 'same_week' ? newDate : null, reason);
          setMsg(res);
          if (res?.success) { setReason(''); router.refresh(); }
        })}>
        {mode === 'same_week' ? 'Reprogramar esta clase' : 'Correr ciclo una semana'}
      </button>
      {mode === 'next_week' && (
        <p className="text-xs text-amber-700">⚠️ Esto mueve esta sesión y todas las siguientes del ciclo +7 días, y la fecha de certificación si está definida.</p>
      )}
    </div>
  );
}

export function CoordinatorForm({ cycleId }: { cycleId: string }) {
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState<{ error?: string; success?: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2">
      {msg?.error && <Alert kind="error">{msg.error}</Alert>}
      {msg?.success && <Alert kind="success">{msg.success}</Alert>}
      <div className="flex gap-2">
        <input className="input" placeholder="correo del coordinador" value={email} onChange={(e) => setEmail(e.target.value)} />
        <button className="btn-secondary !py-2 shrink-0" disabled={pending || !email}
          onClick={() => start(async () => setMsg(await assignCoordinator(cycleId, email)))}>Asignar</button>
      </div>
    </div>
  );
}

export function SuggestDateNote({ suggested, current }: { suggested: string; current: string | null }) {
  if (!suggested || suggested === current) return null;
  return (
    <p className="text-sm bg-brand-50 rounded-xl p-3 text-brand-800">
      💡 Sugerencia de fecha de certificación: <b>{fmtDate(suggested)}</b>
      {' '}(5º domingo del mes de la última clase, o 1º domingo del mes siguiente).
      Confírmala editando el campo del ciclo abajo — nunca se aplica sola.
    </p>
  );
}
