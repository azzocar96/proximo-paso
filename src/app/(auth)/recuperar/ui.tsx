'use client';
import { useFormState, useFormStatus } from 'react-dom';
import { requestPasswordReset } from '@/lib/actions/auth';
import { Alert } from '@/components/ui/Alert';
import { NoDisponible } from '@/components/ui/NoDisponible';
import Link from 'next/link';

function Submit() {
  const { pending } = useFormStatus();
  return <button className="btn-primary w-full" disabled={pending}>{pending ? 'Enviando…' : 'Enviar enlace'}</button>;
}
export function RecuperarForm({ correoListo, contacto }: { correoListo: boolean; contacto: string }) {
  const [state, action] = useFormState(requestPasswordReset, null);
  return (
    <form action={action} className="space-y-4">
      <h2 className="text-xl font-bold">Recuperar contraseña</h2>
      {correoListo ? (
        <p className="text-sm text-gray-600">Te enviaremos un enlace a tu correo para crear una nueva contraseña.</p>
      ) : (
        <NoDisponible
          titulo="Todavía no podemos enviarte el correo"
          motivo="La iglesia aún no tiene conectado su correo de salida, así que el enlace para crear una contraseña nueva no saldría de aquí. No queremos hacerte esperar algo que no va a llegar."
          mientrasTanto={`escríbenos a ${contacto} y te devolvemos el acceso en el momento. Somos personas, no un robot: te atendemos.`}
        />
      )}
      {state?.error && <Alert kind="error">{state.error}</Alert>}
      {state?.success && <Alert kind="success">{state.success}</Alert>}
      {correoListo && (
        <>
          <div><label className="label" htmlFor="email">Correo electrónico</label>
            <input className="input" id="email" name="email" type="email" required /></div>
          <Submit />
        </>
      )}
      <p className="text-sm text-center"><Link className="text-brand-600 underline" href="/login">Volver a iniciar sesión</Link></p>
    </form>
  );
}
