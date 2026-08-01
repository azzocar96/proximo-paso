'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Clock, Archive, Inbox, Send, ShieldQuestion } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { fmtDate } from '@/lib/utils';
import { acceptMinistryJoin, acceptMemberRequest, rejectMemberRequest, cancelMemberRequest } from '@/lib/actions/ministry';
import { approveActiveMember, rejectActiveMember, cancelActiveMemberRequest } from '@/lib/actions/member';
import { approveAttendanceRequest, rejectAttendanceRequest } from '@/lib/actions/admin';
import { requestMinistryDirector, resolveDirectorRequest } from '@/lib/actions/servants';

type Row = any;

const TITULO: Record<string, string> = {
  join: 'Ingreso a un ministerio',
  leave: 'Baja de un ministerio',
  switch: 'Cambio de ministerio',
  role_change: 'Cambio de rol',
  director: 'Dirigir un ministerio',
  active_member: 'Ser miembro activo',
  attendance: 'Confirmar una asistencia',
};

function Tag({ estado }: { estado?: string }) {
  const map: Record<string, { t: string; c: string }> = {
    pending: { t: 'En revisión', c: 'bg-amber-50 text-amber-700 border-amber-200' },
    accepted: { t: 'Aprobada', c: 'bg-green-50 text-green-700 border-green-200' },
    approved: { t: 'Aprobada', c: 'bg-green-50 text-green-700 border-green-200' },
    rejected: { t: 'No aprobada', c: 'bg-red-50 text-red-700 border-red-200' },
    cancelled: { t: 'Retirada', c: 'bg-gray-100 text-gray-600 border-gray-200' },
  };
  const v = map[estado ?? 'pending'] ?? map.pending;
  return <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${v.c}`}>{v.t}</span>;
}

export function RequestsHub({ mine, inbox, archive, ministries, isAdmin, loadError }: {
  mine: Row[]; inbox: Row[]; archive: Row[];
  ministries: { id: string; name: string }[]; isAdmin?: boolean; loadError?: boolean;
}) {
  const [tab, setTab] = useState<'mias' | 'buzon' | 'archivo'>(inbox.length > 0 ? 'buzon' : 'mias');
  const [msg, setMsg] = useState<{ error?: string; success?: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [, start] = useTransition();
  const router = useRouter();

  const run = (key: string, fn: () => Promise<any>) => {
    setBusy(key);
    start(async () => {
      try {
        const r = await fn();
        setMsg(r);
        if (r?.success) { setRejecting(null); setReason(''); }
        router.refresh();
      } catch {
        // Sin este catch, un fallo dejaba TODOS los botones apagados para
        // siempre hasta recargar la página.
        setMsg({ error: 'Algo se cortó por el camino. Vuelve a intentarlo.' });
      } finally {
        setBusy(null);
      }
    });
  };

  const tabs = [
    { k: 'mias' as const, label: 'Mis solicitudes', n: mine.length, Icon: Send },
    { k: 'buzon' as const, label: 'Buzón', n: inbox.length, Icon: Inbox },
    { k: 'archivo' as const, label: 'Archivo', n: archive.length, Icon: Archive },
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist">
        {tabs.map(({ k, label, n, Icon }) => (
          <button key={k} role="tab" id={`tab-${k}`} aria-controls={`panel-${k}`}
            aria-selected={tab === k} onClick={() => setTab(k)}
            className={`shrink-0 inline-flex items-center gap-2 px-3.5 py-2 rounded-full text-sm font-semibold border transition
              ${tab === k ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-200'}`}>
            <Icon className="w-4 h-4" aria-hidden /> {label}
            {n > 0 && <span className={`text-[11px] px-1.5 rounded-full ${tab === k ? 'bg-white/25' : 'bg-gray-100'}`}>{n}</span>}
          </button>
        ))}
      </div>

      {loadError && (
        <Alert kind="error">
          No pudimos cargar todas las solicitudes. Vuelve a entrar en un minuto: puede haber gente esperando.
        </Alert>
      )}
      {msg?.error && <Alert kind="error">{msg.error}</Alert>}
      {msg?.success && <Alert kind="success">{msg.success}</Alert>}

      {tab === 'mias' && (
        <div className="space-y-3" role="tabpanel" id="panel-mias" aria-labelledby="tab-mias" tabIndex={0}>
          {mine.map((r) => {
            const key = `${r.origen}-${r.id}`;
            return (
              <article key={key} className="card space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{TITULO[r.tipo] ?? r.tipo}</p>
                    {r.ministerio && <p className="text-xs text-gray-500">{r.ministerio}</p>}
                    <p className="text-xs text-gray-400 inline-flex items-center gap-1">
                      <Clock className="w-3 h-3" aria-hidden /> Enviada el {fmtDate(r.fecha)}
                    </p>
                  </div>
                  <Tag estado="pending" />
                </div>
                {r.detalle && <p className="text-sm text-gray-600">“{r.detalle}”</p>}
                {r.tipo === 'join' && r.opciones > 0 && (
                  <p className="text-xs text-gray-500">
                    Elegiste {r.opciones} ministerio(s). El primer director que te acepte te suma a su equipo.
                  </p>
                )}
                {r.origen === 'member_request' && (
                  <button className="btn-secondary !py-1.5 !px-3 text-xs" disabled={busy !== null}
                    onClick={() => run(key, () => cancelMemberRequest(r.id))}>Retirar</button>
                )}
                {r.origen === 'active_member' && (
                  <button className="btn-secondary !py-1.5 !px-3 text-xs" disabled={busy !== null}
                    onClick={() => run(key, () => cancelActiveMemberRequest())}>Retirar</button>
                )}
                {r.origen === 'attendance' && (
                  <p className="text-xs text-gray-500">La resuelve el coordinador, el orador o un servidor de ese paso.</p>
                )}
              </article>
            );
          })}
          {mine.length === 0 && <p className="card text-sm text-gray-500">No tienes solicitudes en revisión.</p>}

          <DirectorRequestCard ministries={ministries} busy={busy !== null}
            onSend={(mid, det) => run('nueva-direccion', () => requestMinistryDirector(mid, det))} />
        </div>
      )}

      {tab === 'buzon' && (
        <div className="space-y-3" role="tabpanel" id="panel-buzon" aria-labelledby="tab-buzon" tabIndex={0}>
          <p className="text-sm text-gray-600">
            Esto te llega por el cargo que tienes. Si no reconoces a alguien, pregunta antes de aprobar.
          </p>
          {inbox.map((r) => {
            const key = `${r.origen}-${r.id}`;
            const abierto = rejecting === key;
            return (
              <article key={key} className="card space-y-2" aria-busy={busy === key}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{r.persona}</p>
                    <p className="text-sm text-gray-600">{TITULO[r.tipo] ?? r.tipo}{r.ministerio ? ` · ${r.ministerio}` : ''}</p>
                    <p className="text-xs text-gray-400">Lo pidió el {fmtDate(r.fecha)}</p>
                  </div>
                </div>
                {r.extra === 'con_certificado' && (
                  <p className="text-xs text-green-700">Ya tiene certificado emitido en esta plataforma</p>
                )}
                {r.detalle && <p className="text-sm text-gray-600">“{r.detalle}”</p>}

                {abierto ? (
                  <div className="space-y-2">
                    <label className="label" htmlFor={`m-${key}`}>Motivo (lo va a leer {r.persona})</label>
                    <textarea className="input" id={`m-${key}`} rows={2} maxLength={500}
                      value={reason} onChange={(e) => setReason(e.target.value)} />
                    <div className="flex flex-wrap gap-2">
                      <button className="btn-primary !py-2 !px-4 text-sm"
                        disabled={busy !== null || reason.trim().length < 5}
                        onClick={() => run(key, () => rechazar(r, reason))}>Enviar el motivo</button>
                      <button className="btn-secondary !py-2 !px-4 text-sm" disabled={busy !== null}
                        onClick={() => { setRejecting(null); setReason(''); }}>Cancelar</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button className="btn-primary !py-2 !px-4 text-sm" disabled={busy !== null}
                      aria-label={`Aprobar la solicitud de ${r.persona}`}
                      onClick={() => {
                        if (!window.confirm(`Vas a aprobar «${TITULO[r.tipo] ?? r.tipo}» de ${r.persona}. ¿Confirmas?`)) return;
                        run(key, () => aprobar(r));
                      }}>
                      {busy === key ? 'Guardando…' : 'Aprobar'}
                    </button>
                    {puedeRechazar(r, isAdmin) && (
                      <button className="btn-secondary !py-2 !px-4 text-sm" disabled={busy !== null}
                        aria-label={`No aprobar la solicitud de ${r.persona}`}
                        onClick={() => { setRejecting(key); setReason(''); }}>No aprobar</button>
                    )}
                  </div>
                )}
                {r.tipo === 'join' && !puedeRechazar(r, isAdmin) && (
                  <p className="text-xs text-gray-500">
                    Rechazar un ingreso queda para el administrador: otro equipo puede querer a esta persona.
                  </p>
                )}
              </article>
            );
          })}
          {inbox.length === 0 && <p className="card text-sm text-gray-500">No tienes nada pendiente por resolver.</p>}
        </div>
      )}

      {tab === 'archivo' && (
        <div className="space-y-3" role="tabpanel" id="panel-archivo" aria-labelledby="tab-archivo" tabIndex={0}>
          {archive.map((r) => (
            <article key={`${r.origen}-${r.id}-${r.fecha}`} className="card space-y-1">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-sm">
                    {TITULO[r.tipo] ?? r.tipo}{r.ministerio ? ` · ${r.ministerio}` : ''}
                  </p>
                  <p className="text-xs text-gray-500">{r.mia ? 'La pediste tú' : r.persona}</p>
                  <p className="text-xs text-gray-400">{fmtDate(r.fecha)}</p>
                </div>
                <Tag estado={r.estado} />
              </div>
              {r.nota && <p className="text-sm text-gray-600">Nota: {r.nota}</p>}
            </article>
          ))}
          {archive.length === 0 && <p className="card text-sm text-gray-500">Todavía no hay nada en el archivo.</p>}
        </div>
      )}
    </div>
  );
}

