import { requireAdmin } from '@/lib/auth';
import { ContactAdmin } from './ui';

export const metadata = { title: 'Mensajes' };
export default async function ContactoAdminPage() {
  const { supabase } = await requireAdmin();
  const { data: reqs } = await supabase.from('contact_requests')
    .select('*').order('created_at', { ascending: false }).limit(200);
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold">Mensajes de contacto</h1>
      <ContactAdmin reqs={(reqs as any) ?? []} />
    </div>
  );
}
