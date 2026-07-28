import Link from 'next/link';
import { requireStaff } from '@/lib/auth';

const ADMIN_NAV = [
  { href: '/admin', label: '📊 Dashboard', roles: ['coordinator', 'admin', 'superadmin'] },
  { href: '/admin/ciclos', label: '📚 Ciclos y sesiones', roles: ['coordinator', 'admin', 'superadmin'] },
  { href: '/admin/asistencia', label: '✅ Asistencia', roles: ['coordinator', 'admin', 'superadmin'] },
  { href: '/admin/usuarios', label: '👥 Usuarios', roles: ['admin', 'superadmin'] },
  { href: '/admin/evaluaciones', label: '📝 Test', roles: ['admin', 'superadmin'] },
  { href: '/admin/dream-team', label: '🙌 Dream Team', roles: ['admin', 'superadmin'] },
  { href: '/admin/certificados', label: '🎓 Certificados', roles: ['admin', 'superadmin'] },
  { href: '/admin/ministerios', label: '🤝 Ministerios', roles: ['admin', 'superadmin'] },
  { href: '/admin/anuncios', label: '📣 Anuncios', roles: ['admin', 'superadmin'] },
  { href: '/admin/contacto', label: '✉️ Mensajes', roles: ['admin', 'superadmin'] },
  { href: '/admin/reportes', label: '📈 Reportes', roles: ['admin', 'superadmin'] },
  { href: '/admin/segmentacion', label: '🔎 Segmentación', roles: ['admin', 'superadmin'] },
  { href: '/admin/auditoria', label: '🧾 Auditoría', roles: ['admin', 'superadmin'] },
  { href: '/admin/configuracion', label: '⚙️ Configuración', roles: ['admin', 'superadmin'] },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { role } = await requireStaff();
  const nav = ADMIN_NAV.filter((n) => n.roles.includes(role));
  return (
    <div className="min-h-screen md:flex bg-gray-50">
      <aside className="md:w-64 shrink-0 bg-gray-900 text-white md:min-h-screen p-4">
        <Link href="/inicio" className="flex items-center gap-2 px-2 py-3 text-sm text-gray-300 hover:text-white">← Volver a la app</Link>
        <p className="px-2 pb-2 font-bold text-lg">Panel administrativo</p>
        <p className="px-2 pb-3 text-xs text-gray-400">Rol: {role === 'superadmin' ? 'Superadministrador' : role === 'admin' ? 'Administrador' : 'Coordinador'}</p>
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
