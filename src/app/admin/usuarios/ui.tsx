'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { setRole, setAccountStatus } from '@/lib/actions/admin';
import { Alert } from '@/components/ui/Alert';

const ROLE_LABEL: Record<string, string> = {
  participant: 'Participante', coordinator: 'Coordinador', admin: 'Administrador', superadmin: 'Superadmin',
};
function topRole(roles: { role: string }[]): string {
  const order = ['superadmin', 'admin', 'coordinator', 'participant'];
  for (const r of order) if (roles.some((x) => x.role === r)) return r;
  return 'participant';
}

export function UsersTable({ users, canSetRoles }: { users: any[]; canSetRoles: boolean }) {
  const [msg, setMsg] = useState<{ error?: string; success?: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-3">
      {msg?.error && <Alert kind="error">{msg.error}</Alert>}
      {msg?.success && <Alert kind="success">{msg.success}</Alert>}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-gray-500 border-b">
            <th className="py-2">Nombre</th><th>Correo</th><th>Rol</th><th>Cuenta</th><th></th></tr></thead>
          <tbody className="divide-y">
            {users.map((u) => (
              <tr key={u.id}>
                <td className="py-2 font-medium">{u.first_name} {u.last_name}</td>
                <td>{u.email}</td>
                <td>
                  {canSetRoles ? (
                    <select className="input !py-1.5 !px-2 text-sm" defaultValue={topRole(u.user_roles ?? [])} disabled={pending}
                      onChange={(e) => start(async () => setMsg(await setRole(u.id, e.target.value)))}>
                      {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
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
                <td><Link className="text-brand-600 underline" href={`/admin/participantes/${u.id}`}>Ficha</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
