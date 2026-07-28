export function Alert({ kind = 'info', children }: { kind?: 'info' | 'success' | 'error' | 'warn'; children: React.ReactNode }) {
  const styles = {
    info: 'bg-blue-50 text-blue-800 border-blue-200',
    success: 'bg-green-50 text-green-800 border-green-200',
    error: 'bg-red-50 text-red-800 border-red-200',
    warn: 'bg-amber-50 text-amber-800 border-amber-200',
  }[kind];
  return <div role="alert" className={`rounded-xl border px-4 py-3 text-sm font-medium ${styles}`}>{children}</div>;
}
