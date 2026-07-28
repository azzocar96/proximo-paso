import { requireAdmin } from '@/lib/auth';
import { AnnouncementForm, AnnouncementList } from './ui';

export const metadata = { title: 'Anuncios' };
export default async function AnunciosAdminPage() {
  const { supabase } = await requireAdmin();
  const [{ data: anns }, { data: cycles }, { data: ministries }] = await Promise.all([
    supabase.from('announcements').select('*').is('deleted_at', null).order('publish_at', { ascending: false }).limit(100),
    supabase.from('course_cycles').select('id,name').is('deleted_at', null).order('created_at', { ascending: false }),
    supabase.from('ministries').select('id,name').is('deleted_at', null).order('name'),
  ]);
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold">Anuncios</h1>
      <details className="card" open={(anns ?? []).length === 0}>
        <summary className="cursor-pointer font-semibold text-brand-600">+ Nuevo anuncio</summary>
        <div className="pt-3"><AnnouncementForm cycles={cycles ?? []} ministries={ministries ?? []} /></div>
      </details>
      <AnnouncementList anns={(anns as any) ?? []} cycles={cycles ?? []} ministries={ministries ?? []} />
    </div>
  );
}
