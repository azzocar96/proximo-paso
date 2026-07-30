import { requireAdmin } from '@/lib/auth';
import { CertTable, AutoApproveToggle } from './ui';
import { getSettings } from '@/lib/settings';

export const metadata = { title: 'Certificados' };
export default async function CertificadosPage() {
  const { supabase, role } = await requireAdmin();
  const { data: certs } = await supabase.from('certificates')
    .select('*, profiles!certificates_user_id_fkey(first_name,last_name,email), enrollments(cycle_id, course_cycles(name))')
    .order('created_at', { ascending: false }).limit(200);
  const s = await getSettings(['certificate_auto_approve']);
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold">Certificados</h1>
      {(role === 'superadmin' || role === 'pastor') && <AutoApproveToggle current={s.certificate_auto_approve === true || s.certificate_auto_approve === 'true'} />}
      <CertTable certs={(certs as any) ?? []} />
    </div>
  );
}
