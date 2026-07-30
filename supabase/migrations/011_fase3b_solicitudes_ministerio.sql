-- ================================================================
-- 011 — Fase 3b: solicitudes de ministerio y autogestión del miembro
--
-- Spec confirmada con Jesús (Bitácora 2026-07-30):
-- · Ingreso: la persona elige hasta 3 ministerios EN ORDEN de
--   preferencia; la solicitud les llega A LOS 3 directores A LA VEZ
--   y EL PRIMERO QUE ACEPTA SE LA QUEDA (no es flujo secuencial).
-- · Autogestión (miembro con ministerio asignado): puede solicitar
--   baja, cambio de ministerio (llega al director del DESTINO; al
--   aceptar sale automáticamente del anterior) o cambio de rol
--   (llega SOLO al administrador general).
-- · Un director puede sacar miembros de su ministerio; la persona
--   vuelve a la comunidad general.
-- ================================================================

create type member_request_kind as enum ('join','leave','switch','role_change');
create type member_request_status as enum ('pending','accepted','rejected','cancelled');

create table member_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  kind member_request_kind not null,
  -- join: hasta 3 ministerios en orden de preferencia (índice 0 = 1ª opción)
  ministry_preferences uuid[] default null,
  -- switch: ministerio DESTINO · leave: ministerio ACTUAL (para enrutar al director)
  target_ministry_id uuid references ministries(id) on delete cascade,
  details text,
  status member_request_status not null default 'pending',
  resolved_by uuid references profiles(id),
  resolved_ministry_id uuid references ministries(id),
  resolution_note text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint chk_join_prefs check (
    (kind = 'join' and ministry_preferences is not null
      and coalesce(array_length(ministry_preferences, 1), 0) between 1 and 3)
    or (kind <> 'join' and ministry_preferences is null)
  ),
  constraint chk_target check (
    (kind in ('leave','switch') and target_ministry_id is not null)
    or (kind in ('join','role_change') and target_ministry_id is null)
  )
);
create index idx_mr_user on member_requests(user_id);
create index idx_mr_status on member_requests(status);
-- una sola solicitud pendiente por tipo por persona
create unique index uq_mr_pending on member_requests(user_id, kind) where status = 'pending';

alter table member_requests enable row level security;

-- ¿El usuario actual es director de alguno de los ministerios implicados?
create or replace function fn_leader_of_request(p_request uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from member_requests r
    join ministry_leaders ml on ml.user_id = auth.uid()
    where r.id = p_request
      and (ml.ministry_id = r.target_ministry_id
           or ml.ministry_id = any(coalesce(r.ministry_preferences, '{}')))
  );
$$;

create policy p_mr_sel on member_requests for select using (
  user_id = auth.uid() or fn_is_admin() or fn_leader_of_request(id)
);
-- El dueño puede CREAR solicitudes de baja/cambio/rol (join va por RPC, que
-- valida las preferencias; updates SOLO vía RPCs security definer).
create policy p_mr_ins on member_requests for insert with check (
  user_id = auth.uid() and status = 'pending'
  and resolved_by is null and resolved_ministry_id is null
  and resolution_note is null and resolved_at is null
  and (
    (kind = 'leave' and exists (
      select 1 from ministry_assignments ma
      where ma.user_id = auth.uid() and ma.ministry_id = target_ministry_id
        and ma.status in ('assigned','active')))
    or (kind = 'switch'
      and exists (select 1 from ministries mi
                  where mi.id = target_ministry_id and mi.status = 'active' and mi.deleted_at is null)
      and exists (select 1 from ministry_assignments ma
                  where ma.user_id = auth.uid() and ma.status in ('assigned','active')
                    and ma.ministry_id <> target_ministry_id))
    or (kind = 'role_change')
  )
);

-- Director ve las asignaciones de SU ministerio (antes solo dueño/admin)
create policy p_mas_sel_leader on ministry_assignments for select using (
  fn_is_ministry_leader_of(ministry_id)
);

-- Director ve el perfil de miembros de su ministerio y de solicitantes hacia él
create or replace function fn_leader_can_see_profile(p_profile uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from ministry_leaders ml
    where ml.user_id = auth.uid() and (
      exists (select 1 from ministry_assignments ma
              where ma.user_id = p_profile and ma.ministry_id = ml.ministry_id
                and ma.status in ('assigned','active'))
      or exists (select 1 from member_requests r
                 where r.user_id = p_profile and r.status = 'pending'
                   and (r.target_ministry_id = ml.ministry_id
                        or ml.ministry_id = any(coalesce(r.ministry_preferences, '{}'))))
    )
  );
