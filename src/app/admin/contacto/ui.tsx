'use client';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setContactStatus } from '@/lib/actions/admin';
import { fmtDate } from '@/lib/utils';

const ST: Record<string, string> = { new: 'Nuevo', in_progress: 'En proceso', resolved: 'Resuelto', closed: 'Cerrado' };
export function ContactAdmin({ reqs }: { reqs: any[] }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="space-y-3">
      {reqs.map((r) => (
        <div key={r.id} className="card space-y-2">
          <div className="flex justify-between items-start gap-3">
            <div>
              <p className="font-semibold">{r.name} <span className="text-xs text-gray-400">· {r.email} · {r.category}</span></p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{r.message}</p>
              <p className="text-xs text-gray-400">{fmtDate(r.created_at)}</p>
            </div>
            <select className="input !w-auto !py-1.5 text-sm shrink-0" defaultValue={r.status} disabled={pending}
              onChange={(e) => start(async () => { await setContactStatus(r.id, e.target.value); router.refresh(); })}>
              {Object.entries(ST).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>
      ))}
      {reqs.length === 0 && <p className="card text-sm text-gray-500">Sin mensajes.</p>}
    </div>
  );
}
