'use client';
import { useFormState, useFormStatus } from 'react-dom';
import { requestPasswordReset } from '@/lib/actions/auth';
import { Alert } from '@/components/ui/Alert';
import Link from 'next/link';

function Submit() {
  const { pending } = useFormStatus();
  return <button className="btn-primary w-full" disabled={pending}>{pending ? 'Enviando…' : 'Enviar enlace'}</button>;
}
export default function RecuperarPage() {
  const [state, action] = useFormState(requestPasswordReset, null);
  return (
    <form action={action} className="space-y-4">
      <h2 className="text-xl font-bold">Recuperar contraseña</h2>
      <p className="text-sm text-gray-600">Te enviaremos un enlace a tu correo para crear una nueva contraseña.</p>
      {state?.error && <Alert kind="error">{state.error}</Alert>}
      {state?.success && <Alert kind="success">{state.success}</Alert>}
      <div><label className="label" htmlFor="email">Correo electrónico</label>
        <input className="input" id="email" name="email" type="email" required /></div>
      <Submit />
      <p className="text-sm text-center"><Link className="text-brand-600 underline" href="/login">Volver a iniciar sesión</Link></p>
    </form>
  );
}
