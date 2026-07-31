import Link from 'next/link';
import { HeartHandshake, Users, CalendarClock, Phone } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { MINISTRY_ASSIGN_LABEL, MEMBER_REQUEST_KIND_LABEL, fmtDate } from '@/lib/utils';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { JoinRequestPanel, SelfServicePanel, PendingRequestCard } from './ui';

export const metadata = { title: 'Ministerios' };
export default async function MinisteriosPage() {
  const { supabase, user } = await requireUser();
  // Regla de negocio (migración 013): los ministerios se abren al completar el curso.
  // El criterio es el mismo que usa el menú (fn_my_nav), para que nunca haya un
  // enlace que lleve a "no disponible" ni una sección oculta que sí funcione.
  // El enlace ya no aparece para quien está en proceso; esto cubre además que llegue
  // escribiendo la dirección a mano. Si la RPC falla, no bloqueamos.
  const { data: nav, error: navError } = await supabase.rpc('fn_my_nav');
  const canSee = Boolean(navError) || (nav as any)?.can_ministries === true;
  const isActiveMember = Boolean(navError) || (nav as any)?.is_active_member === true;

  if (!canSee) {
    return (
      <div className="space-y-5">
        <h1 className="text-2xl font-extrabold">Ministerios</h1>
        <section className="card text-center py-10 space-y-3">
          <HeartHandshake className="w-10 h-10 mx-auto text-gray-300" aria-hidden />
          <p className="font-semibold">Los ministerios se abren al completar el curso</p>
          <p className="text-sm text-gray-500 max-w-sm mx-auto">
            Termina tus cuatro pasos y recibe tu certificado. Al hacerlo quedas como miembro
            activo y podrás postularte hasta a tres equipos en orden de preferencia.
          </p>
          <Link href="/progreso" className="btn-primary !py-2 !px-4 text-sm inline-block">Ver mi progreso</Link>
        </section>
      </div>
    );
  }

  const [{ data: ministries }, { data: mine }, { data: myRequests }, { data: resolved }] = await Promise.all([
    // Vía RPC: devuelve los contactos en null cuando su director no los publicó,
    // así lo privado no viaja al navegador ni aunque alguien mire el código.
    supabase.rpc('get_ministries_catalog'),
    supabase.from('ministry_assignments').select('ministry_id,status, ministries(name)').eq('user_id', user.id),
    supabase.from('member_requests').select('*, ministries:target_ministry_id(name)')
      .eq('user_id', user.id).eq('status', 'pending').order('created_at'),
    supabase.from('member_requests').select('*, ministries:target_ministry_id(name)')
      .eq('user_id', user.id).in('status', ['accepted', 'rejected'])
      .order('resolved_at', { ascending: false }).limit(3),
  ]);
  const current = (mine ?? []).find((m) => ['assigned', 'active'].includes(m.status));
  const mineMap = new Map((mine ?? []).map((m) => [m.ministry_id, m.status]));
  const pendingKinds = new Set((myRequests ?? []).map((r) => r.kind));
  const activeMinistries = ((ministries as any[]) ?? []).map((m: any) => ({ id: m.id, name: m.name }));

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold">Ministerios</h1>

      {current && (
        <section className="card space-y-1 border-brand-200/60 bg-brand-50/40">
          <p className="text-[11px] font-bold text-brand-600 uppercase tracking-widest inline-flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" aria-hidden /> Tu ministerio
          </p>
          <p className="font-bold text-lg">{(current as any).ministries?.name}</p>
          <p className="text-xs text-gray-500">Sirves en este equipo. Si necesitas un cambio, pídelo abajo y lo verá quien corresponde.</p>
        </section>
      )}

      {(myRequests ?? []).map((r: any) => (
        <PendingRequestCard key={r.id} id={r.id}
          label={MEMBER_REQUEST_KIND_LABEL[r.kind] ?? r.kind}
          detail={r.kind === 'join'
            ? `${(r.ministry_preferences ?? []).length} ministerio(s) elegido(s) — el primer director que acepte te suma a su equipo`
            : r.kind === 'role_change' ? (r.details ?? '')
            : (r.ministries?.name ?? '')}
          since={fmtDate(r.created_at)} />
      ))}

      {(resolved ?? []).map((r: any) => (
        <section key={r.id} className={`card space-y-1 ${r.status === 'accepted' ? 'border-green-200/70 bg-green-50/40' : 'border-red-200/70 bg-red-50/40'}`}>
          <p className={`text-[11px] font-bold uppercase tracking-widest ${r.status === 'accepted' ? 'text-green-700' : 'text-red-600'}`}>
            {r.status === 'accepted' ? 'Solicitud aceptada' : 'Solicitud rechazada'} · {fmtDate(r.resolved_at)}
          </p>
          <p className="font-semibold text-sm">{MEMBER_REQUEST_KIND_LABEL[r.kind] ?? r.kind}{r.ministries?.name ? ` · ${r.ministries.name}` : ''}</p>
          {r.resolution_note && <p className="text-sm text-gray-600">Nota: {r.resolution_note}</p>}
        </section>
      ))}

      {/* Postularse exige ser miembro activo (013). Un director o un admin puede
          entrar aquí sin serlo: ve el catálogo, pero no el panel de postulación. */}
      {isActiveMember && !current && !pendingKinds.has('join') && (
        <JoinRequestPanel ministries={activeMinistries} />
      )}

      {current && (
        <SelfServicePanel
          currentMinistryId={current.ministry_id}
          currentMinistryName={(current as any).ministries?.name ?? ''}
          otherMinistries={activeMinistries.filter((m) => m.id !== current.ministry_id)}
          pendingKinds={[...pendingKinds] as string[]}
        />
      )}

      <h2 className="text-lg font-bold pt-2">Conoce los equipos</h2>
      {((ministries as any[]) ?? []).map((m: any) => (
        <section key={m.id} className="card space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-bold inline-flex items-center gap-2">
                <HeartHandshake className="w-4 h-4 text-brand-600" aria-hidden /> {m.name}
              </h3>
              {m.leader_name && <p className="text-xs text-gray-500">Líder: {m.leader_name}</p>}
            </div>
            {mineMap.has(m.id) && <StatusBadge status={mineMap.get(m.id)!} label={MINISTRY_ASSIGN_LABEL[mineMap.get(m.id)!]} />}
          </div>
          {m.description && <p className="text-sm text-gray-600">{m.description}</p>}
          {m.meeting_info && (
            <p className="text-xs text-gray-600 inline-flex items-center gap-1.5">
              <CalendarClock className="w-3.5 h-3.5 text-brand-600 shrink-0" aria-hidden /> {m.meeting_info}
            </p>
          )}
          {m.requirements && <p className="text-xs text-amber-700">Requisitos: {m.requirements}</p>}
          {/* Si su director no publicó el contacto, el RPC ya devuelve null: aquí
              no hay nada que ocultar porque el dato nunca llegó (migración 016). */}
          {(m.leader_contact || m.reference_contact) && (
            <div className="pt-1.5 border-t border-gray-100 text-xs text-gray-600 space-y-0.5">
              {m.leader_contact && (
                <p className="inline-flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-brand-600 shrink-0" aria-hidden />
                  {m.leader_name ? `${m.leader_name}: ` : ''}{m.leader_contact}
                </p>
              )}
              {m.reference_contact && (
                <p className="block">
                  {m.reference_name ? `${m.reference_name}: ` : 'También: '}{m.reference_contact}
                </p>
              )}
            </div>
          )}
        </section>
      ))}
      {((ministries as any[]) ?? []).length === 0 && <p className="card text-sm text-gray-600">La iglesia aún no publicó sus ministerios.</p>}
    </div>
  );
}
