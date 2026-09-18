'use client';
import Link from 'next/link';
import { useEffect, useMemo } from 'react';
import {
  Bell, BellOff, CalendarCheck, ScanLine, Inbox, HeartHandshake, Award, Megaphone,
  ShieldCheck, MessageCircle, BadgeCheck, Mic, MessageSquare, type LucideIcon,
} from 'lucide-react';
import { marcarNotificacionesLeidas } from '@/lib/actions/bandejas';
import { haceCuanto } from '@/lib/utils';
import { Vacio } from '@/components/ui/Vacio';

export type Notificacion = {
  id: string; kind: string; title: string; body: string | null; link: string | null;
  read_at: string | null; created_at: string;
};

const ICONO: Record<string, LucideIcon> = {
  enrollment: CalendarCheck, attendance: ScanLine, request_new: Inbox, request_accepted: Inbox,
  request_rejected: Inbox, ministry: HeartHandshake, certificate: Award, announcement: Megaphone,
  guardian: ShieldCheck, comment: MessageCircle, role: BadgeCheck, speaker: Mic, message: MessageSquare,
};

export function NotificacionesUI({ items }: { items: Notificacion[] }) {
  const sinLeer = useMemo(() => items.filter((n) => !n.read_at).length, [items]);
  // Abrir la pantalla ya cuenta como "visto": el contador se limpia solo. Lo
  // que no se ha leído sigue marcado en la lista hasta que se recargue.
  useEffect(() => { if (sinLeer > 0) void marcarNotificacionesLeidas(); }, [sinLeer]);

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Notificaciones</h1>
          <p className="text-sm text-gray-500">{sinLeer > 0 ? `${sinLeer} sin leer` : 'Estás al día.'}</p>
        </div>
      </div>
      {items.length === 0 ? (
        <Vacio Icon={BellOff} titulo="Todavía no hay avisos"
          texto="Aquí te avisamos cuando quedes inscrito, cuando se registre tu asistencia, cuando respondan una solicitud tuya y cuando haya algo nuevo para ti." />
      ) : (
        <ul className="card divide-y divide-gray-100 !p-0 overflow-hidden">
          {items.map((n) => {
            const Icon = ICONO[n.kind] ?? Bell;
            const nuevo = !n.read_at;
            const inner = (
              <div className={`flex gap-3 px-4 py-3.5 ${nuevo ? 'bg-brand-50/40' : ''} ${n.link ? 'hover:bg-gray-50' : ''} transition-colors`}>
                <span className={`mt-0.5 w-9 h-9 shrink-0 rounded-full inline-flex items-center justify-center ${nuevo ? 'bg-brand-100 text-brand-700' : 'bg-gray-100 text-gray-500'}`}>
                  <Icon className="w-4 h-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm leading-snug ${nuevo ? 'font-semibold text-gray-900' : 'font-medium text-gray-800'}`}>{n.title}</p>
                  {n.body && <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{n.body}</p>}
                  <p className="text-xs text-gray-400 mt-1">{haceCuanto(n.created_at)}</p>
                </div>
                {nuevo && <span aria-label="Sin leer" className="mt-2 w-2 h-2 rounded-full bg-brand-600 shrink-0" />}
              </div>
            );
            return (
              <li key={n.id}>
                {n.link ? <Link href={n.link} className="block">{inner}</Link> : inner}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
