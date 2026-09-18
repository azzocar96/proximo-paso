export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="min-h-[40vh] flex items-center justify-center">
      <div className="flex items-center gap-3 text-gray-500 text-sm">
        <span className="inline-block w-5 h-5 rounded-full border-2 border-gray-300 border-t-brand-600 animate-spin" aria-hidden />
        Cargando…
      </div>
    </div>
  );
}