$$;
create policy p_prof_sel_leader3b on profiles for select using (fn_leader_can_see_profile(id));

-- ---------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------

-- El participante pide ingresar (hasta 3 ministerios en orden)
create or replace function request_ministry_join(p_ministries uuid[])
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_count int;
begin
  if auth.uid() is null then raise exception 'sesión no válida'; end if;
  if p_ministries is null or coalesce(array_length(p_ministries, 1), 0) not between 1 and 3 then
    raise exception 'elige entre 1 y 3 ministerios';
  end if;
  select count(distinct m) into v_count from unnest(p_ministries) m;
  if v_count <> array_length(p_ministries, 1) then raise exception 'ministerios repetidos'; end if;
  if exists (select 1 from unnest(p_ministries) m
             left join ministries mi on mi.id = m
             where mi.id is null or mi.status <> 'active' or mi.deleted_at is not null) then
    raise exception 'algún ministerio no existe o no está activo';
  end if;
  if exists (select 1 from ministry_assignments
             where user_id = auth.uid() and status in ('assigned','active')) then
    raise exception 'ya perteneces a un ministerio; usa "solicitar cambio"';
  end if;
  if exists (select 1 from member_requests where user_id = auth.uid() and kind = 'join' and status = 'pending') then
    raise exception 'ya tienes una solicitud de ingreso pendiente; cancélala primero si quieres cambiarla';
  end if;
  insert into member_requests (user_id, kind, ministry_preferences)
  values (auth.uid(), 'join', p_ministries) returning id into v_id;
  perform fn_audit('request_ministry_join','member_requests',v_id,null,
    jsonb_build_object('preferences', p_ministries));
  return v_id;
end $$;

