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
  });
  if (!parsed.success) return { error: parsed.error.errors[0].message };
  const d = parsed.data;
  const supabase = createClient();
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
