'use client';
import { useFormState, useFormStatus } from 'react-dom';
import { saveCycle } from '@/lib/actions/admin';
import { Alert } from '@/components/ui/Alert';
import { CYCLE_LABEL } from '@/lib/utils';

function Submit() {
  const { pending } = useFormStatus();
  return <button className="btn-primary" disabled={pending}>{pending ? 'Guardando…' : 'Guardar ciclo'}</button>;
}
export function CycleForm({ cycle }: { cycle?: any }) {
  const action = saveCycle.bind(null, cycle?.id ?? null);
  const [state, formAction] = useFormState(action, null);
  const dt = (v?: string | null) => (v ? new Date(v).toISOString().slice(0, 16) : '');
  return (
    <form action={formAction} className="card space-y-4">
      {state?.error && <Alert kind="error">{state.error}</Alert>}
      {state?.success && <Alert kind="success">{state.success}</Alert>}
      <div className="grid md:grid-cols-2 gap-4">
        <div><label className="label">Nombre *</label><input className="input" name="name" defaultValue={cycle?.name ?? ''} required /></div>
        <div><label className="label">Estado</label>
          <select className="input" name="status" defaultValue={cycle?.status ?? 'draft'}>
            {Object.entries(CYCLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select></div>
      </div>
      <div><label className="label">Descripción</label><textarea className="input" name="description" defaultValue={cycle?.description ?? ''} /></div>
      <div className="grid md:grid-cols-2 gap-4">
        <div><label className="label">Inicio de inscripciones</label><input className="input" type="datetime-local" name="registration_start" defaultValue={dt(cycle?.registration_start)} /></div>
        <div><label className="label">Fin de inscripciones</label><input className="input" type="datetime-local" name="registration_end" defaultValue={dt(cycle?.registration_end)} /></div>
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        <div><label className="label">Capacidad</label><input className="input" type="number" name="capacity" min={1} defaultValue={cycle?.capacity ?? ''} /></div>
        <div><label className="label">Lugar</label><input className="input" name="location_name" defaultValue={cycle?.location_name ?? ''} /></div>
        <div><label className="label">Dirección completa</label><input className="input" name="full_address" defaultValue={cycle?.full_address ?? ''} /></div>
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        <div><label className="label">Latitud</label><input className="input" type="number" step="any" name="latitude" defaultValue={cycle?.latitude ?? ''} /></div>
        <div><label className="label">Longitud</label><input className="input" type="number" step="any" name="longitude" defaultValue={cycle?.longitude ?? ''} /></div>
        <div><label className="label">Radio permitido (m)</label><input className="input" type="number" name="allowed_radius_meters" min={10} defaultValue={cycle?.allowed_radius_meters ?? 100} /></div>
      </div>
      <div>
        <label className="label">Fecha de entrega de certificados</label>
        <input className="input" type="date" name="certificate_delivery_date" defaultValue={cycle?.certificate_delivery_date ?? ''} />
        <p className="text-xs text-gray-500 mt-1">La plataforma puede sugerirla (5º domingo del mes, o 1º del mes siguiente); tú siempre la confirmas.</p>
      </div>
      <Submit />
    </form>
  );
}
