import { requireAdmin } from '@/lib/auth';
import { SettingsForm } from './ui';
import { vigilar } from '@/lib/supabase/vigilar';

export const metadata = { title: 'Configuración' };
export default async function ConfigPage() {
  const { supabase, role } = await requireAdmin();
  const { data: settings } = await vigilar('app/admin/configuracion/app_settings', supabase.from('app_settings').select('*').order('key'));
  return (
    <div className="space-y-5 max-w-3xl">
      <h1 className="text-2xl font-extrabold">Configuración</h1>
      <p className="text-sm text-gray-600">
        Nombre de la iglesia, curso, marca, contacto, política de privacidad, firmas del certificado y reglas del negocio.
        Las claves críticas solo las cambia el administrador o el pastor.
      </p>
      <SettingsForm settings={settings ?? []} isSuper={role === 'superadmin' || role === 'pastor'} />
    </div>
  );
}
