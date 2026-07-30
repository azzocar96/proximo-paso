import Link from 'next/link';
import { GraduationCap } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { fmtDate, CERT_LABEL } from '@/lib/utils';
import { StatusBadge } from '@/components/ui/StatusBadge';

export const metadata = { title: 'Mi certificado' };
export default async function CertificadoPage() {
  const { supabase, user } = await requireUser();
  const { data: cert } = await supabase.from('certificates').select('*')
    .eq('user_id', user.id).order('created_at', { ascending: false }).limit(1).maybeSingle();

  if (!cert) {
    return (
      <div className="card text-center space-y-3">
        <span className="mx-auto flex items-center justify-center w-14 h-14 rounded-2xl bg-brand-50 text-brand-600"><GraduationCap className="w-7 h-7" aria-hidden /></span>
        <h1 className="font-bold text-lg">Aún no tienes certificado</h1>
        <p className="text-sm text-gray-600">Completa los 4 pasos, el test y el formulario Dream Team para obtenerlo.</p>
        <Link href="/progreso" className="btn-primary">Ver mi progreso</Link>
      </div>
    );
  }
  const downloadable = ['issued', 'physical_pending', 'ready_for_pickup', 'delivered'].includes(cert.status);
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? '';
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold">Mi certificado</h1>
      <div className="card space-y-3 text-center">
        <span className="mx-auto flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-600 to-brand-500 text-white shadow-[0_8px_24px_rgb(254_71_3/0.3)]"><GraduationCap className="w-8 h-8" aria-hidden /></span>
        <h2 className="text-xl font-bold">{cert.course_name}</h2>
        <p className="text-gray-600">{cert.full_name}</p>
        <p className="text-sm text-gray-500">{cert.church_name}{cert.completion_date ? ` · ${fmtDate(cert.completion_date)}` : ''}</p>
        <StatusBadge status={cert.status} label={CERT_LABEL[cert.status]} />
        {cert.status === 'eligible' && <p className="text-sm text-amber-700">Tu certificado está en proceso de aprobación por la iglesia.</p>}
        {cert.status === 'pending_approval' && <p className="text-sm text-amber-700">Tu certificado está pendiente de aprobación final.</p>}
        {cert.status === 'revoked' && <p className="text-sm text-red-700">Este certificado fue revocado. Contacta a la iglesia si crees que es un error.</p>}
        {downloadable && (
          <a href={`/api/certificados/${cert.id}/pdf`} className="btn-primary w-full">Descargar PDF</a>
        )}
        <p className="text-xs text-gray-400 break-all">
          Código de verificación: <b>{cert.verify_code}</b><br />
          Cualquier persona puede verificarlo en {site}/verificar
        </p>
      </div>
    </div>
  );
}
