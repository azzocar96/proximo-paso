'use server';
import { createClient } from '@/lib/supabase/server';
import { registerSchema } from '@/lib/schemas';
import { redirect } from 'next/navigation';

export type FormState = { error?: string; success?: string } | null;

export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');
  if (!email || !password) return { error: 'Ingresa tu correo y contraseña.' };
  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (error.message.includes('Email not confirmed'))
      return { error: 'Tu correo aún no está verificado. Revisa tu bandeja de entrada.' };
    return { error: 'Correo o contraseña incorrectos.' };
  }
  redirect('/inicio');
}

export async function signUp(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = registerSchema.safeParse({
    first_name: formData.get('first_name'),
    middle_name: formData.get('middle_name') ?? '',
    last_name: formData.get('last_name'),
    email: formData.get('email'),
    password: formData.get('password'),
    privacy_consent: formData.get('privacy_consent') === 'on' ? true : false,
    birth_date: formData.get('birth_date'),
    guardian_name: formData.get('guardian_name') ?? '',
    guardian_contact: formData.get('guardian_contact') ?? '',
    guardian_consent: formData.get('guardian_consent') === 'on' ? true : false,
  });
  if (!parsed.success) return { error: parsed.error.errors[0].message };
  const d = parsed.data;
  const supabase = createClient();

  // La validación de edad se repite aquí a propósito: lo del formulario es
  // comodidad para quien se registra, esto es lo que de verdad manda.
  const age = ageFromISO(d.birth_date);
  if (age === null || age < 0) return { error: 'Revisa tu fecha de nacimiento.' };
  if (age > 120) return { error: 'Revisa tu fecha de nacimiento.' };
  const { data: policy, error: policyError } = await supabase.rpc('fn_registration_policy');
  if (policyError || !policy) {
    // No asumimos defaults en silencio: si no podemos leer la política de la
    // iglesia, es mejor decirlo que aplicar una regla que quizá no es la suya.
    return { error: 'No pudimos verificar los requisitos de edad en este momento. Intenta de nuevo en un minuto.' };
  }
  const minAge = Number((policy as any)?.min_age ?? 18);
  const allowMinors = (policy as any)?.allow_minors === true;
  if (age < minAge) {
    if (!allowMinors) {
      return { error: `Para registrarte por tu cuenta necesitas tener al menos ${minAge} años. Escríbenos desde la página de contacto y te inscribimos junto a tu representante.` };
    }
    if (!d.guardian_name || !d.guardian_contact || !d.guardian_consent) {
      return { error: 'Como eres menor de edad, necesitamos el nombre y el contacto de tu representante, y su autorización.' };
    }
  }
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  const { error } = await supabase.auth.signUp({
    email: d.email,
    password: d.password,
    options: {
      emailRedirectTo: `${site}/auth/callback`,
      data: {
        first_name: d.first_name,
        middle_name: d.middle_name || null,
        last_name: d.last_name,
        privacy_consent: d.privacy_consent,
        birth_date: d.birth_date,
        guardian_name: d.guardian_name || null,
        guardian_contact: d.guardian_contact || null,
        guardian_consent: d.guardian_consent ?? null,
      },
    },
  });
  if (error) {
    if (error.message.includes('already registered')) return { error: 'Este correo ya tiene una cuenta. Inicia sesión.' };
    return { error: 'No pudimos crear tu cuenta. Intenta de nuevo.' };
  }
  return { success: 'Cuenta creada. Revisa tu correo y haz clic en el enlace de verificación para activarla.' };
}

export async function signOut() {
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect('/login');
}

export async function requestPasswordReset(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  if (!email) return { error: 'Ingresa tu correo.' };
  const supabase = createClient();
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${site}/auth/callback?next=/restablecer` });
  return { success: 'Si el correo existe, te enviamos un enlace para restablecer tu contraseña.' };
}

export async function updatePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const password = String(formData.get('password') ?? '');
  const confirm = String(formData.get('confirm') ?? '');
  if (password.length < 8) return { error: 'La contraseña debe tener al menos 8 caracteres.' };
  if (password !== confirm) return { error: 'Las contraseñas no coinciden.' };
  const supabase = createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: 'No pudimos actualizar la contraseña. El enlace pudo haber vencido.' };
  redirect('/inicio');
}

/**
 * Edad cumplida a partir de una fecha ISO, contada en la zona horaria de la
 * iglesia. Calcularla en UTC hacía que a partir de las 20:00 de Orlando el
 * servidor ya contara el día siguiente: alguien cumplía 18 unas horas antes de
 * tiempo y el formulario y el servidor podían discrepar.
 */
// Nota: en un archivo 'use server' solo se pueden exportar funciones async,
// por eso la zona horaria queda como constante interna y no exportada.
const CHURCH_TZ = 'America/New_York';
function todayInChurchTZ(): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: CHURCH_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date()).split('-');
  return { y: Number(parts[0]), m: Number(parts[1]), d: Number(parts[2]) };
}
function ageFromISO(iso: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [by, bm, bd] = iso.split('-').map(Number);
  if (!by || !bm || !bd) return null;
  const t = todayInChurchTZ();
  let age = t.y - by;
  if (t.m < bm || (t.m === bm && t.d < bd)) age--;
  return age;
}

/** La política de edad de la iglesia, para que el formulario público sepa qué pedir. */
export async function getRegistrationPolicy(): Promise<{ min_age: number; allow_minors: boolean } | null> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('fn_registration_policy');
  if (error || !data) return null;
  return {
    min_age: Number((data as any).min_age ?? 18),
    allow_minors: (data as any).allow_minors === true,
  };
}
