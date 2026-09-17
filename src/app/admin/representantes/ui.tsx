'use client';
import { useState, useTransition } from 'react';
import { ShieldCheck, Copy, Check, Mail, AlertTriangle, RefreshCw } from 'lucide-react';
import { adminGrantGuardian, adminRevokeGuardian, adminGuardianLink } from '@/lib/actions/guardian';
import { Alert } from '@/components/ui/Alert';

type Pendiente = {
  id: string; menor: string; email: string; estado: string;
  representante: string; guardian_email: string; guardian_phone: string;
  creado: string; token: string | null;
};
type Aviso = {
  id: string; recipient_email: string; recipient_name: string | null;
  kind: string; subject: string; created_at: string;
};

const KINDS: Record<string, string> = {
  guardian_authorization_request: 'Pedir permiso al representante',
  guardian_authorization_granted: 'Aviso de permiso concedido',
  enrollment: 'Se inscribió a un ciclo',
  attendance: 'Asistencia registrada',
  certificate: 'Certificado emitido',
  account_email_changed: 'Cambió su correo',
  account_password_changed: 'Cambió su contraseña',
};

export function RepresentantesUI({ pendientes, bandeja, site }: {
  pendientes: Pendiente[]; bandeja: Aviso[]; site: string;
}) {
  const [msg, setMsg] = useState<{ error?: string; success?: string } | null>(null);
  const [links, setLinks] = useState<Record<string, string>>({});
  const [copiado, setCopiado] = useState<string | null>(null);
  const [cargando, startTransition] = useTransition();

  const copiar = async (id: string, texto: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(id);
      setTimeout(() => setCopiado(null), 2500);
    } catch {
      setMsg({ error: 'Tu navegador no dejó copiar. Selecciona el enlace y cópialo a mano.' });
    }
  };

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-extrabold inline-flex items-center gap-2">
          <ShieldCheck className="w-6 h-6 text-brand-600" aria-hidden /> Representantes de menores
        </h1>
        <p className="text-sm text-gray-600">
          Cuando un menor de edad crea su cuenta, queda detenida hasta que su representante autoriza.
          Aquí ves quién está esperando y puedes resolverlo.
        </p>
      </header>

      {msg?.error && <Alert kind="error">{msg.error}</Alert>}
      {msg?.success && <Alert kind="success">{msg.success}</Alert>}

      <section className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 text-sm text-gray-700 space-y-1">
        <p className="font-semibold inline-flex items-center gap-2 text-amber-900">
          <AlertTriangle className="w-4 h-4" aria-hidden /> La app todavía no envía correos
        </p>
        <p>
          Hasta que la iglesia conecte su propio correo de salida, los avisos no salen solos: se guardan
          en la bandeja de abajo. Mientras tanto, la forma práctica de resolver una autorización es
          <b> copiar el enlace y mandárselo al representante por WhatsApp</b>.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-bold">Esperando autorización ({pendientes.length})</h2>

        {pendientes.length === 0 && (
          <div className="card text-sm text-gray-600">
            No hay ningún menor esperando. Cuando alguien menor de edad se registre, aparecerá aquí.
          </div>
        )}

        {pendientes.map((p) => (
          <article key={p.id} className="card space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold">{p.menor}</p>
                <p className="text-sm text-gray-500">{p.email}</p>
              </div>
              <span className={`badge ${p.estado === 'revoked' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'}`}>
                {p.estado === 'revoked' ? 'Permiso retirado' : 'Esperando'}
              </span>
            </div>

            <div className="rounded-lg bg-gray-50 p-3 text-sm space-y-0.5">
              <p className="text-gray-500 text-xs uppercase tracking-wide">Su representante</p>
              <p className="font-medium">{p.representante || '—'}</p>
              <p className="text-gray-600">{p.guardian_email}</p>
              <p className="text-gray-600">{p.guardian_phone}</p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                className="btn-secondary inline-flex items-center gap-2"
                disabled={cargando}
                onClick={() => startTransition(async () => {
                  const r = await adminGuardianLink(p.id);
                  if (r.error) { setMsg({ error: r.error }); return; }
                  setLinks((x) => ({ ...x, [p.id]: r.link! }));
                  setMsg(null);
                })}
              >
                <RefreshCw className="w-4 h-4" aria-hidden />
                {links[p.id] ? 'Generar otro enlace' : 'Generar enlace para WhatsApp'}
              </button>

              <button
                className="btn-secondary"
                disabled={cargando}
                onClick={() => {
                  const motivo = window.prompt(
                    'Autorizar a mano.\n\n¿Con quién hablaste y cómo confirmaste el permiso? Queda registrado.'
                  );
                  if (!motivo) return;
                  startTransition(async () => setMsg(await adminGrantGuardian(p.id, motivo)));
                }}
              >
                Autorizar a mano
              </button>

              {p.estado !== 'revoked' && (
                <button
                  className="btn-secondary !text-red-700 !border-red-200"
                  disabled={cargando}
                  onClick={() => {
                    const motivo = window.prompt('Retirar el permiso.\n\n¿Por qué? Queda registrado.');
                    if (!motivo) return;
                    startTransition(async () => setMsg(await adminRevokeGuardian(p.id, motivo)));
                  }}
                >
                  Retirar permiso
                </button>
              )}
            </div>

            {links[p.id] && (
              <div className="rounded-lg border border-brand-200 bg-brand-50/50 p-3 space-y-2">
                <p className="text-xs text-gray-600">
                  Mándale esto a {p.representante || 'su representante'} ({p.guardian_phone}). Sirve una sola vez.
                </p>
                <p className="text-xs break-all font-mono bg-white rounded p-2 border border-gray-200">
                  {links[p.id]}
                </p>
                <button
                  className="btn-primary inline-flex items-center gap-2"
                  onClick={() => copiar(p.id, links[p.id])}
                >
                  {copiado === p.id
                    ? <><Check className="w-4 h-4" aria-hidden /> Copiado</>
                    : <><Copy className="w-4 h-4" aria-hidden /> Copiar enlace</>}
                </button>
              </div>
            )}
          </article>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="font-bold inline-flex items-center gap-2">
          <Mail className="w-4 h-4 text-gray-500" aria-hidden /> Avisos esperando a que haya correo ({bandeja.length})
        </h2>
        {bandeja.length === 0 ? (
          <div className="card text-sm text-gray-600">No hay avisos pendientes.</div>
        ) : (
          <div className="card divide-y divide-gray-100">
            {bandeja.map((a) => (
              <div key={a.id} className="py-2 first:pt-0 last:pb-0 text-sm">
                <p className="font-medium">{a.subject}</p>
                <p className="text-gray-500 text-xs">
                  Para {a.recipient_name ? `${a.recipient_name} · ` : ''}{a.recipient_email}
                  {' · '}{KINDS[a.kind] ?? a.kind}
                  {' · '}{new Date(a.created_at).toLocaleString('es-US')}
                </p>
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-gray-500">
          Ninguno se pierde: el día que la iglesia conecte su correo, todo esto sale.
        </p>
      </section>
    </div>
  );
}
