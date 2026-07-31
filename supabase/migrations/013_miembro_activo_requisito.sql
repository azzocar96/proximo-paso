-- ============================================================
-- 013 — Regla confirmada por Jesús: ministerios y muros solo
--       para quien completó el curso (miembro activo)
-- ============================================================
-- "Todos con acceso al link pueden ingresar, pero para ser miembro activo,
--  ver la información y los muros, tiene que haber completado el curso;
--  de lo contrario solo ve lo relativo a su proceso."
--
-- Decisiones de detalle confirmadas: al participante en proceso NO le aparece
-- "Ministerios" ni "Muro" en el menú, y no puede postularse a un ministerio.
--
-- Qué NO cambia:
--   · El muro general ya exigía miembro activo desde la 012.
--   · El muro del paso sigue disponible para el inscrito en un ciclo activo:
--     es la conversación de su propia clase con su orador, o sea, "lo relativo
--     a su proceso". Si se quisiera cerrar también, es quitar la última rama
--     de fn_can_view_wall.
--   · Directores y oradores conservan lo suyo aunque no sean miembros activos.
--
-- Nota de la auditoría previa (11 hallazgos, todos corregidos aquí):
-- el punto crítico era que cerrar solo la CREACIÓN de solicitudes dejaba vivas
-- las pendientes de antes; se cierran también la aceptación y las heredadas.

-- ---------- 1. Ingreso a ministerio: solo miembros activos ----------
create or replace function request_ministry_join(p_ministries uuid[])
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_count int;
begin
  if auth.uid() is null then raise exception 'sesión no válida'; end if;
  -- NUEVO (013): hay que haber completado el curso
  if not exists (select 1 from profiles where id = auth.uid() and active_member) then
    raise exception 'Los ministerios se abren al completar el curso. Termina tus cuatro pasos y recibe tu certificado para poder postularte.';
  end if;
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

-- ---------- 2. Aceptar un ingreso: la persona debe seguir siendo miembro activo ----------
-- (CRÍTICO de la auditoría: sin esto, una solicitud creada antes de la regla —o de
--  alguien a quien le retiraron la marca— entraba igual al aceptarla el director.)
create or replace function accept_ministry_join(p_request uuid, p_ministry uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if not (fn_is_admin() or fn_is_ministry_leader_of(p_ministry)) then
    raise exception 'no autorizado';
  end if;
  select * into r from member_requests where id = p_request for update;
  if r is null or r.kind <> 'join' then raise exception 'solicitud no encontrada'; end if;
  if r.status <> 'pending' then raise exception 'la solicitud ya fue resuelta (otro director la tomó primero)'; end if;
  -- NUEVO (013)
  if not exists (select 1 from profiles where id = r.user_id and active_member) then
    raise exception 'esta persona aún no completó el curso, así que todavía no puede entrar a un ministerio';
  end if;
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

-- ---------- 3. Limpiar las solicitudes heredadas de antes de la regla ----------
update member_requests
   set status = 'cancelled', resolved_at = now(),
       resolution_note = 'Cancelada automáticamente: los ministerios se abren al completar el curso.'
 where kind = 'join' and status = 'pending'
   and user_id not in (select id from profiles where active_member);

-- ---------- 4. Cambio de rol: miembro activo o alguien ya asignado ----------
drop policy if exists p_mr_ins on member_requests;
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
    -- NUEVO (013): el cambio de rol también es cosa de gente ya integrada.
    -- Se acepta "ya asignado a un ministerio" además de "miembro activo" para no
    -- dejar fuera asignaciones heredadas ni a quien perdió la marca por error.
    or (kind = 'role_change' and (
          exists (select 1 from profiles p where p.id = auth.uid() and p.active_member)
          or exists (select 1 from ministry_assignments ma
                     where ma.user_id = auth.uid() and ma.status in ('assigned','active'))))
  )
);

-- ---------- 5. Una sola fuente de verdad para la navegación ----------
-- La auditoría marcó que tener el criterio repetido en el menú, en los accesos
-- móviles y en la página produce enlaces que llevan a pantallas de "no disponible"
-- (o peor, secciones ocultas que sí funcionan). Todo sale de aquí.
create or replace function fn_my_nav()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_admin boolean;
  v_active boolean;
  v_leader boolean;
  v_speaker boolean;
  v_assigned boolean;
  v_pending boolean;
  v_publisher boolean;
  v_step boolean;
