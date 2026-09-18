import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { requireMinistryLeader } from '@/lib/auth';
import { TopBar } from '@/components/shell/TopBar';
import { datosDeLaBarra } from '@/lib/shell';

export default async function LiderazgoLayout({ children }: { children: React.ReactNode }) {
  // Esta pantalla vive fuera del cascarón de la app, pero la campana y los
  // mensajes tienen que seguir a la persona: es la misma barra de siempre.
  const { supabase, user } = await requireMinistryLeader();
  const barra = await datosDeLaBarra(supabase, user);
  return (
    <div className="min-h-screen bg-gray-50">
      <TopBar {...barra} />
      <div className="max-w-6xl mx-auto p-4 md:p-8 space-y-4">
        <Link href="/inicio" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800"><ArrowLeft className="w-4 h-4" aria-hidden /> Volver a la app</Link>
        {children}
      </div>
    </div>
  );
}
