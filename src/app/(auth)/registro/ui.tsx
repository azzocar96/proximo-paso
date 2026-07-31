'use client';
import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { ShieldCheck } from 'lucide-react';
import { signUp } from '@/lib/actions/auth';
import { Alert } from '@/components/ui/Alert';
import Link from 'next/link';

function Submit({ blocked }: { blocked: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn-primary w-full" disabled={pending || blocked}>
      {pending ? 'Creando cuenta…' : 'Crear cuenta'}
    </button>
  );
}

/** Edad cumplida. null si la fecha no existe o no es usable. */
function ageFrom(iso: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [by, bm, bd] = iso.split('-').map(Number);
  const probe = new Date(Date.UTC(by, bm - 1, bd));
  // Si la fecha no existe (31 de febrero), el viaje de ida y vuelta no coincide.
  if (probe.getUTCMonth() + 1 !== bm || probe.getUTCDate() !== bd) return null;
  const now = new Date();
  let age = now.getFullYear() - by;
  if (now.getMonth() + 1 < bm || (now.getMonth() + 1 === bm && now.getDate() < bd)) age--;
  return age;
}

export function RegistroForm({ minAge, allowMinors }: { minAge: number; allowMinors: boolean }) {
  const [state, action] = useFormState(signUp, null);
  const [birth, setBirth] = useState('');

  const age = ageFrom(birth);
  const invalidDate = birth.length === 10 && age === null;
  const futureDate = age !== null && age < 0;
  const isMinor = age !== null && age >= 0 && age < minAge;
  const tooYoungToRegister = isMinor && !allowMinors;
  const needsGuardian = isMinor && allowMinors;

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

      <div>
        <label className="label" htmlFor="birth_date">Fecha de nacimiento *</label>
        <input className="input" id="birth_date" name="birth_date" type="date" required
          max={new Date().toISOString().slice(0, 10)}
          value={birth} onChange={(e) => setBirth(e.target.value)}
          aria-describedby="birth_help" />
        <p id="birth_help" className="text-xs text-gray-500 mt-1">
          Solo usamos el día y el mes para celebrar tu cumpleaños con la comunidad. Nunca mostramos el año ni tu edad,
          y puedes desactivarlo cuando quieras desde tu perfil.
        </p>
        {invalidDate && <p className="text-xs text-red-600 mt-1">Esa fecha no existe. Revísala, por favor.</p>}
        {futureDate && <p className="text-xs text-red-600 mt-1">Esa fecha está en el futuro. Revísala, por favor.</p>}
      </div>

      {tooYoungToRegister && (
        <Alert kind="error">
          Para registrarte por tu cuenta necesitas tener al menos {minAge} años. Si quieres ser parte del curso,
          escríbenos desde la página de contacto o pide a tu representante que hable con el equipo pastoral: te
          inscribimos igual, solo que de la mano de un adulto.
        </Alert>
      )}

      {needsGuardian && (
        <section className="card space-y-3 border-brand-200/70 bg-brand-50/40">
          <p className="text-sm font-semibold inline-flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-brand-600" aria-hidden /> Datos de tu representante
          </p>
          <p className="text-xs text-gray-600">
            Como tienes menos de {minAge} años, necesitamos los datos de tu papá, mamá o representante,
            y su permiso para que participes.
          </p>
          <div><label className="label" htmlFor="guardian_name">Nombre completo del representante *</label>
            <input className="input" id="guardian_name" name="guardian_name" required /></div>
          <div><label className="label" htmlFor="guardian_contact">Teléfono o correo del representante *</label>
            <input className="input" id="guardian_contact" name="guardian_contact" required /></div>
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" name="guardian_consent" className="mt-1 w-5 h-5" required />
            <span>Mi representante conoce y autoriza mi participación en el curso. *</span>
          </label>
        </section>
      )}

      <div><label className="label" htmlFor="email">Correo electrónico *</label>
        <input className="input" id="email" name="email" type="email" autoComplete="email" required /></div>
      <div><label className="label" htmlFor="password">Contraseña * (mínimo 8 caracteres)</label>
        <input className="input" id="password" name="password" type="password" minLength={8} autoComplete="new-password" required /></div>
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="privacy_consent" className="mt-1 w-5 h-5" required />
        <span>Acepto la <Link href="/privacidad" target="_blank" className="text-brand-600 underline">política de privacidad</Link> y el uso de mis datos para el curso. *</span>
      </label>
      <Submit blocked={tooYoungToRegister || futureDate || invalidDate} />
      <p className="text-sm text-center">¿Ya tienes cuenta? <Link className="text-brand-600 underline" href="/login">Inicia sesión</Link></p>
    </form>
  );
}
