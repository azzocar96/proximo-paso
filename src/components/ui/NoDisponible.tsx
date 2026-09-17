import { PlugZap } from 'lucide-react';

/**
 * "Todavía no, y por esto."
 *
 * Esta plataforma va a migrar a su propio dominio y a las herramientas de la
 * organización que la reciba. Hasta entonces hay piezas que dependen de algo
 * que aún no está conectado. Cuando eso pasa, la persona tiene derecho a
 * saberlo en el momento —no a pulsar un botón y quedarse mirando— y a que le
 * digamos qué hacer mientras tanto.
 */
export function NoDisponible({
  titulo = 'Esto todavía no está disponible',
  motivo,
  mientrasTanto,
}: {
  titulo?: string;
  motivo: string;
  mientrasTanto?: string;
}) {
  return (
    <div role="status" className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 space-y-2">
      <p className="font-semibold text-amber-900 inline-flex items-center gap-2">
        <PlugZap className="w-4 h-4 shrink-0" aria-hidden /> {titulo}
      </p>
      <p className="text-sm text-gray-700">{motivo}</p>
      {mientrasTanto && (
        <p className="text-sm text-gray-700">
          <span className="font-medium">Mientras tanto: </span>{mientrasTanto}
        </p>
      )}
    </div>
  );
}
