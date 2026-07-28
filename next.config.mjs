/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  // Tipos verificados aparte con `npm run typecheck` (evita OOM en builds con poca RAM)
  typescript: { ignoreBuildErrors: true },
  images: { remotePatterns: [{ protocol: 'https', hostname: '**.supabase.co' }] },
};
export default nextConfig;
