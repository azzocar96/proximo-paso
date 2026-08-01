'use client';
import { useState, useTransition, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, UserPlus, HandHeart } from 'lucide-react';
import {
  acceptMinistryJoin, acceptMemberRequest, rejectMemberRequest, removeMinistryMember,
  updateMinistryProfile, addMinistryMember,
} from '@/lib/actions/ministry';
import { Alert } from '@/components/ui/Alert';
import { setMinistryServant, removeMinistryServant } from '@/lib/actions/servants';

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

// ---------- Fase 3g: los servidores del ministerio ----------
const PERMISOS: { k: string; label: string; hint: string; soloCurso?: boolean }[] = [
  { k: 'canShowQr', label: 'Mostrar el código de asistencia', hint: 'Abre, muestra, renueva y cierra la asistencia de los pasos que le marques.', soloCurso: true },
  { k: 'canApproveAttendance', label: 'Confirmar asistencias olvidadas', hint: 'Resuelve las solicitudes de quien olvidó marcar en sus pasos.', soloCurso: true },
  { k: 'canPostWall', label: 'Publicar en el muro del ministerio', hint: 'Sus publicaciones las ven los miembros del equipo.' },
  { k: 'canGiveInfo', label: 'Dar información', hint: 'Su teléfono o correo aparece en la ficha, si además la publicas.' },
  { k: 'canAddMembers', label: 'Sumar personas al equipo', hint: 'Podrá agregar miembros activos igual que tú.' },
];

