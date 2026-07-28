'use client';
import { useState, useTransition } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import { saveAnnouncement, deleteAnnouncement } from '@/lib/actions/admin';
import { Alert } from '@/components/ui/Alert';
import { fmtDate } from '@/lib/utils';

const AUD_LABEL: Record<string, string> = {
  all: 'Todos', cycle: 'Un ciclo', ministry: 'Un ministerio', role: 'Un rol', certified: 'Certificados',
};
function Submit() {
  const { pending } = useFormStatus();
  return <button className="btn-primary !py-2" disabled={pending}>{pending ? 'Guardando…' : 'Guardar anuncio'}</button>;
}

export function AnnouncementForm({ ann, cycles, ministries }: { ann?: any; cycles: any[]; ministries: any[] }) {
  const action = saveAnnouncement.bind(null, ann?.id ?? null);
  const [state, formAction] = useFormState(action, null);
  const [aud, setAud] = useState(ann?.audience ?? 'all');
  const dt = (v?: string | null) => (v ? new Date(v).toISOString().slice(0, 16) : '');
  return (
    <form action={formAction} className="space-y-3 text-sm">
      {state?.error && <Alert kind="error">{state.error}</Alert>}
      {state?.success && <Alert kind="success">{state.success}</Alert>}
      <div><label className="label">Título *</label><input className="input" name="title" defaultValue={ann?.title ?? ''} required /></div>
      <div><label className="label">Contenido *</label><textarea className="input min-h-24" name="content" defaultValue={ann?.content ?? ''} required /></div>
      <div className="grid md:grid-cols-3 gap-3">
        <div><label className="label">Audiencia</label>
          <select className="input" name="audience" value={aud} onChange={(e) => setAud(e.target.value)}>
            {Object.entries(AUD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select></div>
        {aud === 'cycle' && <div><label className="label">Ciclo</label>
          <select className="input" name="cycle_id" defaultValue={ann?.cycle_id ?? ''}>
            {cycles.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select></div>}
        {aud === 'ministry' && <div><label className="label">Ministerio</label>
          <select className="input" name="ministry_id" defaultValue={ann?.ministry_id ?? ''}>
            {ministries.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select></div>}
        {aud === 'role' && <div><label className="label">Rol</label>
          <select className="input" name="role" defaultValue={ann?.role ?? 'participant'}>
            <option value="participant">Participantes</option><option value="coordinator">Coordinadores</option>
            <option value="admin">Administradores</option>
          </select></div>}
        <div><label className="label">Prioridad (0–10)</label><input className="input" type="number" name="priority" min={0} max={10} defaultValue={ann?.priority ?? 0} /></div>
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        <div><label className="label">Publicar desde</label><input className="input" type="datetime-local" name="publish_at" defaultValue={dt(ann?.publish_at)} /></div>
        <div><label className="label">Expira</label><input className="input" type="datetime-local" name="expires_at" defaultValue={dt(ann?.expires_at)} /></div>
      </div>
      <Submit />
    </form>
  );
}

export function AnnouncementList({ anns, cycles, ministries }: { anns: any[]; cycles: any[]; ministries: any[] }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="space-y-3">
      {anns.map((a) => (
        <details key={a.id} className="card">
          <summary className="cursor-pointer flex justify-between items-center">
            <span className="font-semibold">{a.title} <span className="badge bg-gray-100 text-gray-600">{AUD_LABEL[a.audience]}</span></span>
            <span className="flex items-center gap-3 text-xs text-gray-400">
              {fmtDate(a.publish_at)}
              <button className="text-red-600 underline" disabled={pending}
                onClick={(e) => { e.preventDefault(); if (confirm('¿Eliminar anuncio?')) start(async () => { await deleteAnnouncement(a.id); router.refresh(); }); }}>Eliminar</button>
            </span>
          </summary>
          <div className="pt-3"><AnnouncementForm ann={a} cycles={cycles} ministries={ministries} /></div>
        </details>
      ))}
      {anns.length === 0 && <p className="card text-sm text-gray-500">Sin anuncios.</p>}
    </div>
  );
}
