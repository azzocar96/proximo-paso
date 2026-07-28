'use client';
import { useFormState, useFormStatus } from 'react-dom';
import { sendContact } from '@/lib/actions/course';
import { Alert } from '@/components/ui/Alert';

function Submit() {
  const { pending } = useFormStatus();
  return <button className="btn-primary w-full" disabled={pending}>{pending ? 'Enviando…' : 'Enviar mensaje'}</button>;
}
export function ContactForm({ defaultName, defaultEmail }: { defaultName: string; defaultEmail: string }) {
  const [state, action] = useFormState(sendContact, null);
  if (state?.success) return <Alert kind="success">{state.success}</Alert>;
  return (
    <form action={action} className="card space-y-4">
      {state?.error && <Alert kind="error">{state.error}</Alert>}
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">Nombre</label><input className="input" name="name" defaultValue={defaultName} required /></div>
        <div><label className="label">Correo</label><input className="input" type="email" name="email" defaultValue={defaultEmail} required /></div>
      </div>
      <div>
        <label className="label">Categoría</label>
        <select className="input" name="category" defaultValue="general">
          <option value="general">General</option>
          <option value="curso">Sobre el curso</option>
          <option value="asistencia">Problema con asistencia</option>
          <option value="certificado">Certificado</option>
          <option value="ministerio">Ministerios</option>
          <option value="otro">Otro</option>
        </select>
      </div>
      <div><label className="label">Mensaje</label><textarea className="input min-h-28" name="message" required minLength={10} /></div>
      <Submit />
    </form>
  );
}
