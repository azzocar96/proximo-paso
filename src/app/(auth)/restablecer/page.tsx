'use client';
import { useFormState, useFormStatus } from 'react-dom';
import { updatePassword } from '@/lib/actions/auth';
import { Alert } from '@/components/ui/Alert';

function Submit() {
  const { pending } = useFormStatus();
  return <button className="btn-primary w-full" disabled={pending}>{pending ? 'Guardando…' : 'Guardar contraseña'}</button>;
}
export default function RestablecerPage() {
  const [state, action] = useFormState(updatePassword, null);
  return (
    <form action={action} className="space-y-4">
      <h2 className="text-xl font-bold">Nueva contraseña</h2>
      {state?.error && <Alert kind="error">{state.error}</Alert>}
      <div><label className="label" htmlFor="password">Nueva contraseña</label>
        <input className="input" id="password" name="password" type="password" minLength={8} required /></div>
      <div><label className="label" htmlFor="confirm">Confirmar contraseña</label>
        <input className="input" id="confirm" name="confirm" type="password" minLength={8} required /></div>
      <Submit />
    </form>
  );
}
