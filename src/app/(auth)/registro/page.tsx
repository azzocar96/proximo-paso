import { getRegistrationPolicy } from '@/lib/actions/auth';
import { RegistroForm } from './ui';

export const metadata = { title: 'Crear cuenta' };

/**
 * Server Component: la política de edad se lee aquí y llega al formulario ya
 * resuelta. Antes se pedía desde un useEffect, lo que provocaba un parpadeo
 * (a un chico de 15 le aparecía por un instante el aviso de que no podía
 * registrarse) y una petición extra en cada montaje.
 */
export default async function RegistroPage() {
  const policy = (await getRegistrationPolicy()) ?? { min_age: 18, allow_minors: false };
  return <RegistroForm minAge={policy.min_age} allowMinors={policy.allow_minors} />;
}
