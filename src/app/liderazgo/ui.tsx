'use client';
import { useState, useTransition, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, UserPlus } from 'lucide-react';
import {
  acceptMinistryJoin, acceptMemberRequest, rejectMemberRequest, removeMinistryMember,
  updateMinistryProfile, addMinistryMember,
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

/** Ficha del ministerio, editable por su director (Fase 3e).
 *  Va plegada: quien entra a resolver solicitudes no necesita verla abierta,
 *  y quien dirige varios equipos no se encuentra con cinco formularios. */
export function MinistryProfileCard({ ministry }: { ministry: any }) {
  const [msg, setMsg] = useState<{ error?: string; success?: string } | null>(null);
  const [pending, start] = useTransition();
  const [showContact, setShowContact] = useState<boolean>(ministry.show_contact !== false);
  const router = useRouter();

  const save = (fd: FormData) => start(async () => {
    const r = await updateMinistryProfile(ministry.id, {
      description: String(fd.get('description') ?? ''),
      requirements: String(fd.get('requirements') ?? ''),
      meetingInfo: String(fd.get('meeting_info') ?? ''),
      leaderName: String(fd.get('leader_name') ?? ''),
      leaderContact: String(fd.get('leader_contact') ?? ''),
      showContact,
      referenceName: String(fd.get('reference_name') ?? ''),
      referenceContact: String(fd.get('reference_contact') ?? ''),
    });
    setMsg(r);
    if (r?.success) router.refresh();
  });

  return (
    <details className="card">
      <summary className="cursor-pointer font-bold">
        <span className="inline-flex items-center gap-2 align-middle">
          <Pencil className="w-4 h-4 text-brand-600" aria-hidden />
          Editar la ficha de {ministry.name}
        </span>
        <span className="block text-xs font-normal text-gray-500 mt-0.5">
          Es lo que ve la gente en Ministerios cuando busca dónde servir.
        </span>
      </summary>

      <form action={save} className="space-y-4 pt-4">
        {msg?.error && <Alert kind="error">{msg.error}</Alert>}
        {msg?.success && <Alert kind="success">{msg.success}</Alert>}

        <div>
          <label className="label" htmlFor={`d-${ministry.id}`}>Quiénes somos</label>
          <textarea className="input min-h-[80px]" id={`d-${ministry.id}`} name="description" maxLength={1000}
            defaultValue={ministry.description ?? ''}
            placeholder="En pocas líneas: qué hace el equipo y a quién le puede gustar servir aquí." />
        </div>

        <div>
          <label className="label" htmlFor={`m-${ministry.id}`}>Cuándo y dónde se reúnen</label>
          <input className="input" id={`m-${ministry.id}`} name="meeting_info" maxLength={300}
            defaultValue={ministry.meeting_info ?? ''}
            placeholder="Ej.: ensayamos los jueves a las 7 pm en el salón de música" />
        </div>

        <div>
          <label className="label" htmlFor={`r-${ministry.id}`}>Qué hace falta para entrar</label>
          <input className="input" id={`r-${ministry.id}`} name="requirements" maxLength={500}
            defaultValue={ministry.requirements ?? ''}
            placeholder="Ej.: audición previa, disponibilidad los domingos" />
          <p className="text-xs text-gray-500 mt-1">Déjalo vacío si no hace falta nada en particular.</p>
        </div>

        <div className="rounded-xl border border-gray-200 p-3.5 space-y-3">
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" className="mt-0.5 w-4 h-4" checked={showContact}
              onChange={(e) => setShowContact(e.target.checked)} />
            <span>
              <b>Publicar un contacto del ministerio</b>
              <span className="block text-xs text-gray-500">
                Si lo desactivas, nadie verá teléfonos ni correos en el catálogo: la gente entra por solicitud y ya.
              </span>
            </span>
          </label>

          {/* Se ocultan con CSS, no se desmontan: si no van en el formulario,
              guardar con la casilla apagada borraría los contactos guardados. */}
          <div className={showContact ? 'space-y-3 pt-1' : 'hidden'}>
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="label" htmlFor={`ln-${ministry.id}`}>A quién escribir</label>
                  <input className="input" id={`ln-${ministry.id}`} name="leader_name" maxLength={120}
                    defaultValue={ministry.leader_name ?? ''} placeholder="Tu nombre" />
                </div>
                <div>
                  <label className="label" htmlFor={`lc-${ministry.id}`}>Teléfono o correo</label>
                  <input className="input" id={`lc-${ministry.id}`} name="leader_contact" maxLength={120}
                    defaultValue={ministry.leader_contact ?? ''} placeholder="+1 407 555 0100" />
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="label" htmlFor={`rn-${ministry.id}`}>Otra persona de referencia</label>
                  <input className="input" id={`rn-${ministry.id}`} name="reference_name" maxLength={120}
                    defaultValue={ministry.reference_name ?? ''} placeholder="Opcional" />
                </div>
                <div>
                  <label className="label" htmlFor={`rc-${ministry.id}`}>Su teléfono o correo</label>
                  <input className="input" id={`rc-${ministry.id}`} name="reference_contact" maxLength={120}
                    defaultValue={ministry.reference_contact ?? ''} placeholder="Opcional" />
                </div>
              </div>
            <p className="text-xs text-gray-500">
              Útil cuando no estás disponible: un colíder, o quien coordina el equipo.
            </p>
          </div>
        </div>

        <button className="btn-primary !py-2 !px-5 text-sm" disabled={pending}>
          {pending ? 'Guardando…' : 'Guardar ficha'}
        </button>
      </form>
    </details>
  );
}

/** Sumar a alguien al equipo sin pasar por solicitud (Fase 3e).
 *  Solo miembros activos: es la regla de la 013/014. */
export function AddMemberCard({ ministries }: { ministries: { id: string; name: string }[] }) {
  const [msg, setMsg] = useState<{ error?: string; success?: string } | null>(null);
  const [pending, start] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  if (ministries.length === 0) return null;

  const add = (fd: FormData) => start(async () => {
    const r = await addMinistryMember(
      String(fd.get('ministry_id') ?? ''),
      String(fd.get('email') ?? '').trim(),
      String(fd.get('note') ?? ''),
    );
    setMsg(r);
    if (r?.success) { formRef.current?.reset(); router.refresh(); }
  });

  return (
    <section className="card space-y-3">
      <h2 className="font-bold inline-flex items-center gap-2">
        <UserPlus className="w-4 h-4 text-brand-600" aria-hidden /> Sumar a alguien a tu equipo
      </h2>
      <p className="text-xs text-gray-500">
        Para quienes ya sirven contigo y no hace falta que pasen por una solicitud. Solo puedes sumar a
        miembros activos: si alguien aún no completó el curso, pídele al administrador que lo marque como
        miembro activo desde su ficha.
      </p>
      {msg?.error && <Alert kind="error">{msg.error}</Alert>}
      {msg?.success && <Alert kind="success">{msg.success}</Alert>}
      <form ref={formRef} action={add} className="space-y-3">
        {ministries.length > 1 && (
          <div>
            <label className="label" htmlFor="add-min">Ministerio</label>
            <select className="input" id="add-min" name="ministry_id" required defaultValue="">
              <option value="" disabled>Elige el ministerio…</option>
              {ministries.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
        )}
        {ministries.length === 1 && <input type="hidden" name="ministry_id" value={ministries[0].id} />}
        <div className="sm:flex sm:gap-3 sm:items-end space-y-3 sm:space-y-0">
          <div className="flex-1">
            <label className="label" htmlFor="add-email">Correo de la persona</label>
            <input className="input" id="add-email" name="email" type="email" required
              placeholder="su.correo@ejemplo.com" />
          </div>
          <button className="btn-primary !py-2 !px-4 text-sm w-full sm:w-auto" disabled={pending}>
            {pending ? 'Agregando…' : 'Agregar'}
          </button>
        </div>
        <div>
          <label className="label" htmlFor="add-note">Nota (opcional)</label>
          <input className="input" id="add-note" name="note" maxLength={200}
            placeholder="Ej.: sirve en sonido desde 2023" />
        </div>
      </form>
    </section>
  );
}
