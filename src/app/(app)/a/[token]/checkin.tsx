'use client';
import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Alert } from '@/components/ui/Alert';

type Result = { ok: boolean; code: string; message: string; step?: number };
type Phase = 'idle' | 'locating' | 'sending' | 'done';

export function CheckIn({ token }: { token: string }) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<Result | null>(null);

  async function go() {
    setResult(null);
    if (!('geolocation' in navigator)) {
      setResult({ ok: false, code: 'no_location', message: 'Tu dispositivo no soporta geolocalización.' });
      setPhase('done'); return;
    }
    setPhase('locating');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setPhase('sending');
        const supabase = createClient();
        const { data, error } = await supabase.rpc('register_attendance', {
          p_token: token,
          p_lat: pos.coords.latitude,
          p_lon: pos.coords.longitude,
          p_accuracy: pos.coords.accuracy,
        });
        if (error) setResult({ ok: false, code: 'error', message: 'Error de conexión. Revisa tu internet e intenta de nuevo.' });
        else setResult(data as Result);
        setPhase('done');
      },
      (err) => {
        const msg = err.code === err.PERMISSION_DENIED
          ? 'La ubicación está desactivada. Activa el permiso de ubicación para registrar tu asistencia.'
          : 'No pudimos obtener tu ubicación. Intenta de nuevo en un lugar con mejor señal.';
        setResult({ ok: false, code: 'no_location', message: msg });
        setPhase('done');
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  if (result) {
    return (
      <div className={`card text-center space-y-4 ${result.ok ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
        <p className="text-5xl" aria-hidden>{result.ok ? '🎉' : '😕'}</p>
        <p className="font-bold text-lg">{result.message}</p>
        {result.ok
          ? <Link href="/progreso" className="btn-primary w-full">Ver mi progreso</Link>
          : <div className="grid gap-2">
              {['no_location', 'low_accuracy', 'out_of_radius', 'error'].includes(result.code) && (
                <button className="btn-primary w-full" onClick={go}>Intentar de nuevo</button>
              )}
              <Link href="/inicio" className="btn-secondary w-full">Volver al inicio</Link>
            </div>}
      </div>
    );
  }

  return (
    <div className="card text-center space-y-4">
      <p className="text-5xl" aria-hidden>📍</p>
      <p className="text-gray-700">
        Para registrar tu asistencia necesitamos verificar que estás en el lugar de la clase.
        Tu ubicación exacta <strong>no se guarda</strong>: solo la distancia al punto de reunión.
      </p>
      <button className="btn-primary w-full" onClick={go} disabled={phase !== 'idle' && phase !== 'done'}>
        {phase === 'locating' ? 'Obteniendo ubicación…' : phase === 'sending' ? 'Registrando…' : 'Registrar mi asistencia'}
      </button>
      {phase === 'locating' && <Alert kind="info">Si tu teléfono lo pide, permite el acceso a tu ubicación.</Alert>}
    </div>
  );
}
