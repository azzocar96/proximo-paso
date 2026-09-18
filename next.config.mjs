/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  // Tipos verificados aparte con `npm run typecheck` (evita OOM en builds con poca RAM)
  typescript: { ignoreBuildErrors: true },
  images: { remotePatterns: [{ protocol: 'https', hostname: '**.supabase.co' }] },
  // Cabeceras de seguridad. Van AQUÍ y no solo en netlify.toml: se comprobó en
  // producción (18-sep-2026) que las de netlify.toml no llegan a las páginas
  // servidas por el runtime de Next.js. Estas sí salen en todas.
  // La geolocalización y la cámara se permiten solo desde la propia app: es lo
  // que usa el registro de asistencia con QR.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'geolocation=(self), camera=(self), microphone=(), payment=()' },
        ],
      },
    ];
  },
};
export default nextConfig;
