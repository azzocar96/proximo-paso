'use client';
import { useState, useTransition } from 'react';
import { ShieldCheck, Bell, MapPin, Lock } from 'lucide-react';
import { authorizeGuardian } from '@/lib/actions/guardian';
import { Alert } from '@/components/ui/Alert';

export function AutorizarForm({ token, menor, iglesia }: { token: string; menor: string; iglesia: string }) {
  const [marcado, setMarcado] = useState(false);
  const [estado, setEstado] = useState<{ error?: string; success?: string } | null>(null);
  const [enviando, startTransition] = useTransition();

  if (estado?.success) {
    return (
      <>
        <h1 className="text-xl font-bold text-green-700">Autorización registrada</h1>
        <Alert kind="success">{estado.success}</Alert>
        <p className="text-sm text-gray-600">
          Ya puedes cerrar esta página. Te escribiremos a este mismo correo cuando pase algo importante.
        </p>
      </>
    );
  }

  return (
    <>
      <h1 className="text-xl font-bold inline-flex items-center gap-2">
        <ShieldCheck className="w-5 h-5 text-brand-600" aria-hidden /> Tu permiso, por favor
      </h1>

      <p className="text-sm text-gray-700">
        <b>{menor}</b> creó una cuenta en la app del curso Próximo Paso de {iglesia} y te puso a ti
        como su representante. Su cuenta no funciona hasta que tú lo autorices.
      </p>

      <div className="rounded-xl border border-gray-200 p-3 space-y-3 text-sm text-gray-700">
        <p className="font-semibold text-gray-900">Qué estás autorizando</p>
        <p className="flex gap-2">
          <MapPin className="w-4 h-4 text-brand-600 shrink-0 mt-0.5" aria-hidden />
          <span>Que participe en las cuatro clases presenciales del curso, en la iglesia, los domingos.</span>
        </p>
        <p className="flex gap-2">
          <Bell className="w-4 h-4 text-brand-600 shrink-0 mt-0.5" aria-hidden />
          <span>
            Que te avisemos a este correo cada vez que pase algo importante: cuando se inscriba a un ciclo,
            cada vez que se registre su asistencia, cuando reciba su certificado y si cambia su correo o su contraseña.
          </span>
        </p>
        <p className="flex gap-2">
          <Lock className="w-4 h-4 text-brand-600 shrink-0 mt-0.5" aria-hidden />
          <span>
            Para marcar asistencia la app le pide la ubicación del teléfono en ese momento, solo para comprobar
            que está en el salón. No guardamos dónde estuvo: solo a qué distancia estaba y si se aceptó o no.
          </span>
        </p>
      </div>

      {estado?.error && <Alert kind="error">{estado.error}</Alert>}

      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" className="mt-1 w-5 h-5" checked={marcado}
          onChange={(e) => setMarcado(e.target.checked)} />
        <span>Soy su papá, mamá o representante y autorizo su participación.</span>
      </label>

      <button
        className="btn-primary w-full"
        disabled={!marcado || enviando}
        onClick={() => startTransition(async () => setEstado(await authorizeGuardian(token, marcado)))}
      >
        {enviando ? 'Guardando…' : 'Sí, lo autorizo'}
      </button>

      <p className="text-xs text-gray-500">
        Si no conoces a esta persona o no quieres autorizarla, simplemente cierra esta página: la cuenta
        se queda sin acceso. También puedes escribirnos y la eliminamos.
      </p>
    </>
  );
}
