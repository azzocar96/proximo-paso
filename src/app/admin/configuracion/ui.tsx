'use client';
import { Lock } from 'lucide-react';
import { useState, useTransition } from 'react';
import { saveSetting } from '@/lib/actions/admin';
import { Alert } from '@/components/ui/Alert';

const CRITICAL = ['certificate_auto_approve', 'min_age_without_guardian', 'allow_minors'];
const LABEL: Record<string, string> = {
  church_name: 'Nombre de la iglesia', church_address: 'Dirección', church_contact: 'Contacto {phone,email}',
  course_name: 'Nombre del curso', brand: 'Marca {primary,accent,logo_url}',
  step_names: 'Nombres de los 4 pasos (en orden)',
  program_objectives: 'Objetivos del programa (texto público, página de inicio)',
  program_schedule: 'Modalidad y horario {location_name,time,when,duration_min,frequency,cadence,months_excluded} — cadence aclara que se dicta un paso cada domingo del mes',
  certificate_auto_approve: 'Aprobación semiautomática de certificados',
  certificate_signatures: 'Firmas del certificado [{name,title}]',
  assessment_active_id: 'ID de evaluación activa', assessment_mode: 'Modo del test',
  assessment_external_url: 'URL del test externo',
  min_age_without_guardian: 'Edad mínima sin representante', allow_minors: 'Permitir menores con consentimiento',
  default_attendance_window_min: 'Ventana de asistencia por defecto (min)',
  default_token_ttl_min: 'Vida del QR por defecto (min)', privacy_policy: 'Política de privacidad (texto)',
};

export function SettingsForm({ settings, isSuper }: { settings: { key: string; value: unknown; description: string | null }[]; isSuper: boolean }) {
  const [msg, setMsg] = useState<{ error?: string; success?: string } | null>(null);
  const [pending, start] = useTransition();
  const [vals, setVals] = useState<Record<string, string>>(
    Object.fromEntries(settings.map((s) => [s.key, JSON.stringify(s.value, null, s.key === 'privacy_policy' ? 2 : 0)])));
  return (
    <div className="space-y-3">
      {msg?.error && <Alert kind="error">{msg.error}</Alert>}
      {msg?.success && <Alert kind="success">{msg.success}</Alert>}
      {settings.map((s) => {
        const locked = CRITICAL.includes(s.key) && !isSuper;
        return (
          <div key={s.key} className="card space-y-2">
            <div className="flex justify-between items-center">
              <label className="label !mb-0">{LABEL[s.key] ?? s.key} {locked && <Lock className="inline w-3 h-3 text-gray-400 ml-1 -mt-0.5" aria-hidden />}</label>
              <button className="btn-secondary !py-1.5 !px-3 text-sm" disabled={pending || locked}
                onClick={() => start(async () => {
                  try {
                    setMsg(await saveSetting(s.key, JSON.parse(vals[s.key])));
                  } catch { setMsg({ error: `El valor de "${s.key}" no es JSON válido. Usa comillas para texto: "valor"` }); }
                })}>Guardar</button>
            </div>
            {s.description && <p className="text-xs text-gray-500">{s.description}</p>}
            <textarea className="input font-mono text-sm" rows={s.key === 'privacy_policy' ? 6 : 2}
              value={vals[s.key] ?? ''} disabled={locked}
              onChange={(e) => setVals((p) => ({ ...p, [s.key]: e.target.value }))} />
          </div>
        );
      })}
      <p className="text-xs text-gray-500">Los valores se guardan como JSON: texto entre comillas ("Iglesia Central"), números sin comillas, objetos con llaves.</p>
    </div>
  );
}
