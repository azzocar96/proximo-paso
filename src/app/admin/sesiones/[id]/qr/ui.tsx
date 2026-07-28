'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { openAttendance, closeAttendance } from '@/lib/actions/admin';
import { createClient } from '@/lib/supabase/client';
import { Alert } from '@/components/ui/Alert';

type Att = { id: string; recorded_at: string; method: string; profiles: { first_name: string; last_name: string } | null };

export function QrScreen({ session, initialToken, siteUrl }: {
  session: any; initialToken: { token: string; expires_at: string } | null; siteUrl: string;
}) {
  const [token, setToken] = useState(initialToken);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [ttl, setTtl] = useState(15);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [attendance, setAttendance] = useState<Att[]>([]);
  const [full, setFull] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const base = siteUrl || (typeof window !== 'undefined' ? window.location.origin : '');

  useEffect(() => {
    if (!token) { setQrUrl(null); return; }
    QRCode.toDataURL(`${base}/a/${token.token}`, { width: 720, margin: 2 }).then(setQrUrl);
  }, [token, base]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const loadAttendance = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase.from('attendance_records')
      .select('id,recorded_at,method, profiles(first_name,last_name)')
      .eq('session_id', session.id).order('recorded_at', { ascending: false });
    setAttendance((data as any) ?? []);
  }, [session.id]);

  useEffect(() => {
    loadAttendance();
    const t = setInterval(loadAttendance, 5000);
    return () => clearInterval(t);
  }, [loadAttendance]);

  const remaining = token ? Math.max(0, Math.floor((new Date(token.expires_at).getTime() - now) / 1000)) : 0;
  const mm = String(Math.floor(remaining / 60)).padStart(2, '0');
  const ss = String(remaining % 60).padStart(2, '0');

  async function generate() {
    setError(null);
    const r = await openAttendance(session.id, ttl);
    if (r.error) setError(r.error);
    else setToken({ token: r.token!, expires_at: r.expires_at! });
  }
  async function close() {
    setError(null);
    const r = await closeAttendance(session.id);
    if (r?.error) setError(r.error);
    else setToken(null);
  }

  return (
    <div ref={wrapRef} className={full ? 'fixed inset-0 z-50 bg-white overflow-auto p-6' : 'space-y-5'}>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-extrabold">{session.course_cycles?.name} · Paso {session.step_number}</h1>
          <p className="text-sm text-gray-500">{session.name}</p>
        </div>
        <button className="btn-secondary !py-2" onClick={() => setFull(!full)}>{full ? 'Salir de pantalla completa' : '⛶ Pantalla completa'}</button>
      </div>
      {error && <Alert kind="error">{error}</Alert>}

      <div className={`grid ${full ? 'md:grid-cols-2 gap-8 items-start mt-6' : 'md:grid-cols-2 gap-5'}`}>
        <div className="card text-center space-y-4">
          {token && remaining > 0 && qrUrl ? (
            <>
              <img src={qrUrl} alt="Código QR de asistencia" className="mx-auto w-full max-w-md rounded-xl" />
              <p className={`font-mono font-bold ${remaining < 60 ? 'text-red-600' : 'text-gray-700'} text-3xl`}>{mm}:{ss}</p>
              <p className="text-sm text-gray-500">El QR vence automáticamente. Los participantes lo escanean desde la app o con su cámara.</p>
              <div className="flex gap-2 justify-center">
                <button className="btn-secondary !py-2" onClick={generate}>Regenerar</button>
                <button className="btn-danger !py-2" onClick={close}>Cerrar asistencia</button>
              </div>
            </>
          ) : (
            <>
              <p className="text-5xl" aria-hidden>🔳</p>
              <p className="font-semibold">{token && remaining === 0 ? 'El QR venció.' : 'La asistencia está cerrada.'}</p>
              <div className="flex items-center gap-2 justify-center">
                <label className="text-sm">Duración:</label>
                <select className="input !w-auto !py-2" value={ttl} onChange={(e) => setTtl(Number(e.target.value))}>
                  {[5, 10, 15, 30, 45, 60, 90].map((m) => <option key={m} value={m}>{m} min</option>)}
                </select>
              </div>
              <button className="btn-primary w-full" onClick={generate}>Abrir asistencia y generar QR</button>
            </>
          )}
        </div>

        <div className="card">
          <div className="flex justify-between items-center mb-3">
            <h2 className="font-bold">Registros en vivo</h2>
            <span className="badge bg-brand-50 text-brand-700">{attendance.length} asistentes</span>
          </div>
          <ul className="divide-y max-h-96 overflow-auto">
            {attendance.map((a) => (
              <li key={a.id} className="py-2 flex justify-between text-sm">
                <span>✅ {a.profiles?.first_name} {a.profiles?.last_name}</span>
                <span className="text-gray-400">
                  {new Date(a.recorded_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                  {a.method !== 'qr_geolocation' && ' · manual'}
                </span>
              </li>
            ))}
            {attendance.length === 0 && <li className="py-3 text-sm text-gray-500">Aún no hay registros.</li>}
          </ul>
        </div>
      </div>
    </div>
  );
}
