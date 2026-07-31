'use client';
// Fase 3f — bandeja de "ya soy miembro activo".
// La misma pieza en el panel del director y en el del administrador: si la
// regla es la misma, la pantalla también, para que nadie aprenda dos formas
// de hacer lo mismo.
//
// Correcciones de auditoría que dejaron marca aquí:
//  · el rechazo usaba window.prompt: no lo anuncia bien un lector de pantalla y
//    los navegadores dentro de Instagram o Facebook lo bloquean, así que ahí el
//    director no podía rechazar nada y la app no decía por qué. Ahora el motivo
//    se escribe en la propia tarjeta.
//  · "Aprobar" concedía el privilegio de un clic, sin confirmar.
//  · un único indicador de "ocupado" apagaba los botones de TODAS las tarjetas.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { BadgeCheck, Award, AlertTriangle } from 'lucide-react';
import { approveActiveMember, rejectActiveMember } from '@/lib/actions/member';
import { Alert } from '@/components/ui/Alert';
import { fmtDate } from '@/lib/utils';

type Req = {
  id: string; nombre: string; email?: string | null; foto?: string | null;
  nota?: string | null; desde: string; tiene_certificado?: boolean;
};

export function ActiveMemberRequests({ requests, loadError }: { requests: Req[]; loadError?: string | null }) {
  const [msg, setMsg] = useState<{ error?: string; success?: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [, start] = useTransition();
  const router = useRouter();

  const run = (id: string, fn: () => Promise<any>) => {
    setBusyId(id);
    start(async () => {
      const r = await fn();
      setMsg(r);
      setBusyId(null);
      if (r?.success) { setRejecting(null); setReason(''); }
      router.refresh();
    });
  };

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-bold inline-flex items-center gap-2">
        <BadgeCheck className="w-4 h-4 text-brand-600" aria-hidden />
        Solicitudes de miembro activo ({requests.length})
      </h2>
      <p className="text-sm text-gray-600">
        Estas personas dicen que ya hicieron el curso antes de que existiera la app. Al aprobar, se abren
        para ellas los muros y los ministerios. Si no te consta, mejor pregunta antes de aprobar.
      </p>

      {/* Que un fallo no se vea igual que "no hay nadie esperando": esa confusión
          ya nos costó una vez que la app entera pareciera vacía sin dar error. */}
      {loadError && (
        <Alert kind="error">
          No pudimos cargar las solicitudes ahora mismo. Vuelve a entrar en un minuto; puede haber gente esperando.
        </Alert>
      )}
      {msg?.error && <Alert kind="error">{msg.error}</Alert>}
      {msg?.success && <Alert kind="success">{msg.success}</Alert>}

      {!loadError && requests.length === 0 && (
        <p className="card text-sm text-gray-500">No hay solicitudes pendientes.</p>
      )}

      {requests.map((r) => (
        <article key={r.id} className="card space-y-2" aria-busy={busyId === r.id}>
          <div className="flex items-start gap-3">
            {r.foto
              ? <img src={r.foto} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
              : <div className="w-10 h-10 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center font-bold shrink-0">
                  {r.nombre.slice(0, 1)}
                </div>}
            <div className="min-w-0">
              <p className="font-semibold">{r.nombre}</p>
              {r.email && <p className="text-xs text-gray-500 break-all">{r.email}</p>}
              <p className="text-xs text-gray-400">Lo pidió el {fmtDate(r.desde)}</p>
            </div>
          </div>

          {r.tiene_certificado ? (
            <p className="text-xs text-green-700 inline-flex items-center gap-1.5">
              <Award className="w-3.5 h-3.5 shrink-0" aria-hidden />
              Ya tiene certificado emitido en esta plataforma
            </p>
          ) : (
            <p className="text-xs text-amber-700 inline-flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden />
              No tiene certificado aquí: te está pidiendo que confíes en su palabra
            </p>
          )}

          {r.nota && <p className="text-sm text-gray-600">“{r.nota}”</p>}

          {rejecting === r.id ? (
            <div className="space-y-2 pt-1">
              <label className="label" htmlFor={`motivo-${r.id}`}>
                Motivo para no aprobar a {r.nombre} (lo va a leer)
              </label>
              <textarea className="input" id={`motivo-${r.id}`} rows={2} maxLength={500}
                value={reason} onChange={(e) => setReason(e.target.value)}
                placeholder="Ej.: no encontramos tu registro del curso, pasa por la oficina y lo revisamos juntos" />
              <div className="flex flex-wrap gap-2">
                <button className="btn-primary !py-2 !px-4 text-sm" disabled={busyId !== null || reason.trim().length < 5}
                  onClick={() => run(r.id, () => rejectActiveMember(r.id, reason))}>
                  Enviar el motivo
                </button>
                <button className="btn-secondary !py-2 !px-4 text-sm" disabled={busyId !== null}
                  onClick={() => { setRejecting(null); setReason(''); }}>
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2 pt-1">
              <button className="btn-primary !py-2 !px-4 text-sm" disabled={busyId !== null}
                aria-label={`Aprobar a ${r.nombre} como miembro activo`}
                onClick={() => {
                  if (!window.confirm(`Vas a abrir los muros y los ministerios a ${r.nombre}. ¿Confirmas?`)) return;
                  run(r.id, () => approveActiveMember(r.id));
                }}>
                {busyId === r.id ? 'Guardando…' : 'Aprobar'}
              </button>
              <button className="btn-secondary !py-2 !px-4 text-sm" disabled={busyId !== null}
                aria-label={`No aprobar a ${r.nombre}`}
                onClick={() => { setRejecting(r.id); setReason(''); }}>
                No aprobar
              </button>
            </div>
          )}
        </article>
      ))}
    </section>
  );
}
