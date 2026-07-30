import Link from 'next/link';
import { requireStaff } from '@/lib/auth';

// Nota (Fase 3a): "admin" quedó inerte (ver src/lib/auth.ts) — ya no aparece
// en ningún arreglo de roles aquí. Nivel más alto: superadmin o pastor.
const ADMIN_NAV = [
  { href: '/admin', label: '📊 Dashboard', roles: ['coordinator', 'pastor', 'superadmin'] },
  { href: '/admin/ciclos', label: '📚 Ciclos y sesiones', roles: ['coordinator', 'pastor', 'superadmin'] },
  { href: '/admin/asistencia', label: '✅ Asistencia', roles: ['coordinator', 'pastor', 'superadmin'] },
  { href: '/admin/oradores', label: '🎤 Oradores', roles: ['pastor', 'superadmin'] },
  { href: '/admin/usuarios', label: '👥 Usuarios', roles: ['pastor', 'superadmin'] },
  { href: '/admin/evaluaciones', label: '📝 Test', roles: ['pastor', 'superadmin'] },
  { href: '/admin/dream-team', label: '🙌 Dream Team', roles: ['pastor', 'superadmin'] },
  { href: '/admin/certificados', label: '🎓 Certificados', roles: ['pastor', 'superadmin'] },
  { href: '/admin/ministerios', label: '🤝 Ministerios', roles: ['pastor', 'superadmin'] },
  { href: '/admin/anuncios', label: '📣 Anuncios', roles: ['pastor', 'superadmin'] },
  { href: '/admin/contacto', label: '✉️ Mensajes', roles: ['pastor', 'superadmin'] },
  { href: '/admin/reportes', label: '📈 Reportes', roles: ['pastor', 'superadmin'] },
  { href: '/admin/segmentacion', label: '🔎 Segmentación', roles: ['pastor', 'superadmin'] },
  { href: '/admin/auditoria', label: '🧾 Auditoría', roles: ['pastor', 'superadmin'] },
  { href: '/admin/configuracion', label: '⚙️ Configuración', roles: ['pastor', 'superadmin'] },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { role } = await requireStaff();
  const nav = ADMIN_NAV.filter((n) => n.roles.includes(role));
  return (
    <div className="min-h-screen md:flex bg-gray-50">
      <aside className="md:w-64 shrink-0 bg-gray-900 text-white md:min-h-screen p-4">
        <Link href="/inicio" className="flex items-center gap-2 px-2 py-3 text-sm text-gray-300 hover:text-white">← Volver a la app</Link>
        <p className="px-2 pb-2 font-bold text-lg">Panel administrativo</p>
        <p className="px-2 pb-3 text-xs text-gray-400">Rol: {role === 'superadmin' || role === 'pastor' ? 'Administrador' : 'Coordinador'}</p>
        <nav className="flex md:flex-col gap-1 overflow-x-auto pb-2 md:pb-0">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} className="rounded-lg px-3 py-2 text-sm hover:bg-gray-700 whitespace-nowrap">{n.label}</Link>
          ))}
        </nav>
      </aside>
      <main className="flex-1 p-4 md:p-8 max-w-6xl">{children}</main>
    </div>
  );
}
