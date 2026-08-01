'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { UserPlus } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { addMinistryMember } from '@/lib/actions/ministry';

/**
 * Fase 3g — el servidor con permiso para sumar personas.
 * La autorización real la hace add_ministry_member (migración 019): aquí solo
 * se pinta el formulario a quien ya tiene el permiso.
 */
export function ServantAddMember({ ministries }: { ministries: { id: string; name: string }[] }) {
  const [msg, setMsg] = useState<{ error?: string; success?: string } | null>(null);
  const [mid, setMid] = useState(ministries.length === 1 ? ministries[0].id : '');
  const [email, setEmail] = useState('');
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <section className="card space-y-3">
      <h2 className="font-bold inline-flex items-center gap-2">
        <UserPlus className="w-4 h-4 text-brand-600" aria-hidden /> Sumar a alguien al equipo
      </h2>
      <p className="text-xs text-gray-500">
        Solo miembros activos. Si la persona completó el curso pero no aparece, tiene que pedirlo desde su
        perfil y que se lo confirmen.
      </p>
      {msg?.error && <Alert kind="error">{msg.error}</Alert>}
      {msg?.success && <Alert kind="success">{msg.success}</Alert>}
      {ministries.length > 1 && (
        <div>
          <label className="label" htmlFor="srv-min">Ministerio</label>
          <select className="input" id="srv-min" value={mid} onChange={(e) => setMid(e.target.value)}>
            <option value="" disabled>Elige el ministerio…</option>
            {ministries.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
      )}
      <div>
        <label className="label" htmlFor="srv-mail">Correo de la persona</label>
        <input className="input" id="srv-mail" type="email" value={email}
          onChange={(e) => setEmail(e.target.value)} placeholder="correo@ejemplo.com" />
      </div>
      <button className="btn-primary !py-2 text-sm" disabled={pending || !mid || !email}
        onClick={() => start(async () => {
          const r = await addMinistryMember(mid, email);
          setMsg(r); if (r?.success) setEmail('');
          router.refresh();
        })}>
        {pending ? 'Sumando…' : 'Sumar al equipo'}
      </button>
    </section>
  );
}