/**
 * Un director no puede rechazar un ingreso: esa regla venía de la fase 3b, para
 * que no bloquee a alguien que otro equipo sí quería. El administrador sí.
 */
function puedeRechazar(r: Row, isAdmin?: boolean): boolean {
  if (r.origen === 'member_request' && r.tipo === 'join') return isAdmin === true;
  return true;
}

function aprobar(r: Row) {
  if (r.origen === 'active_member') return approveActiveMember(r.id);
  if (r.origen === 'attendance') return approveAttendanceRequest(r.id);
  if (r.tipo === 'join') return acceptMinistryJoin(r.id, r.ministerio_id);
  if (r.tipo === 'director') return resolveDirectorRequest(r.id, true);
  return acceptMemberRequest(r.id);
}

function rechazar(r: Row, motivo: string) {
  if (r.origen === 'active_member') return rejectActiveMember(r.id, motivo);
  if (r.origen === 'attendance') return rejectAttendanceRequest(r.id, motivo);
  if (r.tipo === 'director') return resolveDirectorRequest(r.id, false, motivo);
  return rejectMemberRequest(r.id, motivo);
}

function DirectorRequestCard({ ministries, busy, onSend }: {
  ministries: { id: string; name: string }[]; busy: boolean;
  onSend: (ministryId: string, details: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [mid, setMid] = useState('');
  const [det, setDet] = useState('');
  return (
    <section className="card space-y-3">
      <h2 className="font-bold inline-flex items-center gap-2">
        <ShieldQuestion className="w-4 h-4 text-brand-600" aria-hidden /> ¿Quieres dirigir un ministerio?
      </h2>
      {!open ? (
        <>
          <p className="text-sm text-gray-600">
            Los directores no se nombran solos: se pide y lo aprueba el equipo pastoral. Hay que ser miembro activo.
          </p>
          <button className="btn-secondary !py-2 text-sm" onClick={() => setOpen(true)}>Pedirlo</button>
        </>
      ) : (
        <>
          <div>
            <label className="label" htmlFor="dir-min">Ministerio</label>
            <select className="input" id="dir-min" value={mid} onChange={(e) => setMid(e.target.value)}>
              <option value="" disabled>Elige el ministerio…</option>
              {ministries.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="dir-det">¿Por qué quieres dirigirlo?</label>
            <textarea className="input" id="dir-det" rows={3} maxLength={1000} value={det}
              onChange={(e) => setDet(e.target.value)}
              placeholder="Cuéntanos qué has hecho en ese equipo y qué te gustaría hacer." />
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary !py-2 text-sm" disabled={busy || !mid || det.trim().length < 10}
              onClick={() => onSend(mid, det)}>Enviar solicitud</button>
            <button className="btn-secondary !py-2 text-sm" disabled={busy}
              onClick={() => setOpen(false)}>Cancelar</button>
          </div>
        </>
      )}
    </section>
  );
}
