'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useFormState, useFormStatus } from 'react-dom';
import { changePassword } from '@/lib/actions/auth';
import { Alert } from '@/components/ui/Alert';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button className="btn-primary w-full" disabled={pending}>
      {pending ? 'Guardando…' : 'Guardar y entrar'}
    </button>
  );
}

export function CambiarClaveForm({ nombre }: { nombre: string }) {
  const [state, action] = useFormState(changePassword, null);
  const router = useRouter();

  // Al cambiarla, la marca se apaga en la base. Refrescamos para que el
  // middleware deje pasar y caiga en su inicio.
  useEffect(() => {
    if (state?.success) {
      router.replace('/inicio');
      router.refresh();
    }
  }, [state?.success, router]);

  return (
    <form action={action} className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">Hola, {nombre}</h2>
        <p className="text-sm text-gray-600 mt-1">
          Entraste con una contraseña temporal. Antes de seguir, ponle una que
          solo sepas tú.
        </p>
      </div>

      {state?.error && <Alert kind="error">{state.error}</Alert>}
      {state?.success && <Alert kind="success">Listo. Entrando…</Alert>}

      <div>
        <label className="label" htmlFor="current_password">Contraseña temporal</label>
        <input className="input" id="current_password" name="current_password" type="password" required />
        <p className="text-xs text-gray-500 mt-1">Es la que te pasaron para entrar.</p>
      </div>
      <div>
        <label className="label" htmlFor="password">Contraseña nueva</label>
        <input className="input" id="password" name="password" type="password" minLength={8} required />
        <p className="text-xs text-gray-500 mt-1">Al menos 8 caracteres.</p>
      </div>
      <div>
        <label className="label" htmlFor="confirm">Repite la nueva</label>
        <input className="input" id="confirm" name="confirm" type="password" minLength={8} required />
      </div>

      <Submit />
    </form>
  );
}
