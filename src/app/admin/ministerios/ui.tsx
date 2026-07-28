'use client';
import { useState, useTransition } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import { saveMinistry, setAssignmentStatus, assignMinistryLeader, removeMinistryLeader } from '@/lib/actions/admin';
import { Alert } from '@/components/ui/Alert';
import { MINISTRY_ASSIGN_LABEL } from '@/lib/utils';

function Submit() {
  const { pending } = useFormStatus();
  return <button className="btn-primary !py-2" disabled={pending}>{pending ? 'Guardando…' : 'Guardar'}</button>;
}
export function MinistryForm({ ministry }: { ministry?: any }) {
  const action = saveMinistry.bind(null, ministry?.id ?? null);
  const [state, formAction] = useFormState(action, null);
  return (
    <form action={formAction} className="space-y-3 text-sm">
      {state?.error && <Alert kind="error">{state.error}</Alert>}
      {state?.success && <Alert kind="success">{state.success}</Alert>}
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">Nombre *</label><input className="input" name="name" defaultValue={ministry?.name ?? ''} required /></div>
        <div><label className="label">Estado</label>
          <select className="input" name="status" defaultValue={ministry?.status ?? 'active'}>
            <option value="active">Activo</option><option value="inactive">Inactivo</option>
          </select></div>
      </div>
      <div><label className="label">Descripción</label><textarea className="input" name="description" defaultValue={ministry?.description ?? ''} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">Líder</label><input className="input" name="leader_name" defaultValue={ministry?.leader_name ?? ''} /></div>
        <div><label className="label">Contacto del líder</label><input className="input" name="leader_contact" defaultValue={ministry?.leader_contact ?? ''} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">Capacidad</label><input className="input" type="number" name="capacity" defaultValue={ministry?.capacity ?? ''} /></div>
        <div><label className="label">Requisitos</label><input className="input" name="requirements" defaultValue={ministry?.requirements ?? ''} /></div>
      </div>
      <Submit />
    </form>
  );
}

export function AssignmentsTable({ assignments }: { assignments: any[] }) {
  const [msg, setMsg] = useState<{ error?: string; success?: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="space-y-2">
      {msg?.error && <Alert kind="error">{msg.error}</Alert>}
      {msg?.success && <Alert kind="success">{msg.success}</Alert>}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-gray-500 border-b">
            <th className="py-2">Persona</th><th>Ministerio</th><th>Estado</th><th>Notas</th><th></th></tr></thead>
          <tbody className="divide-y">
            {assignments.map((a) => (
              <tr key={a.id}>
                <td className="py-2">{a.profiles?.first_name} {a.profiles?.last_name}<br /><span className="text-xs text-gray-400">{a.profiles?.email}</span></td>
                <td>{a.ministries?.name}</td>
                <td>
                  <select className="input !py-1.5 !px-2 text-sm" defaultValue={a.status} disabled={pending}
                    onChange={(e) => start(async () => { setMsg(await setAssignmentStatus(a.id, e.target.value)); router.refresh(); })}>
                    {Object.entries(MINISTRY_ASSIGN_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </td>
                <td className="text-xs max-w-40">
                  <button className="underline text-gray-500" disabled={pending} onClick={() => {
                    const n = prompt('Observaciones internas:', a.notes ?? '');
                    if (n !== null) start(async () => { setMsg(await setAssignmentStatus(a.id, a.status, n)); router.refresh(); });
                  }}>{a.notes ? a.notes.slice(0, 40) : 'Agregar nota'}</button>
                </td>
                <td><a className="text-brand-600 underline" href={`/admin/participantes/${a.profiles?.id}`}>Ficha</a></td>
              </tr>
            ))}
            {assignments.length === 0 && <tr><td colSpan={5} className="py-3 text-gray-500">Sin asignaciones.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function MinistryLeadersPanel({ leaders, ministries, canManage }: {
  leaders: any[]; ministries: { id: string; name: string }[]; canManage: boolean;
}) {
  const [msg, setMsg] = useState<{ error?: string; success?: string } | null>(null);
  const [ministryId, setMinistryId] = useState('');
  const [email, setEmail] = useState('');
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="space-y-3">
      {msg?.error && <Alert kind="error">{msg.error}</Alert>}
      {msg?.success && <Alert kind="success">{msg.success}</Alert>}
      {canManage && (
        <div className="card flex flex-wrap gap-3 items-end text-sm">
          <div>
            <label className="label">Ministerio</label>
            <select className="input" value={ministryId} onChange={(e) => setMinistryId(e.target.value)}>
              <option value="">— elige —</option>
              {ministries.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-40">
            <label className="label">Correo del líder</label>
            <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="correo@ejemplo.com" />
          </div>
          <button className="btn-primary !py-2" disabled={pending || !ministryId || !email}
            onClick={() => start(async () => {
              setMsg(await assignMinistryLeader(ministryId, email));
              setEmail('');
              router.refresh();
            })}>
            Asignar líder
          </button>
        </div>
      )}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-gray-500 border-b">
            <th className="py-2">Ministerio</th><th>Líder</th><th></th></tr></thead>
          <tbody className="divide-y">
            {leaders.map((l) => (
              <tr key={l.id}>
                <td className="py-2">{l.ministries?.name}</td>
                <td>{l.profiles?.first_name} {l.profiles?.last_name} <span className="text-xs text-gray-400">{l.profiles?.email}</span></td>
                <td>
                  {canManage && (
                    <button className="text-red-600 underline text-xs" disabled={pending}
                      onClick={() => start(async () => {
                        setMsg(await removeMinistryLeader(l.ministry_id, l.user_id));
                        router.refresh();
                      })}>
                      Quitar
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {leaders.length === 0 && <tr><td colSpan={3} className="py-3 text-gray-500">Sin líderes asignados.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
