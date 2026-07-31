import Link from 'next/link';
import { Cake, Megaphone, ArrowRight, User } from 'lucide-react';

type Birthday = { nombre: string; foto?: string | null; dia: number; mes: number; faltan: number };
type News = { id: string; title: string; content: string; publish_at: string };

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function cuando(faltan: number, dia: number, mes: number): string {
  if (faltan === 0) return '¡hoy!';
  if (faltan === 1) return 'mañana';
  return `el ${dia} de ${MESES[mes - 1] ?? ''}`;
}

/**
 * Novedades de la semana: lo último de la iglesia y los cumpleaños próximos,
 * en una sola tarjeta arriba del muro general.
 * Privacidad: de la fecha de nacimiento solo se usan el día y el mes. Nunca el
 * año ni la edad, y quien no quiera aparecer se oculta desde su perfil.
 */
export function Novedades({ birthdays, news }: { birthdays: Birthday[]; news: News[] }) {
  if (birthdays.length === 0 && news.length === 0) return null;
  return (
    <section className="card space-y-4 border-brand-200/60 bg-gradient-to-br from-brand-50/60 to-white">
      <h2 className="text-[11px] font-bold text-brand-600 uppercase tracking-widest">Novedades de la semana</h2>

      {news.length > 0 && (
        <div className="space-y-2">
          {news.map((n) => (
            <article key={n.id} className="flex gap-3">
              <Megaphone className="w-4 h-4 text-brand-600 shrink-0 mt-0.5" aria-hidden />
              <div className="min-w-0">
                <p className="font-semibold text-sm">{n.title}</p>
                <p className="text-sm text-gray-600 line-clamp-2">{n.content}</p>
              </div>
            </article>
          ))}
          <Link href="/anuncios" className="text-xs text-brand-700 font-medium inline-flex items-center gap-1 hover:underline">
            Ver todos los anuncios <ArrowRight className="w-3 h-3" aria-hidden />
          </Link>
        </div>
      )}

      {birthdays.length > 0 && (
        <div className={news.length > 0 ? 'pt-3 border-t border-brand-100' : ''}>
          <p className="text-sm font-semibold inline-flex items-center gap-2 mb-2">
            <Cake className="w-4 h-4 text-brand-600" aria-hidden />
            {birthdays.length === 1 ? 'Cumpleaños' : 'Cumpleaños de esta semana'}
          </p>
          <ul className="space-y-2">
            {birthdays.map((b, i) => (
              <li key={`${b.nombre}-${i}`} className="flex items-center gap-2.5 text-sm">
                {b.foto
                  ? <img src={b.foto} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                  : <span className="w-8 h-8 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center shrink-0"><User className="w-4 h-4" aria-hidden /></span>}
                <span className="min-w-0">
                  <b className="font-semibold">{b.nombre}</b>{' '}
                  <span className={b.faltan === 0 ? 'text-brand-700 font-semibold' : 'text-gray-500'}>
                    cumple {cuando(b.faltan, b.dia, b.mes)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-gray-500 mt-2">Escríbeles en el muro para felicitarlos.</p>
        </div>
      )}
    </section>
  );
}
