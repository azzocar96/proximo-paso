-- ============================================================
-- 021 — Las costuras entre fases
-- ============================================================
-- La app se construyó en siete fases y cada una se auditó por separado. Esta
-- migración corrige lo que se rompió AL SUPERPONERLAS: reglas que una fase
-- añadió y otra no acompañó, pantallas nuevas que no retiraron a las viejas, y
-- permisos que tres fases se olvidaron de cerrar.
--
-- Lo más grave, y lo primero:

-- ---------- 1. CRÍTICO: ni el orador ni el servidor podían aprobar una asistencia ----------
-- `approve_attendance_request` llama a `fn_refresh_enrollment`, que llama a
-- `get_progress`, que desde la 002 corta con "no autorizado" si quien pregunta
-- no es la persona inscrita ni `fn_is_staff()`. La 008 sumó al ORADOR como
-- aprobador y la 019 al SERVIDOR, pero ninguna tocó ese corte: la excepción
-- sube sin nadie que la recoja y revierte también el update de la asistencia.
-- Resultado: aprobar una asistencia olvidada NUNCA funcionó salvo para el
-- administrador. Y le pasa igual al coordinador de un ciclo que está en
-- `cycle_coordinators` pero no tiene el rol `coordinator` en `user_roles`, que
-- es como los crea el panel.
--
-- El arreglo se hace sobre la definición REAL que hay en la base, no sobre una
-- copia escrita a mano: se lee con pg_get_functiondef, se sustituye la línea
-- del control de acceso y se vuelve a crear. Si esa línea no está donde se
-- espera, la migración falla en vez de dejar el sistema a medias.
do $mig$
declare def text;
begin
  select pg_get_functiondef(p.oid) into def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'get_progress';
  if def is null then raise exception 'get_progress no existe'; end if;
  if position('app.progress_internal' in def) > 0 then return; end if;

  def := replace(def,
    'if e.user_id <> auth.uid() and not fn_is_staff() then',
    'if e.user_id <> auth.uid() and not fn_is_staff()'
    || ' and not fn_is_coordinator_of(e.cycle_id)'
    || ' and coalesce(current_setting(''app.progress_internal'', true), '''') <> ''on'' then');
  if position('app.progress_internal' in def) = 0 then
    raise exception 'No se encontró el control de acceso esperado dentro de get_progress';
  end if;
  execute def;
end $mig$;

-- Y quien recalcula el progreso por dentro levanta la bandera. `set_config`
-- vive en pg_catalog y PostgREST no expone ese esquema, así que nadie puede
-- encenderla desde el navegador.
do $mig$
declare def text;
begin
  select pg_get_functiondef(p.oid) into def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'fn_refresh_enrollment';
  if def is null then raise exception 'fn_refresh_enrollment no existe'; end if;
  if position('app.progress_internal' in def) > 0 then return; end if;

  def := replace(def,
    'p := get_progress(p_enrollment);',
    'perform set_config(''app.progress_internal'', ''on'', true);'
    || ' p := get_progress(p_enrollment);'
    || ' perform set_config(''app.progress_internal'', ''off'', true);');
  if position('app.progress_internal' in def) = 0 then
    raise exception 'No se encontró la llamada a get_progress dentro de fn_refresh_enrollment';
  end if;
  execute def;
end $mig$;

-- ---------- 2. ALTO: los contactos "privados" los leía cualquiera con cuenta ----------
-- La 016 quitó el select a `anon` y montó el catálogo por RPC, pero la policy
-- `p_min_sel` solo exige `deleted_at is null` y la 010 dio select a
-- `authenticated`: con la clave pública del navegador, cualquier participante
-- podía pedir `ministries?select=leader_contact` y llevarse los teléfonos que
-- su director decidió NO publicar. La casilla seguía siendo cosmética.
--
-- Se cierra por columna, que es lo único que distingue "ver el ministerio" de
-- "ver su teléfono". Las funciones security definer siguen leyéndolos.
-- OJO: un `revoke select (columna)` NO quita un permiso concedido a nivel de
-- TABLA (la 010 dio `select` sobre todas las tablas a `authenticated`), y eso
-- se comprobó en producción: seguía devolviendo `true`. Hay que quitar el
-- permiso de tabla y volver a darlo columna por columna.
revoke select on ministries from authenticated, anon;
grant select (id, name, description, requirements, meeting_info, image_url, capacity, status,
              leader_name, reference_name, show_contact, is_course_ministry,
              created_at, updated_at, deleted_at)
  on ministries to authenticated;

-- Quien administra sí necesita los datos crudos para editarlos: un RPC que
-- devuelve la ficha completa SOLO de los ministerios que esa persona maneja.
create or replace function get_ministries_manage()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(t) order by t.name) from (
      select m.id, m.name, m.description, m.requirements, m.meeting_info, m.capacity,
             m.status, m.image_url, m.is_course_ministry, m.show_contact,
             m.leader_name, m.leader_contact, m.reference_name, m.reference_contact
      from ministries m
      where m.deleted_at is null
        and (fn_is_admin() or fn_is_ministry_leader_of(m.id))
    ) t
  ), '[]'::jsonb);
end $$;

-- ---------- 3. ALTO: un director degradado seguía repartiendo membresías ----------
-- La 017 apoyó la facultad de aprobar "miembro activo" en la mera existencia de
-- una fila en `ministry_leaders`. A quien pierde la marca de miembro activo no
-- se le retira el cargo (decisión de la 014, pensada solo para la navegación),
-- así que un director degradado, suspendido o de un ministerio archivado seguía
-- abriendo los muros a quien quisiera.
create or replace function fn_can_review_active_member()
returns boolean language sql stable security definer set search_path = public as $$
  select fn_is_admin() or exists (
    select 1 from ministry_leaders ml
      join ministries mi on mi.id = ml.ministry_id
      join profiles p on p.id = ml.user_id
     where ml.user_id = auth.uid()
       and p.active_member and p.account_status = 'active'
       and mi.status = 'active' and mi.deleted_at is null);
$$;

-- ---------- 4. ALTO: suspender una cuenta no bloqueaba nada ----------
-- `account_status = 'suspended'` solo cambiaba el color de una etiqueta en el
-- panel. La persona seguía publicando en el muro y marcando asistencia.
create or replace function fn_is_active_account()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and account_status = 'active');
$$;

-- Los muros: copia EXACTA de la 013 y de la 019 con una sola condición delante.
create or replace function fn_can_view_wall(p_wall wall_kind, p_ministry uuid, p_step int)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when auth.uid() is null then false
    when not fn_is_active_account() then false
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

create or replace function fn_can_post_wall(p_wall wall_kind, p_ministry uuid, p_step int)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when auth.uid() is null then false
    when not fn_is_active_account() then false
    when fn_role() in ('pastor','superadmin') then true
    when p_wall = 'general' then
      exists (select 1 from wall_publishers where user_id = auth.uid())
      or exists (select 1 from ministry_leaders where user_id = auth.uid())
      or exists (select 1 from step_speakers where user_id = auth.uid())
    when p_wall = 'ministry' then
      exists (select 1 from ministry_leaders where user_id = auth.uid() and ministry_id = p_ministry)
      or fn_servant_has(p_ministry, 'can_post_wall')
    when p_wall = 'step' then
      exists (select 1 from step_speakers where user_id = auth.uid() and step_number = p_step)
    else false
  end;
$$;

-- ---------- 5. ALTO: seis acciones del panel no dejaban rastro ----------
-- `fn_audit` nunca tuvo grant: archivar un ciclo, suspender una cuenta, cambiar
-- la configuración o asignar un coordinador se hacían sin registro y sin que
-- nadie se enterara, porque las llamadas no miran el error.
grant execute on function fn_audit(text,text,uuid,text,jsonb) to authenticated;

-- ---------- 6. MEDIO: aceptar un cambio de ministerio no revalidaba nada ----------
-- La regla "solo miembros activos entran a un ministerio" (013) se comprobaba
-- al CREAR la solicitud, no al aceptarla semanas después. Copia EXACTA de la
-- versión de la 019 con dos comprobaciones añadidas en la rama `switch`.
create or replace function accept_member_request(p_request uuid, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  select * into r from member_requests where id = p_request for update;
  if r is null then raise exception 'solicitud no encontrada'; end if;
  if r.status <> 'pending' then raise exception 'la solicitud ya fue resuelta'; end if;
  if r.kind = 'join' then raise exception 'usa accept_ministry_join para ingresos'; end if;
  if r.kind = 'director' then
    raise exception 'Las solicitudes de dirección se resuelven con su propio botón, en Solicitudes.';
  end if;
  if r.kind = 'role_change' then
    if not fn_is_admin() then raise exception 'solo el administrador o pastor resuelve cambios de rol'; end if;
  elsif not (fn_is_admin() or fn_is_ministry_leader_of(r.target_ministry_id)) then
    raise exception 'no autorizado';
  end if;

  if r.kind = 'leave' then
    update ministry_assignments set status = 'inactive', updated_at = now()
      where user_id = r.user_id and ministry_id = r.target_ministry_id;
  elsif r.kind = 'switch' then
    -- NUEVO (021): entre la solicitud y la aceptación pueden pasar semanas.
    if not exists (select 1 from profiles
                    where id = r.user_id and active_member and account_status = 'active') then
      raise exception 'Esa persona ya no es miembro activo con la cuenta al día.';
    end if;
    if not exists (select 1 from ministries
                    where id = r.target_ministry_id and status = 'active' and deleted_at is null) then
      raise exception 'Ese ministerio ya no está activo.';
    end if;
    update ministry_assignments set status = 'inactive', updated_at = now()
      where user_id = r.user_id and status in ('assigned','active')
        and ministry_id <> r.target_ministry_id;
    insert into ministry_assignments (ministry_id, user_id, status, assigned_by)
    values (r.target_ministry_id, r.user_id, 'assigned', auth.uid())
    on conflict (ministry_id, user_id)
      do update set status = 'assigned', assigned_by = auth.uid(), updated_at = now();
  end if;

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

-- ---------- 7. MEDIO: un QR seguía vivo después de archivar el ciclo ----------
-- `register_attendance` miraba el token y la ventana, nunca el estado del
-- ciclo. Archivar un ciclo con la asistencia abierta dejaba el código sirviendo
-- hasta que venciera. Se corrige donde de verdad manda, no en la interfaz.
do $mig$
declare def text;
begin
  select pg_get_functiondef(p.oid) into def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'register_attendance';
  if def is null then raise exception 'register_attendance no existe'; end if;
  if position('ciclo ya está cerrado' in def) > 0 then return; end if;

  def := replace(def,
    'select * into c from course_cycles where id = s.cycle_id;',
    'select * into c from course_cycles where id = s.cycle_id;'
    || ' if c.deleted_at is not null or c.status in (''archived'',''cancelled'',''completed'') then'
    || '   return jsonb_build_object(''ok'',false,''code'',''session_closed'','
    || '     ''message'',''Este ciclo ya está cerrado.''); end if;');
  if position('ciclo ya está cerrado' in def) = 0 then
    raise exception 'No se encontró la carga del ciclo dentro de register_attendance';
  end if;
  execute def;
end $mig$;

-- ---------- 8. MEDIO: el ministerio del curso podía quedar sin salida ----------
-- El índice único excluía los borrados pero no los inactivos: poner "Próximo
-- Paso" en Inactivo dejaba el sitio ocupado, a los servidores sin poderes y
-- sin forma de marcar otro ministerio como el del curso salvo con SQL a mano.
drop index if exists uq_one_course_ministry;
create unique index uq_one_course_ministry
  on ministries (is_course_ministry)
  where is_course_ministry and deleted_at is null and status = 'active';

-- ---------- 9. MEDIO: la bandeja vieja mostraba la solicitud de uno mismo ----------
-- Con botones que siempre fallaban, porque aprobar la propia está prohibido.
create or replace function get_active_member_requests()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_admin boolean := fn_is_admin();
begin
  if not fn_can_review_active_member() then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(t) order by t.desde) from (
      select p.id,
             p.first_name || ' ' || p.last_name as nombre,
             case when v_admin then p.email else null end as email,
             p.photo_url as foto,
             p.active_member_request_note as nota,
             p.active_member_requested_at as desde,
             exists (select 1 from certificates c
                      where c.user_id = p.id
                        and c.status in ('issued','delivered','ready_for_pickup','physical_pending')
                    ) as tiene_certificado
      from profiles p
      where p.active_member_requested_at is not null
        and not p.active_member
        and p.account_status = 'active'
        and p.id <> auth.uid()            -- NUEVO (021)
        and exists (select 1 from auth.users u
                     where u.id = p.id and u.email_confirmed_at is not null)
    ) t
  ), '[]'::jsonb);
end $$;

-- ---------- 10. MEDIO: el buzón solo dejaba aceptar en UN ministerio ----------
-- `/liderazgo` pinta un botón por cada preferencia que ese director dirige
-- ("Aceptar en Alabanza (su 1ª opción)"). El buzón resolvía uno solo con
-- `limit 1`, así que un director de dos equipos no podía elegir.
create or replace function get_my_inbox()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(t) order by t.fecha) from (
      select 'member_request' as origen, r.id::text as id, r.kind::text as tipo,
             r.details as detalle,
             coalesce(mi.name, mp.primer_nombre) as ministerio,
             coalesce(r.target_ministry_id::text, mp.primer_id) as ministerio_id,
             mp.opciones as opciones,
             p.first_name || ' ' || p.last_name as persona,
             r.created_at as fecha, null::text as extra
        from member_requests r
        join profiles p on p.id = r.user_id
        left join ministries mi on mi.id = r.target_ministry_id
        left join lateral (
          select (array_agg(x.id::text order by x.ord))[1] as primer_id,
                 (array_agg(x.nombre order by x.ord))[1] as primer_nombre,
                 jsonb_agg(jsonb_build_object('id', x.id, 'name', x.nombre, 'pref', x.ord)
                           order by x.ord) as opciones
            from (
              select m2.id, m2.name as nombre, u.ord
                from unnest(coalesce(r.ministry_preferences,'{}')) with ordinality as u(mid, ord)
                join ministries m2 on m2.id = u.mid
               where r.kind = 'join'
                 and (fn_is_ministry_leader_of(m2.id) or fn_is_admin())
            ) x
        ) mp on true
       where r.status = 'pending'
         and (
           (r.kind in ('leave','switch') and fn_is_ministry_leader_of(r.target_ministry_id))
           or (r.kind = 'join' and (fn_is_admin() or exists (
                 select 1 from ministry_leaders ml
                  where ml.user_id = v_uid
                    and ml.ministry_id = any(coalesce(r.ministry_preferences,'{}')))))
           or (r.kind in ('role_change','director') and fn_is_admin())
         )
      union all
      select 'active_member', p.id::text, 'active_member',
             p.active_member_request_note, null, null, null,
             p.first_name || ' ' || p.last_name, p.active_member_requested_at,
             case when exists (select 1 from certificates c where c.user_id = p.id
                                and c.status in ('issued','delivered','ready_for_pickup','physical_pending'))
                  then 'con_certificado' else null end
        from profiles p
       where fn_can_review_active_member()
         and p.active_member_requested_at is not null and not p.active_member
         and p.account_status = 'active'
         and p.id <> v_uid
         and exists (select 1 from auth.users u
                      where u.id = p.id and u.email_confirmed_at is not null)
      union all
      select 'attendance', ar.id::text, 'attendance',
             ar.request_note, cs.name, null, null,
             p.first_name || ' ' || p.last_name, ar.created_at, cs.step_number::text
        from attendance_records ar
        join course_sessions cs on cs.id = ar.session_id
        join profiles p on p.id = ar.user_id
       where ar.result = 'pending_approval'
         and ar.user_id <> v_uid
         and (fn_is_coordinator_of(cs.cycle_id) or fn_is_speaker_of(cs.step_number)
              or fn_servant_runs_step(ar.session_id, 'can_approve_attendance'))
    ) t
  ), '[]'::jsonb);
end $$;

-- ---------- 11. MEDIO: el guardián dejaba falsificar el archivo de aprobaciones ----------
-- Los campos de reseña se creyeron inofensivos en la 017 ("son etiquetas"),
-- pero el archivo de Solicitudes los lee: cualquiera podía inventarse una
-- aprobación firmada con el nombre del pastor. Ahora los cubre la misma
-- bandera que ya usa la propia persona al levantar la mano, así que
-- `request_active_member` sigue pudiendo limpiar su reseña anterior.
create or replace function fn_guard_profile_privileges() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_puede_aprobar boolean := fn_can_approve_active_member(new.id);
  v_admin boolean := fn_is_admin();
  v_propia boolean := coalesce(current_setting('app.member_request', true), '') = 'on';
begin
  if coalesce(current_setting('app.email_sync', true), '') <> 'on' then
    new.email := old.email;
  end if;

  if not v_admin then
    if not v_puede_aprobar then
      new.active_member := old.active_member;
      new.active_member_since := old.active_member_since;
      new.active_member_approved_by := old.active_member_approved_by;
    end if;
    if not v_puede_aprobar and not v_propia then
      new.active_member_requested_at := old.active_member_requested_at;
      new.active_member_request_note := old.active_member_request_note;
      -- NUEVO (021)
      new.active_member_reviewed_at := old.active_member_reviewed_at;
      new.active_member_reviewed_by := old.active_member_reviewed_by;
      new.active_member_review_status := old.active_member_review_status;
      new.active_member_review_note := old.active_member_review_note;
    end if;
    new.account_status := old.account_status;
  end if;

  if new.active_member and not coalesce(old.active_member, false) then
    new.active_member_requested_at := null;
    new.active_member_reviewed_at := coalesce(new.active_member_reviewed_at, now());
    new.active_member_review_status := coalesce(new.active_member_review_status, 'approved');
  end if;

  return new;
end $$;

-- ---------- 12. BAJO: clases de ciclos borrados en la pantalla del servidor ----------
create or replace function get_servant_sessions()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_min uuid;
begin
  select id into v_min from ministries
   where is_course_ministry and status = 'active' and deleted_at is null;
  if v_min is null then return '[]'::jsonb; end if;
  if not fn_servant_has(v_min, 'can_show_qr') then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(t) order by t.session_date nulls last, t.step_number) from (
      select cs.id, cs.name, cs.step_number, cs.session_date, cs.start_time, cs.end_time,
             cs.qr_active, cs.location_name, cc.name as ciclo
        from course_sessions cs
        join course_cycles cc on cc.id = cs.cycle_id
       where cc.status in ('registration_open','active')
         and cc.deleted_at is null          -- NUEVO (021)
         and cs.step_number in (
              select st.step_number from ministry_servants sv
                join ministry_servant_steps st on st.servant_id = sv.id
               where sv.ministry_id = v_min and sv.user_id = auth.uid())
         and (cs.session_date is null or cs.session_date >= current_date - 7)
    ) t
  ), '[]'::jsonb);
end $$;

-- ---------- 13. BAJO: el director aparecía en su propia lista de candidatos ----------
create or replace function get_ministry_candidates(p_ministry uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not (fn_is_admin() or fn_is_ministry_leader_of(p_ministry)) then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(t) order by t.nombre) from (
      select p.id, p.first_name || ' ' || p.last_name as nombre,
             exists (select 1 from ministry_servants s
                      where s.ministry_id = p_ministry and s.user_id = p.id) as ya_es_servidor
      from ministry_assignments ma join profiles p on p.id = ma.user_id
      where ma.ministry_id = p_ministry and ma.status in ('assigned','active')
        and p.active_member and p.account_status = 'active'
        and (p.id <> auth.uid() or fn_is_admin())   -- NUEVO (021)
    ) t
  ), '[]'::jsonb);
end $$;

-- ---------- 14. MEDIO: 22 funciones security definer seguían abiertas a anon ----------
-- La 002 revocó "todas las funciones del esquema" ANTES de que existieran las
-- fases 2, 3a y 3b. Ninguna es explotable hoy (todas comprueban auth.uid() o
-- fn_role() en su cuerpo), pero son security definer y corren como el dueño:
-- la superficie no tiene por qué estar abierta.
-- Se revoca a PUBLIC (que es de donde les venía) y acto seguido se le devuelve
-- a `authenticated` exactamente lo que tenía: el único que pierde acceso es
-- `anon`. Se dejan fuera las funciones de trigger y la política de registro,
-- que el formulario público sí necesita leer sin sesión.
do $mig$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef
       and p.prorettype <> 'trigger'::regtype
       and has_function_privilege('anon', p.oid, 'execute')
       and p.proname <> 'fn_registration_policy'
  loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $mig$;

-- ---------- 15. Permisos de lo nuevo ----------
revoke execute on function get_ministries_manage() from public, anon;
revoke execute on function fn_is_active_account() from public, anon;
revoke execute on function fn_clear_active_member_review(uuid) from public, anon, authenticated;
grant execute on function get_ministries_manage() to authenticated;
grant execute on function fn_is_active_account() to authenticated;

-- El barrido de arriba es amplio a propósito; estas son las que la interfaz
-- llama y tienen que seguir disponibles para quien tiene sesión.
grant execute on function fn_audit(text,text,uuid,text,jsonb) to authenticated;
grant execute on function get_progress(uuid) to authenticated;
grant execute on function fn_can_view_wall(wall_kind,uuid,int) to authenticated;
grant execute on function fn_can_post_wall(wall_kind,uuid,int) to authenticated;
grant execute on function fn_can_review_active_member() to authenticated;
grant execute on function get_active_member_requests() to authenticated;
grant execute on function get_my_inbox() to authenticated;
grant execute on function get_servant_sessions() to authenticated;
grant execute on function get_ministry_candidates(uuid) to authenticated;
grant execute on function accept_member_request(uuid,text) to authenticated;
grant execute on function request_active_member(text) to authenticated;

-- ---------- 16. CRÍTICO (encontrado al verificar): marcar asistencia nunca funcionó ----------
-- Al probar la aprobación de una asistencia por parte de una oradora salió:
--
--   column "status" is of type enrollment_status but expression is of type text
--
-- Viene de la 002: `update enrollments set status = case when … then
-- 'requirements_pending' else 'in_progress' end`. Las dos ramas del CASE son
-- literales sin tipo, así que Postgres lo resuelve como `text` y la asignación
-- a la columna enum revienta. Ese bloque se ejecuta en cuanto alguien tiene UN
-- paso hecho, y `register_attendance` llama a esta función siempre: significa
-- que **registrar asistencia por QR fallaba desde la primera clase**, igual que
-- aprobar una asistencia olvidada.
--
-- Encaja con lo que ya sabíamos: el QR ni siquiera se podía generar (020), así
-- que nadie llegó nunca a escanear uno y nadie vio este error.
--
-- Se corrige sobre la definición real, no sobre una copia escrita a mano.
do $mig$
declare def text;
begin
  select pg_get_functiondef(p.oid) into def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'fn_refresh_enrollment';
  if def is null then raise exception 'fn_refresh_enrollment no existe'; end if;
  if position('::enrollment_status' in def) > 0 then return; end if;

  def := replace(def,
    'then ''requirements_pending'' else ''in_progress'' end',
    'then ''requirements_pending''::enrollment_status else ''in_progress''::enrollment_status end');
  if position('::enrollment_status' in def) = 0 then
    raise exception 'No se encontró el CASE de estado dentro de fn_refresh_enrollment';
  end if;
  execute def;
end $mig$;
