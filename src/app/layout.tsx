import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { getSettings, str } from '@/lib/settings';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

export async function generateMetadata(): Promise<Metadata> {
  let church = 'Iglesia';
  let course = 'Próximo Paso';
  try {
    const s = await getSettings(['church_name', 'course_name']);
    church = str(s, 'church_name', church);
    course = str(s, 'course_name', course);
  } catch {}
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://proximo-paso.netlify.app';
  const description = `${course} es el curso de membresía de ${church}: cuatro clases presenciales para conocer la iglesia, descubrir tu propósito y empezar a servir.`;
  return {
    metadataBase: new URL(site),
    title: { default: `${course} · ${church}`, template: `%s · ${course}` },
    description,
    applicationName: course,
    manifest: '/manifest.webmanifest',
    // Cuando alguien comparte el enlace por WhatsApp, esto es lo que se ve.
    openGraph: {
      type: 'website',
      locale: 'es_US',
      siteName: `${course} · ${church}`,
      title: `Da tu ${course}`,
      description,
      url: site,
      images: [{ url: '/og.png', width: 1200, height: 630, alt: `${course} · ${church}` }],
    },
    twitter: { card: 'summary_large_image', title: `Da tu ${course}`, description, images: ['/og.png'] },
    icons: {
      icon: [{ url: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
      apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],
    },
    appleWebApp: { capable: true, statusBarStyle: 'default', title: course },
    formatDetection: { telephone: true, email: true },
    robots: { index: true, follow: true },
  };
}
export const viewport: Viewport = { themeColor: '#FE4703', width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={inter.variable}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
