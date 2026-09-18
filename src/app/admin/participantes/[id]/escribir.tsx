'use client';
import { useState } from 'react';
import { MessageSquarePlus } from 'lucide-react';
import { NuevaConversacion } from '@/app/(app)/mensajes/ui';

// Desde la ficha, el equipo abre un hilo con la persona. Llega a su campana y
// a su bandeja de Mensajes; la respuesta vuelve al mismo hilo.
export function EscribirMensaje({ id, nombre }: { id: string; nombre: string }) {
  const [abierto, setAbierto] = useState(false);
  if (!abierto) {
    return (
      <button onClick={() => setAbierto(true)} className="btn-secondary inline-flex items-center gap-2">
        <MessageSquarePlus className="w-4 h-4" aria-hidden /> Escribir mensaje
      </button>
    );
  }
  return (
    <div className="w-full">
      <NuevaConversacion ministerios={[]} inscrito={false} paraMiembro={{ id, nombre }} onCerrar={() => setAbierto(false)} />
    </div>
  );
}
