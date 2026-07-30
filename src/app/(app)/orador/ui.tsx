'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { approveAttendanceRequest, rejectAttendanceRequest } from '@/lib/actions/admin';
import { Alert } from '@/components/ui/Alert';
import { fmtDate } from '@/lib/utils';

export function SpeakerRequests({ requests }: { requests: any[] }) {
  const [msg, setMsg] = useState<{ error?: string; success?: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <section className="card space-y-2 border-blue-200 bg-blue-50">
      <h2 className="font-bold">Solicitudes de confirmación pendientes ({requests.length})</h2>
      {msg?.error && <Alert kind="error">{msg.error}</Alert>}
      {msg?.success && <Alert kind="success">{msg.success}</Alert>}
      <ul className="divide-y text-sm">
        {requests.map((r) => (
          <li key={r.id} className="py-2 space-y-1">
            <div className="flex justify-between flex-wrap gap-1">
              <span className="font-medium">{r.profiles?.first_name} {r.profiles?.last_name}</span>
              <span className="text-xs text-gray-500">
                {r.course_sessions?.course_cycles?.name} · Paso {r.course_sessions?.step_number}
                {r.course_sessions?.session_date ? ` (${fmtDate(r.course_sessions.session_date)})` : ''}
              </span>
            </div>
            {r.request_note && <p className="text-gray-600 italic">"{r.request_note}"</p>}
            <div className="flex gap-3">
              <button className="btn-primary !py-1 !px-3 text-xs" disabled={pending}
                onClick={() => start(async () => { setMsg(await approveAttendanceRequest(r.id)); router.refresh(); })}>
                Aprobar
              </button>
              <button className="text-red-600 underline text-xs" disabled={pending} onClick={() => {
                const motivo = prompt('Motivo para rechazar (obligatorio, queda en auditoría):');
                if (!motivo) return;
                start(async () => { setMsg(await rejectAttendanceRequest(r.id, motivo)); router.refresh(); });
              }}>
                Rechazar
              </button>
            </div>
          </li>
        ))}
        {requests.length === 0 && <li className="py-2 text-gray-500">No hay solicitudes pendientes de tu paso. 🎉</li>}
      </ul>
    </section>
  );
}
