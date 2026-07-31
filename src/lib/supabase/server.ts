import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Cliente SIN cookies, para comprobar una contraseña sin efectos secundarios.
 * `signInWithPassword` con el cliente normal escribe cookies: verificar la
 * contraseña actual le rotaba la sesión a la persona en mitad de la operación.
 * Este no guarda nada: pregunta y se descarta.
 */
export function createVerifyClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return []; }, setAll() { /* a propósito: no persiste */ } } }
  );
}

export function createClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options as any));
          } catch { /* Server Component: middleware refresca la sesión */ }
        },
      },
    }
  );
}
