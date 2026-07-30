'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  acceptMinistryJoin, acceptMemberRequest, rejectMemberRequest, removeMinistryMember,
} from '@/lib/actions/ministry';
import { Alert } from '@/components/ui/Alert';

type Person = { first_name?: string; last_name?: string; email?: string };

export function JoinRequestRow({ request, myOptions, allPrefs, since, canReject }: {
  request: { id: string; profiles?: Person };
  myOptions: { id: string; name: string; pref: number }[];
  allPrefs: number; since: string; canReject?: boolean;
}) {
  const [msg, setMsg] = useState<{ error?: string; success?: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const p = request.profiles;
  return (
    <li className="py-3 space-y-1.5">
      {msg?.error && <Alert kind="error">{msg.error}</Alert>}
      {msg?.success && <Alert kind="success">{msg.success}</Alert>}
      <div className="flex justify-between flex-wrap gap-1 text-sm">
        <span className="font-medium">{p?.first_name} {p?.last_name} <span className="text-xs text-gray-400">{p?.email}</span></span>
        <span className="text-xs text-gray-500">{since} · eligió {allPrefs} ministerio(s)</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {myOptions.map((o) => (
          <button key={o.id} className="btn-primary !py-1.5 !px-3 text-xs" disabled={pending}
            onClick={() => start(async () => { setMsg(await acceptMinistryJoin(request.id, o.id)); router.refresh(); })}>
            Aceptar en {o.name} (su {o.pref}ª opción)
          </button>
        ))}
        {canReject && (
          <button className="text-red-600 underline text-xs" disabled={pending} onClick={() => {
            const motivo = prompt('Motivo del rechazo (obligatorio, la persona podrá verlo):');
            if (!motivo) return;
            start(async () => { setMsg(await rejectMemberRequest(request.id, motivo)); router.refresh(); });
          }}>
            Rechazar solicitud
          </button>
        )}
      </div>
    </li>
  );
}

export function OtherRequestRow({ request, kindLabel, ministryName, since }: {
  request: { id: string; kind: string; details?: string | null; profiles?: Person };
  kindLabel: string; ministryName: string; since: string;
}) {
  const [msg, setMsg] = useState<{ error?: string; success?: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const p = request.profiles;
  return (
    <li className="py-3 space-y-1.5">
      {msg?.error && <Alert kind="error">{msg.error}</Alert>}
      {msg?.success && <Alert kind="success">{msg.success}</Alert>}
      <div className="flex justify-between flex-wrap gap-1 text-sm">
        <span className="font-medium">{p?.first_name} {p?.last_name} <span className="text-xs text-gray-400">{p?.email}</span></span>
        <span className="text-xs text-gray-500">{since}</span>
      </div>
      <p className="text-sm text-gray-600">
        <b>{kindLabel}</b>{ministryName ? ` · ${ministryName}` : ''}
        {request.kind === 'switch' && ' (si aceptas, sale automáticamente de su ministerio actual)'}
      </p>
      {request.details && <p className="text-xs text-gray-500 italic">"{request.details}"</p>}
      <div className="flex gap-3">
        <button className="btn-primary !py-1.5 !px-3 text-xs" disabled={pending}
          onClick={() => start(async () => { setMsg(await acceptMemberRequest(request.id)); router.refresh(); })}>
          Aceptar
        </button>
        <button className="text-red-600 underline text-xs" disabled={pending} onClick={() => {
          const motivo = prompt('Motivo del rechazo (obligatorio, la persona podrá verlo):');
          if (!motivo) return;
          start(async () => { setMsg(await rejectMemberRequest(request.id, motivo)); router.refresh(); });
        }}>
          Rechazar
        </button>
      </div>
    </li>
  );
}

export function MemberRow({ member }: {
  member: { id: string; ministry_id: string; user_id: string; created_at: string; profiles?: Person; ministries?: { name?: string } };
}) {
  const [msg, setMsg] = useState<{ error?: string; success?: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const p = member.profiles;
  return (
    <li className="py-3 flex items-center justify-between gap-3 text-sm">
      {msg?.error && <Alert kind="error">{msg.error}</Alert>}
      <span className="min-w-0">
        <span className="font-medium">{p?.first_name} {p?.last_name}</span>{' '}
        <span className="text-xs text-gray-400">{p?.email}</span>
        <span className="block text-xs text-gray-500">{member.ministries?.name}</span>
      </span>
      <button className="text-red-600 underline text-xs shrink-0" disabled={pending} onClick={() => {
        const motivo = prompt('Motivo para dar de baja (obligatorio, queda en auditoría). La persona vuelve a la comunidad general:');
        if (!motivo) return;
        start(async () => { setMsg(await removeMinistryMember(member.ministry_id, member.user_id, motivo)); router.refresh(); });
      }}>
        Dar de baja
      </button>
    </li>
  );
}
