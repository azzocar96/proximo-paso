'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { manualAttendance, removeAttendance } from '@/lib/actions/admin';
import { Alert } from '@/components/ui/Alert';
import { fmtDate } from '@/lib/utils';

export function AttendancePanel({ sessions, selectedId, records, enrolled }: {
  sessions: any[]; selectedId: string | null; records: any[]; enrolled: any[];
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ error?: string; success?: string } | null>(null);
  const [pending, start] = useTransition();
  const [reason, setReason] = useState('');
  const [method, setMethod] = useState('manual_admin');
  const [userToAdd, setUserToAdd] = useState('');
  const attendedIds = new Set(records.map((r) => r.user_id));
  const absent = enrolled.filter((e) => !attendedIds.has(e.user_id));

  return (
    <div className="space-y-4">
      <select className="input md:max-w-md" value={selectedId ?? ''} onChange={(e) => router.push(`/admin/asistencia?sesion=${e.target.value}`)}>
        {sessions.map((s) => (
          <option key={s.id} value={s.id}>
            {s.course_cycles?.name} · Paso {s.step_number} {s.session_date ? `(${fmtDate(s.session_date)})` : ''}
          </option>
        ))}
      </select>
      {msg?.error && <Alert kind="error">{msg.error}</Alert>}
      {msg?.success && <Alert kind="success">{msg.success}</Alert>}

      <div className="grid md:grid-cols-2 gap-4">
        <section className="card">
          <h2 className="font-bold mb-2">Asistieron ({records.length})</h2>
          <ul className="divide-y text-sm max-h-96 overflow-auto">
            {records.map((r) => (
              <li key={r.id} className="py-2">
                <div className="flex justify-between">
                  <span>{r.profiles?.first_name} {r.profiles?.last_name}</span>
                  <button className="text-red-600 underline text-xs" disabled={pending} onClick={() => {
                    const motivo = prompt('Motivo para eliminar esta asistencia (obligatorio, queda en auditoría):');
                    if (!motivo) return;
                    start(async () => { setMsg(await removeAttendance(selectedId!, r.user_id, motivo)); router.refresh(); });
                  }}>Eliminar</button>
                </div>
                <p className="text-xs text-gray-400">
                  {r.method === 'qr_geolocation' ? `QR · ${r.distance_meters ?? '?'} m (±${r.accuracy_meters ?? '?'} m)` : `Manual (${r.method})${r.manual_reason ? `: ${r.manual_reason}` : ''}`}
                </p>
              </li>
            ))}
            {records.length === 0 && <li className="py-2 text-gray-500">Sin registros.</li>}
          </ul>
        </section>

        <section className="card space-y-3">
          <h2 className="font-bold">Registrar manualmente</h2>
          <p className="text-xs text-gray-500">Ausentes de esta sesión: {absent.length}. Toda asistencia manual requiere motivo y queda en auditoría.</p>
          <select className="input" value={userToAdd} onChange={(e) => setUserToAdd(e.target.value)}>
            <option value="">— Elegir participante ausente —</option>
            {absent.map((e) => (
              <option key={e.user_id} value={e.user_id}>{e.profiles?.first_name} {e.profiles?.last_name} · {e.profiles?.email}</option>
            ))}
          </select>
          <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="manual_admin">Manual (admin/coordinador)</option>
            <option value="makeup">Recuperación (makeup)</option>
            <option value="imported">Importada</option>
          </select>
          <input className="input" placeholder="Motivo (obligatorio)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <button className="btn-primary w-full" disabled={pending || !userToAdd || reason.trim().length < 5}
            onClick={() => start(async () => {
              setMsg(await manualAttendance(selectedId!, userToAdd, reason, method));
              setReason(''); setUserToAdd(''); router.refresh();
            })}>
            {pending ? 'Guardando…' : 'Registrar asistencia'}
          </button>
        </section>
      </div>
    </div>
  );
}
