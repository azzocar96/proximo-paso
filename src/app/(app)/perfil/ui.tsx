'use client';
import { useFormState, useFormStatus } from 'react-dom';
import { useRef, useState, useTransition } from 'react';
import { updateProfile, uploadAvatar } from '@/lib/actions/course';
import { Alert } from '@/components/ui/Alert';

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return <button className="btn-primary w-full" disabled={pending}>{pending ? 'Guardando…' : label}</button>;
}

export function ProfileForm({ profile }: { profile: any }) {
  const [state, action] = useFormState(updateProfile, null);
  return (
    <form action={action} className="card space-y-4">
      <h2 className="font-bold">Datos personales</h2>
      {state?.error && <Alert kind="error">{state.error}</Alert>}
      {state?.success && <Alert kind="success">{state.success}</Alert>}
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">Nombre *</label><input className="input" name="first_name" defaultValue={profile?.first_name ?? ''} required /></div>
        <div><label className="label">Segundo nombre</label><input className="input" name="middle_name" defaultValue={profile?.middle_name ?? ''} /></div>
      </div>
      <div><label className="label">Apellido *</label><input className="input" name="last_name" defaultValue={profile?.last_name ?? ''} required /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">Fecha de nacimiento</label><input className="input" type="date" name="birth_date" defaultValue={profile?.birth_date ?? ''} /></div>
        <div><label className="label">Teléfono</label><input className="input" type="tel" name="phone" defaultValue={profile?.phone ?? ''} /></div>
      </div>
      <div><label className="label">Dirección</label><input className="input" name="address" defaultValue={profile?.address ?? ''} /></div>
      <div className="grid grid-cols-3 gap-3">
        <div><label className="label">Ciudad</label><input className="input" name="city" defaultValue={profile?.city ?? ''} /></div>
        <div><label className="label">Estado</label><input className="input" name="state" defaultValue={profile?.state ?? ''} /></div>
        <div><label className="label">Código postal</label><input className="input" name="zip_code" defaultValue={profile?.zip_code ?? ''} /></div>
      </div>
      <Submit label="Guardar cambios" />
    </form>
  );
}

export function AvatarForm() {
  const [msg, setMsg] = useState<{ error?: string; success?: string } | null>(null);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="card space-y-2">
      <h2 className="font-bold text-sm">Foto de perfil (opcional)</h2>
      {msg?.error && <Alert kind="error">{msg.error}</Alert>}
      {msg?.success && <Alert kind="success">{msg.success}</Alert>}
      <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp" className="text-sm" aria-label="Elegir foto" />
      <button className="btn-secondary !py-2 text-sm" disabled={pending} onClick={() => {
        const f = ref.current?.files?.[0];
        if (!f) { setMsg({ error: 'Selecciona una imagen primero.' }); return; }
        const fd = new FormData(); fd.set('photo', f);
        start(async () => setMsg(await uploadAvatar(fd)));
      }}>{pending ? 'Subiendo…' : 'Subir foto'}</button>
    </div>
  );
}
