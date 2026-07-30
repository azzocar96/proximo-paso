import { requireAdmin } from '@/lib/auth';
import { SettingsForm } from './ui';

export const metadata = { title: 'Configuración' };
export default async function ConfigPage() {
  const { supabase, role } = await requireAdmin();
  const { data: settings } = await supabase.from('app_settings').select('*').order('key');
  return (
    <div className="space-y-5 max-w-3xl">
      <h1 className="text-2xl font-extrabold">Configuración</h1>
      <p className="text-sm text-gray-600">
        Nombre de la iglesia, curso, marca, contacto, política de privacidad, firmas del certificado y reglas del negocio.
        Las claves críticas solo las cambia el superadministrador.
      </p>
      <SettingsForm settings={(settings as any) ?? []} isSuper={role === 'superadmin' || role === 'pastor'} />
    </div>
  );
}
