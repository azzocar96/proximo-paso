import { getCapabilities } from '@/lib/capabilities';
import { getSettings } from '@/lib/settings';
import { RecuperarForm } from './ui';

export const metadata = { title: 'Recuperar contraseña' };
export const dynamic = 'force-dynamic';

export default async function RecuperarPage() {
  const caps = await getCapabilities();
  const s = await getSettings(['church_contact']);
  const c = (s.church_contact ?? {}) as { email?: string; phone?: string };
  const contacto = [c.email, c.phone].filter(Boolean).join(' o ') || 'la iglesia';
  return <RecuperarForm correoListo={caps.email_outbound} contacto={contacto} />;
}
