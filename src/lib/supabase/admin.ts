import 'server-only';
import { createClient as createSbClient } from '@supabase/supabase-js';

/** Cliente con service role. SOLO usar en servidor (rutas/actions). */
export function createAdminClient() {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
