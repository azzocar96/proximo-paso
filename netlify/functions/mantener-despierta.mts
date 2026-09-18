import type { Config } from '@netlify/functions';

/**
 * Mantener la base despierta.
 *
 * El proyecto de Supabase es gratuito y se PAUSA solo tras ~7 días sin
 * actividad. Eso pasó en agosto-septiembre de 2026: la portada seguía
 * cargando (usa textos de reserva) mientras nadie podía entrar ni
 * registrarse. Esta función hace una lectura mínima cada día para que el
 * proyecto cuente como activo. Vive en el repositorio a propósito: cuando la
 * plataforma migre a las herramientas de la organización, se va con ella.
 *
 * Cuando el proyecto pase a plan de pago, esto sobra y se puede borrar.
 */
export default async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error('[mantener-despierta] faltan NEXT_PUBLIC_SUPABASE_URL / ANON_KEY');
    return;
  }
  // `church_name` es de lectura pública (lista blanca de la migración 023).
  const r = await fetch(`${url}/rest/v1/app_settings?select=key&key=eq.church_name&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  console.log(`[mantener-despierta] Supabase respondió ${r.status} a las ${new Date().toISOString()}`);
};

export const config: Config = {
  // Todos los días a las 09:00 UTC (05:00 en Orlando).
  schedule: '0 9 * * *',
};
