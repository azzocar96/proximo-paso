'use client';
import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Send } from 'lucide-react';
import { responderConversacion } from '@/lib/actions/bandejas';
import { createClient } from '@/lib/supabase/client';
import { Alert } from '@/components/ui/Alert';
import { Avatar, iniciales } from '@/components/ui/Avatar';

export type Hilo = {
  id: string; scope: string; subject: string; closed_at: string | null; soy_la_persona: boolean; con_quien: string;
  mensajes: { id: string; body: string; created_at: string; mio: boolean; de: string; lado_persona: boolean }[];
};

function Enviar() {
  const { pending } = useFormStatus();
  return (
    <button className="btn-primary inline-flex items-center gap-2 shrink-0" disabled={pending} aria-label="Enviar">
      <Send className="w-4 h-4" aria-hidden /><span className="hidden sm:inline">{pending ? 'Enviando…' : 'Enviar'}</span>
    </button>
  );
}

export function HiloUI({ hilo, userId }: { hilo: Hilo; userId: string }) {
  const [state, action] = useFormState(responderConversacion, null);
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const finRef = useRef<HTMLDivElement>(null);

  useEffect(() => { finRef.current?.scrollIntoView({ block: 'end' }); }, [hilo.mensajes.length]);
  useEffect(() => { if (state?.success) formRef.current?.reset(); }, [state]);

  // Si el otro lado responde mientras miro, la pantalla se actualiza sola.
  useEffect(() => {
    const supabase = createClient();
    const canal = supabase.channel(`hilo-${hilo.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${hilo.id}` },
        (p) => { if ((p.new as { sender_id?: string }).sender_id !== userId) router.refresh(); })
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, [hilo.id, userId, router]);

  const [a, b] = hilo.con_quien.split(' ');
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/mensajes" aria-label="Volver a mensajes" className="w-9 h-9 inline-flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-600">
          <ArrowLeft className="w-5 h-5" aria-hidden />
        </Link>
        <Avatar texto={iniciales(a, b)} />
        <div className="min-w-0">
          <p className="font-semibold truncate">{hilo.con_quien}</p>
          <p className="text-sm text-gray-500 truncate">{hilo.subject}</p>
        </div>
      </div>

      <ol className="space-y-2">
        {hilo.mensajes.map((m) => (
          <li key={m.id} className={`flex ${m.mio ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm shadow-[0_1px_2px_rgb(0_0_0/0.04)] ${
              m.mio ? 'bg-brand-600 text-white rounded-br-md' : 'bg-white border border-gray-200/80 rounded-bl-md'}`}>
              {!m.mio && <p className="text-[11px] font-semibold text-brand-700 mb-0.5">{m.de}</p>}
              <p className="whitespace-pre-wrap break-words">{m.body}</p>
              <p className={`text-[10px] mt-1 ${m.mio ? 'text-brand-100' : 'text-gray-400'}`}>
                {new Date(m.created_at).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </li>
        ))}
        <div ref={finRef} />
      </ol>

      {hilo.closed_at ? (
        <Alert kind="info">Esta conversación está cerrada.</Alert>
      ) : (
        <form ref={formRef} action={action} className="card !p-3 sticky bottom-20 md:bottom-4 space-y-2">
          {state?.error && <Alert kind="error">{state.error}</Alert>}
          <input type="hidden" name="conversation_id" value={hilo.id} />
          <div className="flex gap-2 items-end">
            <textarea name="body" required rows={2} maxLength={4000} className="input resize-none" placeholder="Escribe tu respuesta…" aria-label="Respuesta" />
            <Enviar />
          </div>
        </form>
      )}
    </div>
  );
}
