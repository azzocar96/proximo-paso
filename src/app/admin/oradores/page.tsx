import { requireAdmin } from '@/lib/auth';
import { SpeakersPanel } from './ui';

export const metadata = { title: 'Oradores' };

const STEPS = [1, 2, 3, 4];

export default async function OradoresPage() {
  const { supabase } = await requireAdmin();
  const { data: speakers } = await supabase
    .from('step_speakers')
    // profiles! desambiguado: step_speakers tiene 2 FKs a profiles (user_id y assigned_by)
    .select('*, profiles!step_speakers_user_id_fkey(id,first_name,last_name,email)')
    .order('step_number');
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold">Oradores</h1>
      <p className="text-sm text-gray-600">
        Cada uno de los 4 pasos del curso tiene un orador fijo (no cambia por ciclo). El orador puede
        aprobar o negar asistencia de su paso, junto con el coordinador del ciclo, y verá el muro de su
        paso una vez esté disponible. Solo el administrador o el pastor pueden asignar oradores.
      </p>
      <SpeakersPanel steps={STEPS} speakers={(speakers as any) ?? []} />
    </div>
  );
}
