import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_PATHS = ['/', '/login', '/registro', '/recuperar', '/restablecer', '/privacidad', '/ayuda'];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value }: { name: string; value: string }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options as any));
        },
      },
    }
  );
  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  // `/autorizar/<token>` es público a propósito: quien lo abre es el padre o la
  // madre del menor, que no tiene cuenta en la app y no tiene por qué tenerla.
  const isPublic = PUBLIC_PATHS.includes(path) || path.startsWith('/verificar')
    || path.startsWith('/auth') || path.startsWith('/autorizar');

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', path);
    return NextResponse.redirect(url);
  }
  // Clave temporal: mientras no la cambie, no puede ir a ningún otro sitio.
  // Si la consulta falla por lo que sea, se deja pasar a propósito: es peor
  // dejar a alguien encerrado fuera de la app que dejarle la clave temporal un
  // rato más.
  if (user && !isPublic && path !== '/cambiar-clave') {
    const { data: perfil } = await supabase
      .from('profiles').select('must_change_password').eq('id', user.id).maybeSingle();
    if (perfil?.must_change_password) {
      const url = request.nextUrl.clone();
      url.pathname = '/cambiar-clave';
      url.search = '';
      return NextResponse.redirect(url);
    }
  }

  // Menor sin el permiso de su representante: la cuenta existe pero no anda.
  // La puerta de verdad está en la base (migración 027); esto es para que no
  // choque contra un error, sino que aterrice en una explicación.
  if (user && !isPublic && path !== '/autorizacion-pendiente' && path !== '/cambiar-clave') {
    const { data: g } = await supabase
      .from('profiles').select('guardian_authorization_status').eq('id', user.id).maybeSingle();
    const estado = (g as { guardian_authorization_status?: string } | null)?.guardian_authorization_status;
    if (estado === 'pending' || estado === 'revoked') {
      const url = request.nextUrl.clone();
      url.pathname = '/autorizacion-pendiente';
      url.search = '';
      return NextResponse.redirect(url);
    }
  }

  if (user && ['/login', '/registro'].includes(path)) {
    const url = request.nextUrl.clone();
    url.pathname = '/inicio';
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest|.*\\.(?:png|jpg|svg|webp)$).*)'],
};