export function ServantsCard({ ministry, servants, candidates }: {
  ministry: { id: string; name: string; is_course_ministry?: boolean };
  servants: any[]; candidates: { id: string; nombre: string; ya_es_servidor: boolean }[];
}) {
  const [msg, setMsg] = useState<{ error?: string; success?: string } | null>(null);
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);
  const router = useRouter();
  const esCurso = ministry.is_course_ministry === true;

  const vacio = { title: '', contact: '', notes: '', showInProfile: false, canShowQr: false,
    canApproveAttendance: false, canPostWall: false, canGiveInfo: false, canAddMembers: false, steps: [] as number[] };
  const [form, setForm] = useState<any>(vacio);
  const [userId, setUserId] = useState('');

  const abrir = (s: any) => {
    setEditing(s.user_id); setUserId(s.user_id);
    setForm({
      title: s.title ?? '', contact: s.contact ?? '', notes: s.notes ?? '',
      showInProfile: !!s.show_in_profile, canShowQr: !!s.can_show_qr,
      canApproveAttendance: !!s.can_approve_attendance, canPostWall: !!s.can_post_wall,
      canGiveInfo: !!s.can_give_info, canAddMembers: !!s.can_add_members,
      steps: (s.pasos ?? []) as number[],
    });
  };
  const cerrar = () => { setEditing(null); setUserId(''); setForm(vacio); };
  const guardar = () => start(async () => {
    const r = await setMinistryServant(ministry.id, userId, form);
    setMsg(r); if (r?.success) cerrar();
    router.refresh();
  });

  const libres = candidates.filter((c) => !c.ya_es_servidor);

  return (
    <section className="card space-y-3">
      <h2 className="font-bold inline-flex items-center gap-2">
        <HandHeart className="w-4 h-4 text-brand-600" aria-hidden /> Servidores de {ministry.name}
      </h2>
      <p className="text-xs text-gray-500">
        Son tu gente de confianza dentro del equipo. Tú decides qué puede hacer cada uno y se lo puedes quitar
        cuando quieras. Solo puedes nombrar a quien ya está en tu equipo.
      </p>
      {msg?.error && <Alert kind="error">{msg.error}</Alert>}
      {msg?.success && <Alert kind="success">{msg.success}</Alert>}

      <ul className="divide-y divide-gray-100">
        {servants.map((s: any) => (
          <li key={s.user_id} className="py-2.5 space-y-1">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-sm">{s.nombre}</p>
                {s.title && <p className="text-xs text-gray-500">{s.title}</p>}
                <p className="text-xs text-gray-400">
                  {PERMISOS.filter((p) => s[snake(p.k)]).map((p) => p.label).join(' · ') || 'Sin responsabilidades'}
                  {(s.pasos ?? []).length > 0 ? ` · Paso ${(s.pasos as number[]).join(', ')}` : ''}
                </p>
                {s.activa === false && (
                  <p className="text-xs text-amber-700">
                    Ya no está en el equipo o dejó de ser miembro activo: sus permisos no tienen efecto.
                  </p>
                )}
              </div>
              <div className="flex gap-2 shrink-0">
                <button className="text-brand-700 underline text-xs" disabled={pending}
                  onClick={() => abrir(s)}>Cambiar</button>
                <button className="text-red-600 underline text-xs" disabled={pending}
                  onClick={() => {
                    if (!window.confirm(`${s.nombre} dejará de ser servidora. Sigue en tu equipo. ¿Confirmas?`)) return;
                    start(async () => { setMsg(await removeMinistryServant(ministry.id, s.user_id)); router.refresh(); });
                  }}>Quitar</button>
              </div>
            </div>
          </li>
        ))}
        {servants.length === 0 && <li className="py-2 text-sm text-gray-500">Todavía no nombraste servidores.</li>}
      </ul>

      {editing === null && (
        <button className="btn-secondary !py-2 text-sm" disabled={pending || libres.length === 0}
          onClick={() => { setEditing(''); setForm(vacio); setUserId(''); }}>
          Nombrar un servidor
        </button>
      )}
      {libres.length === 0 && editing === null && (
        <p className="text-xs text-gray-500">
          {candidates.length === 0
            ? 'Todavía no hay nadie en este equipo. Súmalo arriba y después podrás nombrarlo servidor.'
            : 'Todos los miembros activos de tu equipo ya son servidores.'}
        </p>
      )}

      {editing !== null && (
        <div className="rounded-xl border border-gray-200 p-3 space-y-3">
          {editing === '' && (
            <div>
              <label className="label">Persona de tu equipo</label>
              <select className="input" value={userId} onChange={(e) => setUserId(e.target.value)}>
                <option value="" disabled>Elige a quién nombrar…</option>
                {libres.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Cargo (opcional)</label>
              <input className="input" maxLength={80} value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ej.: asistente de alabanza" /></div>
            <div><label className="label">Teléfono o correo</label>
              <input className="input" maxLength={160} value={form.contact}
                onChange={(e) => setForm({ ...form, contact: e.target.value })} /></div>
          </div>

          <fieldset className="space-y-2">
            <legend className="label">Qué le confías</legend>
            {/* Se ocultan con CSS, nunca se desmontan: si se desmontan, el
                director no puede APAGAR un permiso que ya estaba encendido. */}
            {PERMISOS.map((p) => (
              <label key={p.k} className={`flex items-start gap-2.5 text-sm ${(!esCurso && p.soloCurso) ? 'hidden' : ''}`}>
                <input type="checkbox" className="mt-0.5 w-4 h-4" checked={!!form[p.k]}
                  onChange={(e) => setForm({ ...form, [p.k]: e.target.checked })} />
                <span><b>{p.label}</b><span className="block text-xs text-gray-500">{p.hint}</span></span>
              </label>
            ))}
          </fieldset>

          <div className={esCurso ? '' : 'hidden'}>
            <div>
              <label className="label">¿En qué pasos sirve?</label>
              <div className="flex gap-2 flex-wrap">
                {[1, 2, 3, 4].map((n) => {
                  const on = (form.steps as number[]).includes(n);
                  return (
                    <button key={n} type="button" aria-pressed={on}
                      className={`px-3 py-1.5 rounded-full text-sm font-semibold border ${on ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-200'}`}
                      onClick={() => setForm({
                        ...form,
                        steps: on ? (form.steps as number[]).filter((x) => x !== n) : [...(form.steps as number[]), n],
                      })}>
                      Paso {n}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Solo podrá mostrar el código y confirmar asistencias de los pasos que marques aquí.
              </p>
            </div>
          </div>

          <label className="flex items-start gap-2.5 text-sm">
            <input type="checkbox" className="mt-0.5 w-4 h-4" checked={form.showInProfile}
              onChange={(e) => setForm({ ...form, showInProfile: e.target.checked })} />
            <span><b>Que aparezca en la ficha del ministerio</b>
              <span className="block text-xs text-gray-500">Lo verá cualquiera que entre a Ministerios.</span></span>
          </label>

          <div><label className="label">Nota interna (opcional)</label>
            <input className="input" maxLength={300} value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>

          <div className="flex flex-wrap gap-2">
            <button className="btn-primary !py-2 text-sm" disabled={pending || !userId} onClick={guardar}>
              {pending ? 'Guardando…' : 'Guardar'}
            </button>
            <button className="btn-secondary !py-2 text-sm" disabled={pending} onClick={cerrar}>Cancelar</button>
          </div>
        </div>
      )}
    </section>
  );
}

/** Las casillas viajan en camelCase al servidor y vuelven en snake_case de la base. */
function snake(k: string): string {
  return k.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());
}
