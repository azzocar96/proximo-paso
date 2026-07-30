'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { setRole, setAccountStatus } from '@/lib/actions/admin';
import { acceptMemberRequest, rejectMemberRequest } from '@/lib/actions/ministry';
import { grantWallPublisher } from '@/lib/actions/wall';
import { useRouter } from 'next/navigation';
import { Alert } from '@/components/ui/Alert';

// Nota (Fase 3a): "admin" quedó inerte (sin permisos) — se conserva la
// etiqueta solo para cuentas legacy que aún tengan ese rol en la base.
const ROLE_LABEL: Record<string, string> = {
  participant: 'Participante', coordinator: 'Coordinador', admin: 'Administrador (antiguo, sin acceso)',
  superadmin: 'Administrador', pastor: 'Pastor',
};
function topRole(roles: { role: string }[]): string {
  const order = ['superadmin', 'pastor', 'admin', 'coordinator', 'participant'];
  for (const r of order) if (roles.some((x) => x.role === r)) return r;
  return 'participant';
}

export function UsersTable({ users, canSetRoles, publishers = [] }: { users: any[]; canSetRoles: boolean; publishers?: string[] }) {
  const [msg, setMsg] = useState<{ error?: string; success?: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="space-y-3">
      {msg?.error && <Alert kind="error">{msg.error}</Alert>}
      {msg?.success && <Alert kind="success">{msg.success}</Alert>}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-gray-500 border-b">
            <th className="py-2">Nombre</th><th>Correo</th><th>Rol</th><th>Cuenta</th>{canSetRoles && <th title="Permiso puntual para publicar en el muro general">Muro</th>}<th></th></tr></thead>
          <tbody className="divide-y">
            {users.map((u) => (
              <tr key={u.id}>
                <td className="py-2 font-medium">{u.first_name} {u.last_name}</td>
                <td>{u.email}</td>
                <td>
                  {canSetRoles ? (
                    <select className="input !py-1.5 !px-2 text-sm" defaultValue={topRole(u.user_roles ?? [])} disabled={pending}
                      onChange={(e) => start(async () => setMsg(await setRole(u.id, e.target.value)))}>
                      {Object.entries(ROLE_LABEL).filter(([k]) => k !== 'admin').map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      {topRole(u.user_roles ?? []) === 'admin' && <option value="admin">{ROLE_LABEL.admin}</option>}
                    </select>
                  ) : ROLE_LABEL[topRole(u.user_roles ?? [])]}
                </td>
                <td>
                  <button className={`badge ${u.account_status === 'active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-700'}`}
                    disabled={pending}
                    onClick={() => start(async () => setMsg(await setAccountStatus(u.id, u.account_status === 'active' ? 'suspended' : 'active')))}>
                    {u.account_status === 'active' ? 'Activa' : 'Suspendida'}
                  </button>
                </td>
                {canSetRoles && (
                  <td>
                    {/* Fase 3c: autorización puntual para publicar en el muro general */}
                    <button className={`badge ${publishers.includes(u.id) ? 'bg-brand-50 text-brand-700' : 'bg-gray-100 text-gray-500'}`}
                      title={publishers.includes(u.id) ? 'Puede publicar en el muro general (clic para quitar)' : 'No publica en el muro general (clic para autorizar)'}
                      disabled={pending}
                      onClick={() => start(async () => { setMsg(await grantWallPublisher(u.id, !publishers.includes(u.id))); router.refresh(); })}>
                      {publishers.includes(u.id) ? 'Publica' : 'No publica'}
                    </button>
                  </td>
                )}
                <td><Link className="text-brand-600 underline" href={`/admin/participantes/${u.id}`}>Ficha</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Solicitudes de cambio de rol (Fase 3b): llegan SOLO al administrador/pastor.
 * Aceptarla no cambia el rol automáticamente: el admin lo aplica en la tabla
 * de arriba (dropdown de rol) y aquí deja la solicitud resuelta y auditada. */
export function RoleChangeRequests({ requests }: { requests: any[] }) {
  const [msg, setMsg] = useState<{ error?: string; success?: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <section className="card space-y-2 border-blue-200 bg-blue-50">
      <h2 className="font-bold text-sm">Solicitudes de cambio de rol ({requests.length})</h2>
      <p className="text-xs text-gray-500">
        Al aceptar, aplica tú el rol nuevo con el selector de la tabla de abajo; la solicitud queda resuelta y auditada.
      </p>
      {msg?.error && <Alert kind="error">{msg.error}</Alert>}
      {msg?.success && <Alert kind="success">{msg.success}</Alert>}
      <ul className="divide-y divide-blue-100 text-sm">
        {requests.map((r) => (
          <li key={r.id} className="py-2 space-y-1">
            <div className="flex justify-between flex-wrap gap-1">
              <span className="font-medium">{r.profiles?.first_name} {r.profiles?.last_name} <span className="text-xs text-gray-400">{r.profiles?.email}</span></span>
              <span className="text-xs text-gray-500">{r.since}</span>
            </div>
            {r.details && <p className="text-gray-600 italic">"{r.details}"</p>}
            <div className="flex gap-3">
              <button className="btn-primary !py-1 !px-3 text-xs" disabled={pending}
                onClick={() => start(async () => { setMsg(await acceptMemberRequest(r.id)); router.refresh(); })}>
                Aceptar
              </button>
              <button className="text-red-600 underline text-xs" disabled={pending} onClick={() => {
                const motivo = prompt('Motivo del rechazo (obligatorio, la persona podrá verlo):');
                if (!motivo) return;
                start(async () => { setMsg(await rejectMemberRequest(r.id, motivo)); router.refresh(); });
              }}>
                Rechazar
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
