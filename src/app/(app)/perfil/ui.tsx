'use client';
import { useFormState, useFormStatus } from 'react-dom';
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { BadgeCheck, KeyRound } from 'lucide-react';
import { updateProfile, uploadAvatar } from '@/lib/actions/course';
import { requestActiveMember, cancelActiveMemberRequest } from '@/lib/actions/member';
import { changePassword, changeEmail } from '@/lib/actions/auth';
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
        <div>
          <label className="label">Fecha de nacimiento</label>
          <input className="input" type="date" name="birth_date" defaultValue={profile?.birth_date ?? ''} />
          <label className="flex items-start gap-2.5 text-xs text-gray-600 mt-2">
            <input type="checkbox" name="show_birthday" className="mt-0.5 w-4 h-4"
              defaultChecked={profile?.show_birthday !== false} />
            <span>
              Mostrar mi cumpleaños en el muro para que la comunidad me salude.
              Solo se ve el día y el mes, nunca el año ni tu edad.
            </span>
          </label>
        </div>
        <div><label className="label">Teléfono</label><input className="input" type="tel" name="phone" defaultValue={profile?.phone ?? ''} /></div>
      </div>
      <div><label className="label">Dirección</label><input className="input" name="address" defaultValue={profile?.address ?? ''} /></div>
      <div className="grid grid-cols-3 gap-3">
        <div><label className="label">Ciudad</label><input className="input" name="city" defaultValue={profile?.city ?? ''} /></div>
        <div><label className="label">Estado</label><input className="input" name="state" defaultValue={profile?.state ?? ''} /></div>
        <div><label className="label">Código postal</label><input className="input" name="zip_code" defaultValue={profile?.zip_code ?? ''} /></div>
      </div>
      <div className="pt-2 border-t">
        <p className="label !mb-2">Contacto de emergencia</p>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Nombre</label>
            <input className="input" name="emergency_contact_name" defaultValue={profile?.emergency_contact_name ?? ''} /></div>
          <div><label className="label">Teléfono</label>
            <input className="input" type="tel" name="emergency_contact_phone" defaultValue={profile?.emergency_contact_phone ?? ''} /></div>
        </div>
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

// ---------- Fase 3f: "ya soy miembro activo" ----------
export function ActiveMemberCard({ profile }: { profile: any }) {
  const [msg, setMsg] = useState<{ error?: string; success?: string } | null>(null);
  const [note, setNote] = useState('');
  const [pending, start] = useTransition();
  const router = useRouter();

  if (profile?.active_member) {
    return (
      <section className="card space-y-1 border-green-200/70 bg-green-50/40">
        <p className="text-[11px] font-bold text-green-700 uppercase tracking-widest inline-flex items-center gap-1.5">
          <BadgeCheck className="w-3.5 h-3.5" aria-hidden /> Miembro activo
        </p>
        <p className="text-sm text-gray-700">
          Tienes acceso a los muros y a los ministerios. Gracias por ser parte.
        </p>
      </section>
    );
  }

  const pendiente = Boolean(profile?.active_member_requested_at);
  const rechazada = profile?.active_member_review_status === 'rejected';

  return (
    <section className="card space-y-3">
      <h2 className="font-bold inline-flex items-center gap-2">
        <BadgeCheck className="w-4 h-4 text-brand-600" aria-hidden /> ¿Ya eras miembro activo?
      </h2>
      {msg?.error && <Alert kind="error">{msg.error}</Alert>}
      {msg?.success && <Alert kind="success">{msg.success}</Alert>}

      {pendiente ? (
        <>
          <p className="text-sm text-gray-600">
            Tu solicitud está en revisión. Un director de ministerio o el equipo pastoral la verá, y la respuesta aparecerá aquí mismo.
            Mientras tanto puedes seguir usando la app con normalidad.
          </p>
          <button className="btn-secondary !py-2 text-sm" disabled={pending}
            onClick={() => start(async () => { setMsg(await cancelActiveMemberRequest()); router.refresh(); })}>
            Retirar mi solicitud
          </button>
        </>
      ) : (
        <>
          {rechazada && (
            <Alert kind="error">
              Tu solicitud anterior no fue aprobada.{profile?.active_member_review_note ? ` Motivo: ${profile.active_member_review_note}` : ''}
              {' '}Si crees que hubo una confusión, cuéntalo abajo y vuelve a pedirlo.
            </Alert>
          )}
          <p className="text-sm text-gray-600">
            Si completaste los cuatro pasos antes de que existiera esta app, pídelo aquí. No te da acceso al
            instante: alguien del equipo lo confirma primero.
          </p>
          <div>
            <label className="label" htmlFor="am_note">¿Cuándo y con quién lo hiciste? (opcional)</label>
            <input className="input" id="am_note" maxLength={500} value={note}
              onChange={(e) => setNote(e.target.value)} placeholder="Ej.: en 2019, con el pastor Luis" />
          </div>
          <button className="btn-primary !py-2 text-sm" disabled={pending}
            onClick={() => start(async () => {
              const r = await requestActiveMember(note);
              setMsg(r); if (r?.success) setNote('');
              router.refresh();
            })}>
            {pending ? 'Enviando…' : 'Ya soy miembro activo'}
          </button>
        </>
      )}
    </section>
  );
}

// ---------- Fase 3f: seguridad de la cuenta ----------
export function SecurityCard({ email }: { email: string }) {
  const [pwState, pwAction] = useFormState(changePassword, null);
  const [mailState, mailAction] = useFormState(changeEmail, null);
  return (
    <section className="card space-y-4">
      <h2 className="font-bold inline-flex items-center gap-2">
        <KeyRound className="w-4 h-4 text-brand-600" aria-hidden /> Correo y contraseña
      </h2>

      <form action={pwAction} className="space-y-3">
        <p className="text-sm font-semibold">Cambiar contraseña</p>
        {pwState?.error && <Alert kind="error">{pwState.error}</Alert>}
        {pwState?.success && <Alert kind="success">{pwState.success}</Alert>}
        <div><label className="label" htmlFor="pw_cur">Contraseña actual</label>
          <input className="input" id="pw_cur" name="current_password" type="password" autoComplete="current-password" required /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label" htmlFor="pw_new">Nueva (mínimo 8)</label>
            <input className="input" id="pw_new" name="password" type="password" minLength={8} autoComplete="new-password" required /></div>
          <div><label className="label" htmlFor="pw_conf">Repítela</label>
            <input className="input" id="pw_conf" name="confirm" type="password" minLength={8} autoComplete="new-password" required /></div>
        </div>
        <Submit label="Cambiar contraseña" />
      </form>

      <form action={mailAction} className="space-y-3 pt-4 border-t border-gray-100">
        <p className="text-sm font-semibold">Cambiar correo</p>
        <p className="text-xs text-gray-500">
          Hoy entras con <b>{email}</b>. Te enviaremos un enlace al correo nuevo: hasta que lo abras, sigues
          entrando con el de siempre.
        </p>
        {mailState?.error && <Alert kind="error">{mailState.error}</Alert>}
        {mailState?.success && <Alert kind="success">{mailState.success}</Alert>}
        <div><label className="label" htmlFor="em_new">Correo nuevo</label>
          <input className="input" id="em_new" name="email" type="email" autoComplete="email" required /></div>
        <div><label className="label" htmlFor="em_pw">Tu contraseña actual</label>
          <input className="input" id="em_pw" name="current_password" type="password" autoComplete="current-password" required /></div>
        <Submit label="Enviar enlace de confirmación" />
      </form>
    </section>
  );
}
