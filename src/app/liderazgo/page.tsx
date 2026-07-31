import Link from 'next/link';
import { Inbox, Users, Filter } from 'lucide-react';
import { requireMinistryLeader } from '@/lib/auth';
import { fmtDate, MEMBER_REQUEST_KIND_LABEL } from '@/lib/utils';
import { JoinRequestRow, OtherRequestRow, MemberRow, MinistryProfileCard, AddMemberCard } from './ui';

export const metadata = { title: 'Mi ministerio' };

/**
 * Panel del director de ministerio (Fase 3b). Ve y resuelve:
 * · solicitudes de INGRESO que incluyan su(s) ministerio(s) — el 1º que acepta gana
 * · solicitudes de CAMBIO hacia su ministerio y de BAJA de su ministerio
 * · sus miembros actuales (con opción de dar de baja, con motivo)
 * La RLS de 011 acota todo a sus propios ministerios.
 */
export default async function LiderazgoPage() {
  const { supabase, user } = await requireMinistryLeader();
  const { data: myRole } = await supabase.rpc('fn_role');
  const isAdminTier = ['pastor', 'superadmin'].includes(myRole as string);
  let { data: myMinistries } = await supabase.from('ministry_leaders')
    .select('ministry_id, ministries(id,name,description,requirements,meeting_info,show_contact,leader_name,leader_contact,reference_name,reference_contact)').eq('user_id', user.id).order('ministry_id');
  // Un admin/pastor pasa requireMinistryLeader sin filas propias: ve todos.
  if (!myMinistries || myMinistries.length === 0) {
    const { data: all } = await supabase.from('ministries').select('id,name,description,requirements,meeting_info,show_contact,leader_name,leader_contact,reference_name,reference_contact').eq('status', 'active').is('deleted_at', null).order('name');
    myMinistries = (all ?? []).map((m: any) => ({ ministry_id: m.id, ministries: m })) as any;
  }
  const myIds = (myMinistries ?? []).map((m: any) => m.ministry_id);
  const nameOf = new Map((myMinistries ?? []).map((m: any) => [m.ministry_id, m.ministries?.name]));

  const [{ data: requests }, { data: members }] = await Promise.all([
    supabase.from('member_requests')
      .select('*, profiles!member_requests_user_id_fkey(first_name,last_name,email), ministries:target_ministry_id(name)')
      .eq('status', 'pending').order('created_at'),
    supabase.from('ministry_assignments')
      .select('id,ministry_id,user_id,status,created_at, profiles!ministry_assignments_user_id_fkey(first_name,last_name,email), ministries(name)')
      .in('ministry_id', myIds).in('status', ['assigned', 'active']).order('created_at'),
  ]);

  const joins = (requests ?? []).filter((r: any) =>
    r.kind === 'join' && (r.ministry_preferences ?? []).some((m: string) => myIds.includes(m)));
  const others = (requests ?? []).filter((r: any) =>
    ['leave', 'switch'].includes(r.kind) && myIds.includes(r.target_ministry_id));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Mi ministerio</h1>
        <p className="text-sm text-gray-500">
          Diriges: <b>{myIds.map((id) => nameOf.get(id)).filter(Boolean).join(', ') || '—'}</b>
        </p>
      </div>

      <section className="card space-y-3">
        <h2 className="font-bold inline-flex items-center gap-2">
          <Inbox className="w-4 h-4 text-brand-600" aria-hidden />
          Solicitudes de ingreso ({joins.length})
        </h2>
        <p className="text-xs text-gray-500">
          Cada persona eligió hasta 3 ministerios en orden de preferencia. La ven todos los directores
          implicados a la vez: el primero que acepta se la queda.
        </p>
        <ul className="divide-y divide-gray-100">
          {joins.map((r: any) => (
            <JoinRequestRow key={r.id} request={r} canReject={isAdminTier}
              myOptions={(r.ministry_preferences ?? [])
                .map((mid: string, i: number) => ({ id: mid, name: nameOf.get(mid) ?? '', pref: i + 1 }))
                .filter((o: any) => myIds.includes(o.id))}
              allPrefs={(r.ministry_preferences ?? []).length}
              since={fmtDate(r.created_at)} />
          ))}
          {joins.length === 0 && <li className="py-2 text-sm text-gray-500">No hay solicitudes de ingreso pendientes.</li>}
        </ul>
      </section>

      <section className="card space-y-3">
        <h2 className="font-bold inline-flex items-center gap-2">
          <Inbox className="w-4 h-4 text-amber-600" aria-hidden />
          Bajas y cambios ({others.length})
        </h2>
        <ul className="divide-y divide-gray-100">
          {others.map((r: any) => (
            <OtherRequestRow key={r.id} request={r}
              kindLabel={MEMBER_REQUEST_KIND_LABEL[r.kind] ?? r.kind}
              ministryName={r.ministries?.name ?? ''} since={fmtDate(r.created_at)} />
          ))}
          {others.length === 0 && <li className="py-2 text-sm text-gray-500">No hay bajas ni cambios pendientes.</li>}
        </ul>
      </section>

      <AddMemberCard ministries={(myMinistries ?? []).map((m: any) => ({ id: m.ministry_id, name: m.ministries?.name ?? '' }))} />

      <div className="space-y-3">
        {(myMinistries ?? []).map((m: any) => (
          m.ministries ? <MinistryProfileCard key={m.ministry_id} ministry={m.ministries} /> : null
        ))}
      </div>

      <section className="card space-y-3">
        <h2 className="font-bold inline-flex items-center gap-2">
          <Users className="w-4 h-4 text-brand-600" aria-hidden />
          Miembros de tu equipo ({(members ?? []).length})
        </h2>
        <ul className="divide-y divide-gray-100">
          {(members ?? []).map((m: any) => <MemberRow key={m.id} member={m} />)}
          {(members ?? []).length === 0 && <li className="py-2 text-sm text-gray-500">Aún no hay miembros asignados.</li>}
        </ul>
      </section>

      <Link href="/liderazgo/segmentacion" className="card card-hover flex items-center justify-between text-sm">
        <span className="inline-flex items-center gap-2 font-medium">
          <Filter className="w-4 h-4 text-brand-600" aria-hidden />
          Ver interesados en mi ministerio (segmentación Dream Team)
        </span>
        <span className="text-gray-400">→</span>
      </Link>
    </div>
  );
}
