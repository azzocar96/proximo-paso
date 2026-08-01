import Link from 'next/link';
import { HandHeart, QrCode, CalendarDays } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { fmtDate } from '@/lib/utils';
import { Alert } from '@/components/ui/Alert';
import { ServantAddMember } from './ui';

export const metadata = { title: 'Mi servicio' };

const PERMISOS: { k: string; label: string }[] = [
  { k: 'can_show_qr', label: 'Abrir y mostrar el código de asistencia de tus pasos' },
  { k: 'can_approve_attendance', label: 'Confirmar a quien se le olvidó marcar la asistencia' },
  { k: 'can_post_wall', label: 'Publicar en el muro del ministerio' },
  { k: 'can_give_info', label: 'Aparecer como contacto para dar información' },
  { k: 'can_add_members', label: 'Sumar personas al equipo' },
];

/**
 * Fase 3g — la pantalla del servidor.
 * Sin esto, el permiso de mostrar el QR sería inservible: la pantalla del
 * código vive dentro del panel de administración, donde un servidor no entra.
 */
export default async function ServicioPage() {
  const { supabase } = await requireUser();
  const [rolesRes, sessionsRes] = await Promise.all([
    supabase.rpc('fn_my_servant_roles'),
    supabase.rpc('get_servant_sessions'),
  ]);
  const mis = ((rolesRes.data as any[]) ?? []);
  const clases = ((sessionsRes.data as any[]) ?? []);
  const fallo = Boolean(rolesRes.error || sessionsRes.error);

  // Un fallo de carga no puede leerse como "no tienes ningún cargo": esa
  // confusión ya dejó una vez la app entera en blanco sin dar un solo error.
  if (fallo) {
    return (
      <div className="space-y-5">
        <h1 className="text-2xl font-extrabold">Mi servicio</h1>
        <Alert kind="error">
          No pudimos cargar tu servicio ahora mismo. Vuelve a entrar en un minuto; si tenías el código
          de asistencia abierto, sigue funcionando.
        </Alert>
      </div>
    );
  }

  if (mis.length === 0) {
    return (
      <div className="space-y-5">
        <h1 className="text-2xl font-extrabold">Mi servicio</h1>
        <section className="card text-center py-10 space-y-3">
          <HandHeart className="w-10 h-10 mx-auto text-gray-300" aria-hidden />
          <p className="font-semibold">Todavía no sirves con responsabilidades asignadas</p>
          <p className="text-sm text-gray-500 max-w-sm mx-auto">
            Los servidores los nombra el director de cada ministerio, entre la gente de su propio equipo.
            Si crees que te toca, háblalo con él.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold">Mi servicio</h1>
        <p className="text-sm text-gray-500">Lo que tu director te confió, y las clases que te toca atender.</p>
      </div>

      {mis.map((m: any) => (
        <section key={m.ministry_id} className="card space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-bold">{m.ministerio}</p>
              {m.title && <p className="text-sm text-gray-600">{m.title}</p>}
            </div>
            {m.show_in_profile && (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-green-50 text-green-700 border-green-200">
                Apareces en la ficha
              </span>
            )}
          </div>
          {(m.pasos ?? []).length > 0 && (
            <p className="text-xs text-gray-500">Sirves en el paso {(m.pasos as number[]).join(', ')}</p>
          )}
          <ul className="text-sm text-gray-700 space-y-1 pt-1">
            {PERMISOS.filter((p) => m[p.k]).map((p) => (
              <li key={p.k} className="flex gap-2"><span className="text-brand-600" aria-hidden>·</span>{p.label}</li>
            ))}
            {PERMISOS.every((p) => !m[p.k]) && (
              <li className="text-gray-500">Sin responsabilidades técnicas asignadas todavía.</li>
            )}
          </ul>
        </section>
      ))}

      {mis.some((m: any) => m.can_add_members) && (
        <ServantAddMember ministries={mis.filter((m: any) => m.can_add_members)
          .map((m: any) => ({ id: m.ministry_id, name: m.ministerio }))} />
      )}

      {mis.some((m: any) => m.can_approve_attendance) && (
        <p className="text-sm text-gray-600">
          Las asistencias olvidadas de tus pasos las resuelves en{' '}
          <Link href="/solicitudes" className="text-brand-600 underline">Solicitudes → Buzón</Link>.
        </p>
      )}

      {mis.some((m: any) => m.can_show_qr) && clases.length === 0 && (
        <p className="card text-sm text-gray-600">
          Ahora mismo no hay clases abiertas de tus pasos. Aparecerán aquí en cuanto haya un ciclo con
          inscripciones abiertas o en marcha.
        </p>
      )}

      {clases.length > 0 && (
        <>
          <h2 className="text-lg font-bold inline-flex items-center gap-2 pt-1">
            <CalendarDays className="w-4 h-4 text-brand-600" aria-hidden /> Clases de tus pasos
          </h2>
          {clases.map((c: any) => (
            <section key={c.id} className="card space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{c.name} <span className="text-xs text-gray-400">· Paso {c.step_number}</span></p>
                  <p className="text-xs text-gray-500">
                    {c.ciclo}{c.session_date ? ` · ${fmtDate(c.session_date)}` : ' · sin fecha'}
                    {c.start_time ? ` · ${String(c.start_time).slice(0, 5)}` : ''}
                  </p>
                  {c.location_name && <p className="text-xs text-gray-500">{c.location_name}</p>}
                </div>
                {c.qr_active && (
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-green-50 text-green-700 border-green-200">
                    Asistencia abierta
                  </span>
                )}
              </div>
              <Link href={`/servicio/${c.id}`} className="btn-primary !py-2 !px-4 text-sm inline-flex items-center gap-2 w-fit">
                <QrCode className="w-4 h-4" aria-hidden /> Mostrar el código
              </Link>
            </section>
          ))}
          <p className="text-xs text-gray-500">
            El código dura 30 minutos y puedes renovarlo las veces que haga falta. Al cerrar la asistencia,
            el código deja de servir al instante.
          </p>
        </>
      )}
    </div>
  );
}
