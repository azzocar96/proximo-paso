'use server';
import { createClient, createVerifyClient } from '@/lib/supabase/server';
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
    already_member: formData.get('already_member') === 'on' ? true : false,
    member_note: formData.get('member_note') ?? '',
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
        // Marcar esto NO hace a nadie miembro activo: deja la mano levantada
        // para que un director, el pastor o el administrador lo confirmen.
        already_member: d.already_member ?? false,
        member_note: d.member_note || null,
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
 * Comprueba la contraseña actual sin tocar la sesión.
 * Devuelve el mensaje de error si algo va mal, o null si la contraseña es
 * correcta. Distingue el límite de intentos: decirle "contraseña incorrecta" a
 * quien la escribió bien es la peor respuesta posible.
 */
async function verifyPassword(email: string, password: string): Promise<string | null> {
  const { error } = await createVerifyClient().auth.signInWithPassword({ email, password });
  if (!error) return null;
  if ((error as any).status === 429) return 'Demasiados intentos seguidos. Espera un minuto y vuelve a probar.';
  if (error.message.toLowerCase().includes('invalid login')) return 'La contraseña actual no es correcta.';
  return 'No pudimos verificar tu contraseña ahora mismo. Intenta de nuevo en un minuto.';
}

/**
 * Cambiar la contraseña con la sesión abierta.
 * Se pide la actual aunque la sesión ya pruebe quién eres: si alguien deja el
 * teléfono desbloqueado sobre la mesa, esto es lo único que separa un descuido
 * de perder la cuenta. La comprobación se hace contra Supabase, nunca contra
 * un valor guardado por nosotros.
 */
export async function changePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const current = String(formData.get('current_password') ?? '');
  const password = String(formData.get('password') ?? '');
  const confirm = String(formData.get('confirm') ?? '');
  if (!current) return { error: 'Escribe tu contraseña actual.' };
  if (password.length < 8) return { error: 'La contraseña nueva debe tener al menos 8 caracteres.' };
  if (password.length > 72) return { error: 'La contraseña nueva es demasiado larga.' };
  if (password !== confirm) return { error: 'Las dos contraseñas nuevas no coinciden.' };
  if (password === current) return { error: 'La contraseña nueva tiene que ser distinta de la actual.' };

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return { error: 'Sesión no válida. Vuelve a iniciar sesión.' };

  const bad = await verifyPassword(user.email, current);
  if (bad) return { error: bad };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: 'No pudimos cambiar la contraseña. Intenta de nuevo.' };
  return { success: 'Contraseña actualizada. La próxima vez entra con la nueva.' };
}

/**
 * Cambiar el correo de la cuenta. Supabase manda un enlace de confirmación a
 * la dirección nueva (y, según la configuración del proyecto, también a la
 * vieja): hasta que se abra ese enlace, el correo de entrada sigue siendo el
 * de siempre. Cuando se confirma, el trigger t_auth_email_sync (migración 017)
 * lo copia al perfil para que no queden dos correos distintos.
 */
export async function changeEmail(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const current = String(formData.get('current_password') ?? '');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: 'Escribe un correo válido.' };
  if (!current) return { error: 'Escribe tu contraseña actual para confirmar el cambio.' };

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return { error: 'Sesión no válida. Vuelve a iniciar sesión.' };
  if (user.email.toLowerCase() === email) return { error: 'Ese ya es tu correo actual.' };

  const bad = await verifyPassword(user.email, current);
  if (bad) return { error: bad };

  const site = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  const { error } = await supabase.auth.updateUser({ email }, { emailRedirectTo: `${site}/auth/callback?next=/perfil` });
  const ok = `Si ese correo está libre, te enviamos un enlace a ${email}. Ábrelo desde ahí para confirmar el cambio; hasta entonces sigues entrando con el actual.`;
  if (error) {
    // Mismo mensaje aunque el correo ya tenga cuenta: si no, cualquiera con
    // sesión podría ir probando direcciones para saber quién está registrado.
    if (error.message.toLowerCase().includes('already') || error.message.toLowerCase().includes('registered')) {
      return { success: ok };
    }
    return { error: 'No pudimos cambiar el correo. Intenta de nuevo.' };
  }
  return { success: ok };
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
