import Link from 'next/link';
import { Compass } from 'lucide-react';

export default function NotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-10 bg-gradient-to-b from-brand-50 to-white">
      <div className="w-full max-w-md text-center space-y-4">
        <img src="/logo.png" alt="Próximo Paso" className="h-10 w-auto mx-auto" />
        <Compass className="w-10 h-10 text-brand-600 mx-auto" aria-hidden />
        <h1 className="text-2xl font-extrabold">Esta página no existe</h1>
        <p className="text-[15px] text-gray-600">
          Puede que el enlace esté mal escrito o que ya no esté disponible. No pasa nada: desde aquí
          vuelves a donde estabas.
        </p>
        <div className="flex flex-col sm:flex-row gap-2 justify-center pt-2">
          <Link href="/inicio" className="btn-primary">Ir a mi inicio</Link>
          <Link href="/ayuda" className="btn-secondary">Ver la ayuda</Link>
        </div>
      </div>
    </main>
  );
}
