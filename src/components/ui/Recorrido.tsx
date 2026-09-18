import { Check, Lock, Award } from 'lucide-react';
import type { Progress } from '@/lib/course';

// El curso como un camino: cuatro pasos y el certificado al final. Se lee de
// un vistazo dónde va la persona sin abrir Progreso.
export function Recorrido({ progress }: { progress: Progress }) {
  const pasos = progress.steps.filter((s) => !s.is_certification).slice(0, 4);
  const hoy = new Date().toISOString().slice(0, 10);
  const items = [
    ...pasos.map((s) => ({
      key: `p${s.step}`, label: `Paso ${s.step}`,
      estado: s.attended ? 'hecho' : s.date === hoy && s.status === 'open' ? 'hoy' : s.unlocked ? 'proximo' : 'bloqueado',
    })),
    { key: 'cert', label: 'Certificado', estado: progress.status === 'certified' ? 'hecho' : progress.eligible_for_certificate ? 'hoy' : progress.steps_done >= 4 ? 'proximo' : 'bloqueado' },
  ];
  return (
    <ol className="flex items-start" aria-label="Recorrido del curso">
      {items.map((it, i) => {
        const ultimo = i === items.length - 1;
        const cls = {
          hecho: 'bg-brand-600 text-white ring-brand-100',
          hoy: 'bg-white text-brand-700 ring-brand-600 ring-2 animate-pulse',
          proximo: 'bg-white text-gray-700 ring-gray-300',
          bloqueado: 'bg-gray-100 text-gray-400 ring-gray-100',
        }[it.estado];
        return (
          <li key={it.key} className="flex-1 flex flex-col items-center relative min-w-0">
            {!ultimo && (
              <span aria-hidden className={`absolute top-4 left-1/2 w-full h-0.5 ${it.estado === 'hecho' ? 'bg-brand-600' : 'bg-gray-200'}`} />
            )}
            <span className={`relative z-10 w-8 h-8 rounded-full inline-flex items-center justify-center ring-1 text-xs font-bold ${cls}`}>
              {it.estado === 'hecho' ? <Check className="w-4 h-4" aria-hidden />
                : it.key === 'cert' ? <Award className="w-4 h-4" aria-hidden />
                : it.estado === 'bloqueado' ? <Lock className="w-3.5 h-3.5" aria-hidden />
                : i + 1}
            </span>
            <span className={`mt-1.5 text-[11px] font-medium text-center leading-tight ${it.estado === 'bloqueado' ? 'text-gray-400' : 'text-gray-700'}`}>{it.label}</span>
          </li>
        );
      })}
    </ol>
  );
}
