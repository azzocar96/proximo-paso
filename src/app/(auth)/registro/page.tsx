'use client';
import { useFormState, useFormStatus } from 'react-dom';
import { signUp } from '@/lib/actions/auth';
import { Alert } from '@/components/ui/Alert';
import Link from 'next/link';

function Submit() {
  const { pending } = useFormStatus();
  return <button className="btn-primary w-full" disabled={pending}>{pending ? 'Creando cuenta…' : 'Crear cuenta'}</button>;
}
export default function RegistroPage() {
  const [state, action] = useFormState(signUp, null);
  if (state?.success) return <Alert kind="success">{state.success}</Alert>;
  return (
    <form action={action} className="space-y-4">
      <h2 className="text-xl font-bold">Crear cuenta</h2>
      {state?.error && <Alert kind="error">{state.error}</Alert>}
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label" htmlFor="first_name">Nombre *</label>
          <input className="input" id="first_name" name="first_name" required /></div>
        <div><label className="label" htmlFor="middle_name">Segundo nombre</label>
          <input className="input" id="middle_name" name="middle_name" /></div>
      </div>
      <div><label className="label" htmlFor="last_name">Apellido *</label>
        <input className="input" id="last_name" name="last_name" required /></div>
      <div><label className="label" htmlFor="email">Correo electrónico *</label>
        <input className="input" id="email" name="email" type="email" autoComplete="email" required /></div>
      <div><label className="label" htmlFor="password">Contraseña * (mínimo 8 caracteres)</label>
        <input className="input" id="password" name="password" type="password" minLength={8} autoComplete="new-password" required /></div>
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="privacy_consent" className="mt-1 w-5 h-5" required />
        <span>Acepto la <Link href="/privacidad" target="_blank" className="text-brand-600 underline">política de privacidad</Link> y el uso de mis datos para el curso. *</span>
      </label>
      <Submit />
      <p className="text-sm text-center">¿Ya tienes cuenta? <Link className="text-brand-600 underline" href="/login">Inicia sesión</Link></p>
    </form>
  );
}