begin
  if v_uid is null then
    return jsonb_build_object('role','participant','is_admin',false,'is_leader',false,
      'is_speaker',false,'is_active_member',false,'can_ministries',false,'can_wall',false);
  end if;
  v_role := fn_role()::text;
  v_admin := v_role in ('pastor','superadmin');
  select coalesce(active_member,false) into v_active from profiles where id = v_uid;
  v_leader  := exists (select 1 from ministry_leaders where user_id = v_uid);
  v_speaker := exists (select 1 from step_speakers where user_id = v_uid);
  v_assigned := exists (select 1 from ministry_assignments ma
                        join ministries mi on mi.id = ma.ministry_id
                        where ma.user_id = v_uid and ma.status in ('assigned','active')
                          and mi.status = 'active' and mi.deleted_at is null);
  v_pending := exists (select 1 from member_requests where user_id = v_uid and status = 'pending');
  v_publisher := exists (select 1 from wall_publishers where user_id = v_uid);
  -- inscrito en un ciclo activo que tenga sesión de alguno de los 4 pasos
  v_step := exists (select 1 from enrollments e
                    join course_cycles c on c.id = e.cycle_id
                    join course_sessions s on s.cycle_id = c.id and s.step_number between 1 and 4
                    where e.user_id = v_uid and c.status = 'active' and c.deleted_at is null
                      and e.status in ('registered','enrolled','in_progress','requirements_pending'));
  return jsonb_build_object(
    'role', v_role,
    'is_admin', v_admin,
    'is_leader', v_leader or v_admin,
    'is_speaker', v_speaker,
    'is_active_member', v_active,
    -- Ministerios: miembros activos, gente ya asignada, directores, admins, y
    -- quien tenga una solicitud viva (para que pueda al menos cancelarla).
    -- Los oradores NO entran por ser oradores: lo suyo vive en "Mi paso".
    'can_ministries', v_active or v_assigned or v_leader or v_admin or v_pending,
    -- Muro: mismos criterios que fn_can_view_wall de la 012, sin dejar fuera
    -- a los publicadores autorizados ni a los inscritos del ciclo activo.
    'can_wall', v_active or v_assigned or v_leader or v_speaker or v_admin or v_publisher or v_step
  );
end $$;

revoke execute on function fn_my_nav() from public, anon;
grant execute on function fn_my_nav() to authenticated;

-- ---------- 6. Coherencia del paso 5 (certificación) ----------
-- posts.step_number solo admite 1..4, pero get_my_walls listaba cualquier
-- step_number no nulo: un ciclo con sesión de certificación generaba una
-- pestaña "Paso 5" en la que nadie podía publicar.
create or replace function get_my_walls()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_admin boolean := fn_role() in ('pastor','superadmin');
  v_ministries jsonb;
  v_steps jsonb;
  v_led jsonb;
  v_speaker jsonb;
begin
  if v_uid is null then return jsonb_build_object('general', false, 'ministries', '[]'::jsonb, 'steps', '[]'::jsonb); end if;

  if v_admin then
    select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name), '[]'::jsonb)
      into v_ministries
      from ministries where status = 'active' and deleted_at is null;
    select coalesce(jsonb_agg(distinct s.step_number), '[]'::jsonb)
      into v_steps
      from course_sessions s
      join course_cycles c on c.id = s.cycle_id
      where c.status = 'active' and c.deleted_at is null and s.step_number between 1 and 4;
  else
    select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'name', m.name) order by m.name), '[]'::jsonb)
      into v_ministries
      from ministries m
      where m.status = 'active' and m.deleted_at is null and (
        exists (select 1 from ministry_leaders l where l.ministry_id = m.id and l.user_id = v_uid)
        or exists (select 1 from ministry_assignments a
                   where a.ministry_id = m.id and a.user_id = v_uid and a.status in ('assigned','active'))
      );
    select coalesce(jsonb_agg(distinct n), '[]'::jsonb) into v_steps from (
      select step_number as n from step_speakers where user_id = v_uid
      union
      select s.step_number from course_sessions s
        join course_cycles c on c.id = s.cycle_id
        where c.status = 'active' and c.deleted_at is null and s.step_number between 1 and 4
          and exists (select 1 from enrollments e
                      where e.cycle_id = c.id and e.user_id = v_uid
                        and e.status in ('registered','enrolled','in_progress','requirements_pending'))
    ) t where n between 1 and 4;
  end if;

  select coalesce(jsonb_agg(ministry_id), '[]'::jsonb) into v_led
    from ministry_leaders where user_id = v_uid;
  select coalesce(jsonb_agg(step_number), '[]'::jsonb) into v_speaker
    from step_speakers where user_id = v_uid;

  return jsonb_build_object(
    'general', fn_can_view_wall('general', null, null),
    'can_post_general', fn_can_post_wall('general', null, null),
    'is_admin', v_admin,
    'ministries', v_ministries,
    'steps', v_steps,
    'led_ministries', v_led,
    'speaker_steps', v_speaker
  );
end;
$$;

create or replace function fn_can_view_wall(p_wall wall_kind, p_ministry uuid, p_step int)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when auth.uid() is null then false
    when fn_role() in ('pastor','superadmin') then true
    when p_wall = 'general' then
      exists (select 1 from profiles where id = auth.uid() and active_member)
      or exists (select 1 from wall_publishers where user_id = auth.uid())
      or exists (select 1 from ministry_leaders where user_id = auth.uid())
      or exists (select 1 from step_speakers where user_id = auth.uid())
    when p_wall = 'ministry' then
      exists (select 1 from ministries where id = p_ministry and status = 'active' and deleted_at is null)
      and (
        exists (select 1 from ministry_leaders where user_id = auth.uid() and ministry_id = p_ministry)
        or exists (select 1 from ministry_assignments
                   where user_id = auth.uid() and ministry_id = p_ministry and status in ('assigned','active'))
      )
    when p_wall = 'step' then
      p_step between 1 and 4
      and (
        exists (select 1 from step_speakers where user_id = auth.uid() and step_number = p_step)
        or exists (select 1 from enrollments e
                   join course_cycles c on c.id = e.cycle_id
                   join course_sessions s on s.cycle_id = c.id and s.step_number = p_step
                   where e.user_id = auth.uid() and c.status = 'active' and c.deleted_at is null
                     and e.status in ('registered','enrolled','in_progress','requirements_pending'))
      )
    else false
  end;
$$;