-- Un director acepta la solicitud de ingreso EN SU ministerio (el 1º gana)
create or replace function accept_ministry_join(p_request uuid, p_ministry uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if not (fn_is_admin() or fn_is_ministry_leader_of(p_ministry)) then
    raise exception 'no autorizado';
  end if;
  -- lock para que "el primero gana" sea atómico si dos directores aceptan a la vez
  select * into r from member_requests where id = p_request for update;
  if r is null or r.kind <> 'join' then raise exception 'solicitud no encontrada'; end if;
  if r.status <> 'pending' then raise exception 'la solicitud ya fue resuelta (otro director la tomó primero)'; end if;
  if not (p_ministry = any(r.ministry_preferences)) then
    raise exception 'ese ministerio no está entre las preferencias de la persona';
  end if;
  if not exists (select 1 from ministries where id = p_ministry and status = 'active' and deleted_at is null) then
    raise exception 'ese ministerio ya no está activo';
  end if;
  if exists (select 1 from ministry_assignments
             where user_id = r.user_id and status in ('assigned','active')) then
    raise exception 'esta persona ya pertenece a un ministerio (revisa con el administrador)';
  end if;
  update member_requests
    set status = 'accepted', resolved_by = auth.uid(),
        resolved_ministry_id = p_ministry, resolved_at = now()
    where id = p_request;
  insert into ministry_assignments (ministry_id, user_id, status, assigned_by)
  values (p_ministry, r.user_id, 'assigned', auth.uid())
  on conflict (ministry_id, user_id)
    do update set status = 'assigned', assigned_by = auth.uid(), updated_at = now();
  perform fn_audit('accept_ministry_join','member_requests',p_request,null,
    jsonb_build_object('ministry', p_ministry, 'user', r.user_id));
end $$;

-- Aceptar baja / cambio / cambio de rol
create or replace function accept_member_request(p_request uuid, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  select * into r from member_requests where id = p_request for update;
  if r is null then raise exception 'solicitud no encontrada'; end if;
  if r.status <> 'pending' then raise exception 'la solicitud ya fue resuelta'; end if;
  if r.kind = 'join' then raise exception 'usa accept_ministry_join para ingresos'; end if;
  if r.kind = 'role_change' then
    if not fn_is_admin() then raise exception 'solo el administrador o pastor resuelve cambios de rol'; end if;
  elsif not (fn_is_admin() or fn_is_ministry_leader_of(r.target_ministry_id)) then
    raise exception 'no autorizado';
  end if;

  if r.kind = 'leave' then
    update ministry_assignments set status = 'inactive', updated_at = now()
      where user_id = r.user_id and ministry_id = r.target_ministry_id;
  elsif r.kind = 'switch' then
    -- sale automáticamente de su ministerio anterior
    update ministry_assignments set status = 'inactive', updated_at = now()
      where user_id = r.user_id and status in ('assigned','active')
        and ministry_id <> r.target_ministry_id;
    insert into ministry_assignments (ministry_id, user_id, status, assigned_by)
    values (r.target_ministry_id, r.user_id, 'assigned', auth.uid())
    on conflict (ministry_id, user_id)
      do update set status = 'assigned', assigned_by = auth.uid(), updated_at = now();
  end if;
  -- role_change: el cambio real lo aplica el admin en Usuarios (set_user_role);
  -- aquí solo queda resuelta y auditada la solicitud.

  -- las demás solicitudes de ministerio del usuario quedan obsoletas
  if r.kind in ('leave','switch') then
    update member_requests set status = 'cancelled', resolved_at = now()
      where user_id = r.user_id and id <> p_request and status = 'pending' and kind in ('join','leave','switch');
  end if;
  update member_requests
    set status = 'accepted', resolved_by = auth.uid(), resolution_note = p_note, resolved_at = now()
    where id = p_request;
  perform fn_audit('accept_member_request','member_requests',p_request,p_note,
    jsonb_build_object('kind', r.kind, 'user', r.user_id));
end $$;

-- Rechazar (join: solo admin; leave/switch: director implicado o admin; rol: solo admin)
create or replace function reject_member_request(p_request uuid, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if p_note is null or length(trim(p_note)) < 5 then
    raise exception 'indica un motivo (mínimo 5 caracteres)';
  end if;
  select * into r from member_requests where id = p_request for update;
  if r is null then raise exception 'solicitud no encontrada'; end if;
  if r.status <> 'pending' then raise exception 'la solicitud ya fue resuelta'; end if;
  if r.kind in ('join','role_change') then
    if not fn_is_admin() then raise exception 'no autorizado'; end if;
  elsif not (fn_is_admin() or fn_is_ministry_leader_of(r.target_ministry_id)) then
    raise exception 'no autorizado';
  end if;
  update member_requests
    set status = 'rejected', resolved_by = auth.uid(), resolution_note = p_note, resolved_at = now()
    where id = p_request;
  perform fn_audit('reject_member_request','member_requests',p_request,p_note,
    jsonb_build_object('kind', r.kind, 'user', r.user_id));
end $$;

-- El dueño cancela su propia solicitud pendiente
create or replace function cancel_member_request(p_request uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update member_requests set status = 'cancelled', resolved_at = now()
    where id = p_request and user_id = auth.uid() and status = 'pending';
  if not found then raise exception 'solicitud no encontrada o ya resuelta'; end if;
  perform fn_audit('cancel_member_request','member_requests',p_request,null,null);
end $$;

-- Un director saca a alguien de su ministerio (vuelve a comunidad general)
create or replace function remove_ministry_member(p_ministry uuid, p_user uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_assignment uuid;
begin
  if not (fn_is_admin() or fn_is_ministry_leader_of(p_ministry)) then
    raise exception 'no autorizado';
  end if;
  if p_reason is null or length(trim(p_reason)) < 5 then
    raise exception 'indica un motivo (mínimo 5 caracteres)';
  end if;
  update ministry_assignments set status = 'inactive', updated_at = now()
    where ministry_id = p_ministry and user_id = p_user and status in ('assigned','active')
    returning id into v_assignment;
  if v_assignment is null then raise exception 'esa persona no está activa en este ministerio'; end if;
  perform fn_audit('remove_ministry_member','ministry_assignments',v_assignment,p_reason,
    jsonb_build_object('user', p_user, 'ministry', p_ministry));
end $$;

-- ---------------------------------------------------------------
grant select on member_requests to authenticated;
grant execute on function fn_leader_of_request(uuid) to authenticated;
grant execute on function fn_leader_can_see_profile(uuid) to authenticated;
grant execute on function request_ministry_join(uuid[]) to authenticated;
grant execute on function accept_ministry_join(uuid, uuid) to authenticated;
grant execute on function accept_member_request(uuid, text) to authenticated;
grant execute on function reject_member_request(uuid, text) to authenticated;
grant execute on function cancel_member_request(uuid) to authenticated;
grant execute on function remove_ministry_member(uuid, uuid, text) to authenticated;
