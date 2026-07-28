'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { approveCertificate, revokeCertificate, setCertificateStatus, saveSetting } from '@/lib/actions/admin';
import { Alert } from '@/components/ui/Alert';
import { CERT_LABEL, fmtDate } from '@/lib/utils';
import { StatusBadge } from '@/components/ui/StatusBadge';

export function AutoApproveToggle({ current }: { current: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <label className="card flex items-center gap-3 text-sm cursor-pointer">
      <input type="checkbox" className="w-5 h-5" defaultChecked={current} disabled={pending}
        onChange={(e) => start(async () => { await saveSetting('certificate_auto_approve', e.target.checked); router.refresh(); })} />
      <span>Poner los certificados directamente en «pendiente de aprobación» al cumplir requisitos (aprobación semiautomática). La emisión final siempre la confirma un administrador.</span>
    </label>
  );
}

export function CertTable({ certs }: { certs: any[] }) {
  const [msg, setMsg] = useState<{ error?: string; success?: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = (fn: () => Promise<any>) => start(async () => { setMsg(await fn()); router.refresh(); });
  const issuable = certs.filter((c) => ['eligible', 'pending_approval'].includes(c.status));
  return (
    <div className="space-y-3">
      {msg?.error && <Alert kind="error">{msg.error}</Alert>}
      {msg?.success && <Alert kind="success">{msg.success}</Alert>}
      {issuable.length > 1 && (
        <button className="btn-primary !py-2" disabled={pending}
          onClick={() => run(async () => {
            for (const c of issuable) await approveCertificate(c.id);
            return { success: `${issuable.length} certificados aprobados.` };
          })}>Aprobar todos los pendientes ({issuable.length})</button>
      )}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-gray-500 border-b">
            <th className="py-2">Participante</th><th>Ciclo</th><th>Fecha</th><th>Estado</th><th>Acciones</th></tr></thead>
          <tbody className="divide-y">
            {certs.map((c) => (
              <tr key={c.id}>
                <td className="py-2">{c.full_name}<br /><span className="text-xs text-gray-400">{c.profiles?.email}</span></td>
                <td className="text-xs">{c.enrollments?.course_cycles?.name}</td>
                <td className="text-xs">{fmtDate(c.completion_date)}</td>
                <td><StatusBadge status={c.status} label={CERT_LABEL[c.status]} /></td>
                <td className="space-x-2 whitespace-nowrap">
                  {['eligible', 'pending_approval'].includes(c.status) && (
                    <button className="text-green-700 underline" disabled={pending} onClick={() => run(() => approveCertificate(c.id))}>Aprobar</button>
                  )}
                  {['issued', 'physical_pending', 'ready_for_pickup', 'delivered'].includes(c.status) && (
                    <a className="text-brand-600 underline" href={`/api/certificados/${c.id}/pdf`}>PDF</a>
                  )}
                  {c.status === 'issued' && <button className="underline" disabled={pending} onClick={() => run(() => setCertificateStatus(c.id, 'physical_pending'))}>Físico pendiente</button>}
                  {c.status === 'physical_pending' && <button className="underline" disabled={pending} onClick={() => run(() => setCertificateStatus(c.id, 'ready_for_pickup'))}>Listo p/ retirar</button>}
                  {c.status === 'ready_for_pickup' && <button className="underline" disabled={pending} onClick={() => run(() => setCertificateStatus(c.id, 'delivered'))}>Entregado</button>}
                  {!['revoked'].includes(c.status) && (
                    <button className="text-red-600 underline" disabled={pending} onClick={() => {
                      const motivo = prompt('Motivo de revocación (obligatorio):');
                      if (motivo) run(() => revokeCertificate(c.id, motivo));
                    }}>Revocar</button>
                  )}
                </td>
              </tr>
            ))}
            {certs.length === 0 && <tr><td colSpan={5} className="py-3 text-gray-500">No hay certificados todavía.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
