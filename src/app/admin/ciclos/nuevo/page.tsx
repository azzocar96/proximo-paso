import { requireAdmin } from '@/lib/auth';
import { CycleForm } from '../form';

export const metadata = { title: 'Nuevo ciclo' };
export default async function NuevoCicloPage() {
  await requireAdmin();
  return (
    <div className="space-y-5 max-w-3xl">
      <h1 className="text-2xl font-extrabold">Nuevo ciclo</h1>
      <p className="text-sm text-gray-600">Al crearlo se generan automáticamente las 4 sesiones (Paso 1–4) para que les asignes fecha manualmente.</p>
      <CycleForm />
    </div>
  );
}
