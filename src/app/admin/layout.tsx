import Link from 'next/link';
import {
  ArrowLeft, LayoutDashboard, BookOpen, CheckSquare, Mic, Users, FileText,
  HandHeart, GraduationCap, HeartHandshake, Megaphone, Inbox, BarChart3,
  Filter, ScrollText, Settings,
} from 'lucide-react';
import { requireStaff } from '@/lib/auth';

// Nota (Fase 3a): "admin" quedó inerte (ver src/lib/auth.ts) — ya no aparece
// en ningún arreglo de roles aquí. Nivel más alto: superadmin o pastor.
const ADMIN_NAV = [
  { href: '/admin', label: 'Dashboard', Icon: LayoutDashboard, roles: ['coordinator', 'pastor', 'superadmin'] },
  { href: '/admin/ciclos', label: 'Ciclos y sesiones', Icon: BookOpen, roles: ['coordinator', 'pastor', 'superadmin'] },
  { href: '/admin/asistencia', label: 'Asistencia', Icon: CheckSquare, roles: ['coordinator', 'pastor', 'superadmin'] },
  { href: '/admin/oradores', label: 'Oradores', Icon: Mic, roles: ['pastor', 'superadmin'] },
  { href: '/admin/usuarios', label: 'Usuarios', Icon: Users, roles: ['pastor', 'superadmin'] },
  { href: '/admin/evaluaciones', label: 'Test', Icon: FileText, roles: ['pastor', 'superadmin'] },
  { href: '/admin/dream-team', label: 'Dream Team', Icon: HandHeart, roles: ['pastor', 'superadmin'] },
  { href: '/admin/certificados', label: 'Certificados', Icon: GraduationCap, roles: ['pastor', 'superadmin'] },
  { href: '/admin/ministerios', label: 'Ministerios', Icon: HeartHandshake, roles: ['pastor', 'superadmin'] },
  { href: '/admin/anuncios', label: 'Anuncios', Icon: Megaphone, roles: ['pastor', 'superadmin'] },
  { href: '/admin/contacto', label: 'Mensajes', Icon: Inbox, roles: ['pastor', 'superadmin'] },
  { href: '/admin/reportes', label: 'Reportes', Icon: BarChart3, roles: ['pastor', 'superadmin'] },
  { href: '/admin/segmentacion', label: 'Segmentación', Icon: Filter, roles: ['pastor', 'superadmin'] },
  { href: '/admin/auditoria', label: 'Auditoría', Icon: ScrollText, roles: ['pastor', 'superadmin'] },
  { href: '/admin/configuracion', label: 'Configuración', Icon: Settings, roles: ['pastor', 'superadmin'] },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { role } = await requireStaff();
  const nav = ADMIN_NAV.filter((n) => n.roles.includes(role));
  return (
    <div className="min-h-screen md:flex bg-gray-50/80">
      <aside className="md:w-64 shrink-0 bg-white border-r border-gray-200 md:min-h-screen p-4">
        <Link href="/inicio" className="nav-item !text-gray-500 mb-2">
          <ArrowLeft className="nav-item-icon" aria-hidden /> Volver a la app
        </Link>
        <div className="px-3 pb-3">
          <p className="font-bold text-[15px]">Panel administrativo</p>
          <p className="text-xs text-gray-400">
            {role === 'superadmin' || role === 'pastor' ? 'Administrador' : 'Servidor'}
          </p>
        </div>
        <nav className="flex md:flex-col gap-0.5 overflow-x-auto pb-2 md:pb-0">
          {nav.map(({ href, label, Icon }) => (
            <Link key={href} href={href} className="nav-item whitespace-nowrap">
              <Icon className="nav-item-icon" aria-hidden /> {label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="flex-1 p-4 md:p-8 max-w-6xl">{children}</main>
    </div>
  );
}
