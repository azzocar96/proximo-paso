'use client';
import { useFormState, useFormStatus } from 'react-dom';
import { signIn } from '@/lib/actions/auth';
import { Alert } from '@/components/ui/Alert';
import Link from 'next/link';

function Submit() {
  const { pending } = useFormStatus();
  return <button className="btn-primary w-full" disabled={pending}>{pending ? 'Entrando…' : 'Iniciar sesión'}</button>;
}
export default function LoginPage() {
  const [state, action] = useFormState(signIn, null);
  return (
    <form action={action} className="space-y-4">
      <h2 className="text-xl font-bold">Iniciar sesión</h2>
      {state?.error && <Alert kind="error">{state.error}</Alert>}
      <div><label className="label" htmlFor="email">Correo electrónico</label>
        <input className="input" id="email" name="email" type="email" autoComplete="email" required /></div>
      <div><label className="label" htmlFor="password">Contraseña</label>
        <input className="input" id="password" name="password" type="password" autoComplete="current-password" required /></div>
      <Submit />
      <div className="text-sm text-center space-y-1">
        <p><Link className="text-brand-600 underline" href="/recuperar">Olvidé mi contraseña</Link></p>
        <p>¿No tienes cuenta? <Link className="text-brand-600 underline" href="/registro">Regístrate</Link></p>
      </div>
    </form>
  );
}
