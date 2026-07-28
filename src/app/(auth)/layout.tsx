export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-10 bg-gradient-to-b from-brand-50 to-white">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <img src="/icon.svg" alt="" className="w-14 h-14 mx-auto mb-2" />
          <h1 className="text-2xl font-extrabold text-brand-800">Próximo Paso</h1>
        </div>
        <div className="card">{children}</div>
      </div>
    </main>
  );
}
