'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { MessageSquare, MessageSquarePlus, Send, X } from 'lucide-react';
import { abrirConversacion } from '@/lib/actions/bandejas';
import { haceCuanto } from '@/lib/utils';
import { Alert } from '@/components/ui/Alert';
import { Avatar, iniciales } from '@/components/ui/Avatar';
import { Vacio } from '@/components/ui/Vacio';

export type Conversacion = {
  id: string; scope: 'church' | 'ministry' | 'step'; subject: string; last_message_at: string;
  closed_at: string | null; soy_la_persona: boolean; con_quien: string; sin_leer: number; ultimo: string | null;
};

function Enviar({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn-primary inline-flex items-center gap-2" disabled={pending}>
      <Send className="w-4 h-4" aria-hidden /> {pending ? 'Enviando…' : label}
    </button>
  );
}

/** Formulario para abrir un hilo. Sin `paraMiembro`, lo abre la propia persona. */
export function NuevaConversacion({ ministerios, inscrito, paraMiembro, onCerrar }: {
  ministerios: { id: string; nombre: string }[]; inscrito: boolean;
  paraMiembro?: { id: string; nombre: string; scope?: 'church' | 'ministry' | 'step'; ministry_id?: string; step_number?: number };
  onCerrar?: () => void;
}) {
  const [state, action] = useFormState(abrirConversacion, null);
  const [destino, setDestino] = useState('church');
  const [ministry, step] = destino.startsWith('ministry:') ? [destino.slice(9), ''] : destino.startsWith('step:') ? ['', destino.slice(5)] : ['', ''];
  const scope = destino.startsWith('ministry:') ? 'ministry' : destino.startsWith('step:') ? 'step' : 'church';
  return (
    <form action={action} className="card space-y-3">
      <div className="flex items-center justify-between">
        <p className="font-semibold">{paraMiembro ? `Escribir a ${paraMiembro.nombre}` : 'Nuevo mensaje'}</p>
        {onCerrar && (
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="text-gray-400 hover:text-gray-700"><X className="w-4 h-4" aria-hidden /></button>
        )}
      </div>
      {state?.error && <Alert kind="error">{state.error}</Alert>}
      {paraMiembro ? (
        <input type="hidden" name="member_id" value={paraMiembro.id} />
      ) : (
        <label className="block text-sm">
          <span className="text-gray-600">¿A quién le escribes?</span>
          <select name="destino" value={destino} onChange={(e) => setDestino(e.target.value)} className="input mt-1">
            <option value="church">A la iglesia</option>
            {ministerios.map((m) => <option key={m.id} value={`ministry:${m.id}`}>A {m.nombre} (mi ministerio)</option>)}
            {inscrito && [1, 2, 3, 4].map((n) => <option key={n} value={`step:${n}`}>Al orador del Paso {n}</option>)}
          </select>
        </label>
      )}
      <input type="hidden" name="scope" value={paraMiembro ? (paraMiembro.scope ?? 'church') : scope} />
      <input type="hidden" name="ministry_id" value={paraMiembro ? (paraMiembro.ministry_id ?? '') : ministry} />
      <input type="hidden" name="step_number" value={paraMiembro ? (paraMiembro.step_number ?? '') : step} />
      <label className="block text-sm">
        <span className="text-gray-600">Asunto</span>
        <input name="subject" required maxLength={140} className="input mt-1" placeholder="En pocas palabras, de qué se trata" />
      </label>
      <label className="block text-sm">
        <span className="text-gray-600">Mensaje</span>
        <textarea name="body" required rows={4} maxLength={4000} className="input mt-1" placeholder="Escribe aquí…" />
      </label>
      <div className="flex justify-end"><Enviar label="Enviar" /></div>
    </form>
  );
}

export function MensajesUI({ conversaciones, ministerios, inscrito, esEquipo = false }: {
  conversaciones: Conversacion[]; ministerios: { id: string; nombre: string }[]; inscrito: boolean; esEquipo?: boolean;
}) {
  const [nuevo, setNuevo] = useState(!esEquipo && conversaciones.length === 0);
  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Mensajes</h1>
          <p className="text-sm text-gray-500">
            {esEquipo ? 'Lo que la gente le escribe a la iglesia. Para escribirle a alguien, ábrelo desde su ficha en Panel admin → Usuarios.'
                      : 'Tu conversación con la iglesia, tu ministerio y los oradores.'}
          </p>
        </div>
        {!nuevo && !esEquipo && (
          <button onClick={() => setNuevo(true)} className="btn-primary inline-flex items-center gap-2 shrink-0">
            <MessageSquarePlus className="w-4 h-4" aria-hidden /> Nuevo
          </button>
        )}
      </div>
      {nuevo && <NuevaConversacion ministerios={ministerios} inscrito={inscrito} onCerrar={conversaciones.length ? () => setNuevo(false) : undefined} />}
      {conversaciones.length === 0 ? (
        !nuevo && <Vacio Icon={MessageSquare} titulo="Sin conversaciones"
          texto={esEquipo ? 'Cuando alguien le escriba a la iglesia, o tú le escribas desde su ficha, el hilo aparece aquí.' : 'Cuando escribas o te escriban, el hilo aparece aquí.'} />
      ) : (
        <ul className="card divide-y divide-gray-100 !p-0 overflow-hidden">
          {conversaciones.map((c) => {
            const [a, b] = c.con_quien.split(' ');
            return (
              <li key={c.id}>
                <Link href={`/mensajes/${c.id}`} className={`flex gap-3 px-4 py-3.5 hover:bg-gray-50 transition-colors ${c.sin_leer ? 'bg-brand-50/40' : ''}`}>
                  <Avatar texto={iniciales(a, b)} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className={`text-sm truncate ${c.sin_leer ? 'font-semibold' : 'font-medium'}`}>{c.con_quien}</p>
                      <span className="text-xs text-gray-400 shrink-0">{haceCuanto(c.last_message_at)}</span>
                    </div>
                    <p className="text-sm text-gray-700 truncate">{c.subject}</p>
                    {c.ultimo && <p className="text-sm text-gray-500 truncate">{c.ultimo}</p>}
                  </div>
                  {c.sin_leer > 0 && (
                    <span className="self-center min-w-[20px] h-5 px-1.5 rounded-full bg-brand-600 text-white text-[11px] font-bold inline-flex items-center justify-center tabular-nums">{c.sin_leer}</span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
