import { createClient } from '@/lib/supabase/server';

export type Capabilities = { email_outbound: boolean };

/**
 * Qué está conectado de verdad (migración 028). Si no se puede leer, se asume
 * lo conservador: que NO está. Vale más avisar de más que prometer de menos.
 */
export async function getCapabilities(): Promise<Capabilities> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('fn_platform_capabilities');
  if (error) {
    console.error('[fn_platform_capabilities]', error.message);
    return { email_outbound: false };
  }
  return { email_outbound: (data as any)?.email_outbound === true };
}
