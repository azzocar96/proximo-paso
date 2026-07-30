import { requireUser } from '@/lib/auth';
import { getSettings } from '@/lib/settings';
import { ContactForm } from './ui';

export const metadata = { title: 'Contacto' };
export default async function ContactoPage() {
  const { supabase, user } = await requireUser();
  const { data: profile } = await supabase.from('profiles').select('first_name,last_name,email').eq('id', user.id).single();
  const s = await getSettings(['church_contact']);
  const contact = (s.church_contact ?? {}) as { phone?: string; email?: string };
  const { data: mine } = await supabase.from('contact_requests').select('id,category,message,status,created_at')
    .eq('user_id', user.id).order('created_at', { ascending: false }).limit(10);
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold">Contactar a la iglesia</h1>
      {(contact.phone || contact.email) && (
        <div className="card text-sm text-gray-600">
          {contact.phone && <p>{contact.phone}</p>}
          {contact.email && <p>{contact.email}</p>}
        </div>
      )}
      <ContactForm defaultName={`${profile?.first_name ?? ''} ${profile?.last_name ?? ''}`.trim()} defaultEmail={profile?.email ?? ''} />
      {(mine ?? []).length > 0 && (
        <section className="space-y-2">
          <h2 className="font-bold text-sm text-gray-500">Tus mensajes anteriores</h2>
          {(mine ?? []).map((m) => (
            <div key={m.id} className="card !p-3 text-sm flex justify-between gap-3">
              <span className="line-clamp-1">{m.message}</span>
              <span className="badge bg-gray-100 text-gray-600 shrink-0">{{ new: 'Enviado', in_progress: 'En proceso', resolved: 'Resuelto', closed: 'Cerrado' }[m.status as string] ?? m.status}</span>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
