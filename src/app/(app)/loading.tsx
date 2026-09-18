// Esqueleto de la pantalla en vez de un "Cargando…": la persona ve la forma
// de lo que viene y la espera se siente más corta.
export default function Loading() {
  return (
    <div role="status" aria-live="polite" aria-label="Cargando" className="space-y-5 animate-pulse">
      <div className="space-y-2">
        <div className="h-7 w-48 rounded-lg bg-gray-200" />
        <div className="h-4 w-64 rounded bg-gray-100" />
      </div>
      <div className="card space-y-3">
        <div className="h-4 w-1/3 rounded bg-gray-200" />
        <div className="h-3 w-full rounded bg-gray-100" />
        <div className="h-3 w-5/6 rounded bg-gray-100" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="card h-24" />
        <div className="card h-24" />
      </div>
      <div className="card space-y-3">
        <div className="h-4 w-1/4 rounded bg-gray-200" />
        <div className="h-3 w-full rounded bg-gray-100" />
        <div className="h-3 w-2/3 rounded bg-gray-100" />
      </div>
    </div>
  );
}
