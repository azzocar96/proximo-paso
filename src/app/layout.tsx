import type { Metadata, Viewport } from 'next';
import './globals.css';
import { getSettings, str } from '@/lib/settings';

export async function generateMetadata(): Promise<Metadata> {
  let church = 'Iglesia';
  let course = 'Próximo Paso';
  try {
    const s = await getSettings(['church_name', 'course_name']);
    church = str(s, 'church_name', church);
    course = str(s, 'course_name', course);
  } catch {}
  return {
    title: { default: `${course} · ${church}`, template: `%s · ${course}` },
    description: `Plataforma del curso ${course}`,
    manifest: '/manifest.webmanifest',
  };
}
export const viewport: Viewport = { themeColor: '#FE4703', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
