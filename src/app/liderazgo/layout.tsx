import Link from 'next/link';
import { requireMinistryLeader } from '@/lib/auth';

export default async function LiderazgoLayout({ children }: { children: React.ReactNode }) {
  await requireMinistryLeader();
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto p-4 md:p-8 space-y-4">
        <Link href="/inicio" className="text-sm text-gray-500 hover:text-gray-800">← Volver a la app</Link>
        {children}
      </div>
    </div>
  );
}
