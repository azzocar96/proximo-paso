export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-10 bg-gradient-to-b from-brand-50 to-white">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          {/* Logo real de la iglesia */}
          <img src="/logo.png" alt="Próximo Paso" className="h-12 w-auto mx-auto" />
        </div>
        <div className="card">{children}</div>
      </div>
    </main>
  );
}
