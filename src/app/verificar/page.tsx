import { VerifyForm } from './ui';

export const metadata = { title: 'Verificar certificado' };
export default function VerificarIndexPage() {
  return (
    <main className="min-h-screen flex items-center justify-center px-4 bg-gray-50">
      <div className="card w-full max-w-md space-y-4">
        <h1 className="text-xl font-bold">Verificar certificado</h1>
        <p className="text-sm text-gray-600">Ingresa el código que aparece en el certificado.</p>
        <VerifyForm />
      </div>
    </main>
  );
}
