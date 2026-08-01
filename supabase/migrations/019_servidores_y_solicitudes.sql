-- ============================================================
-- 019 — Servidores de ministerio + Solicitudes en un solo lugar
-- ============================================================
-- Lo que pidió Jesús:
--   · Un cargo nuevo, "servidor": asistentes del director dentro de su
--     ministerio. Son miembros activos que ya sirven en ese equipo. El director
--     les da y les quita responsabilidades, y decide si aparecen en la ficha
--     pública del ministerio.
--   · En el ministerio del curso (Próximo Paso), un servidor puede quedar
--     asignado a un paso concreto: ahí puede mostrar el QR de asistencia y
--     aprobar a quien se le olvidó marcarla. El director del curso decide qué
--     servidor trabaja en qué paso, y se lo quita cuando quiera.
--   · El administrador y el pastor pueden auto-proclamarse directores. Los
--     demás tienen que SOLICITARLO y que el administrador lo apruebe.
--   · Una sección de Solicitudes con tres partes: lo que yo pedí, el buzón de
--     lo que me toca resolver a mí por mi cargo, y el archivo.
--
-- Decisiones confirmadas por Jesús (31-jul):
--   · Los permisos son una lista de casillas concretas, no texto libre: si el
--     sistema no puede hacer cumplir un permiso, no es un permiso.
--   · El servidor y el orador CONVIVEN. El orador sigue siendo el responsable
--     del paso; el servidor es el apoyo operativo. No se toca nada de lo que
--     ya funciona.
--   · Solo se puede nombrar servidor a alguien que YA está en ese equipo.
--   · Un servidor con permiso de asistencia puede abrir, mostrar, renovar y
--     cerrar la asistencia de SU paso.
--   · El QR pasa de 15 a 30 minutos.

-- ---------- 1. El ministerio del curso ----------
-- Los pasos solo existen en un ministerio: el del curso. Marcarlo con una
-- columna (en vez de comparar por nombre) evita que renombrarlo rompa nada.
alter table ministries add column if not exists is_course_ministry boolean not null default false;

-- Solo uno VIVO. Incluir los borrados dejaba el sistema en un callejón: si
-- alguien archiva el ministerio del curso por error, no se puede marcar otro.
create unique index if not exists uq_one_course_ministry
  on ministries (is_course_ministry) where is_course_ministry and deleted_at is null;

comment on column ministries.is_course_ministry is
  'Solo uno en toda la base. Es el ministerio que sostiene el curso: es el único donde los servidores se asignan a un paso.';

-- Primero se adopta el que ya exista con ese nombre: `ministries.name` no es
-- único, así que insertar a ciegas dejaría DOS "Próximo Paso" en el catálogo,
-- uno con veinte personas y otro vacío pero marcado como el del curso.
update ministries set is_course_ministry = true, updated_at = now()
 where lower(btrim(name)) = 'próximo paso' and deleted_at is null
   and not exists (select 1 from ministries where is_course_ministry and deleted_at is null);

-- Se crea solo si no había ninguno. Si ya hay uno marcado, esto no hace nada.
insert into ministries (name, description, status, is_course_ministry)
select 'Próximo Paso',
       'El equipo que sostiene el curso: recibe, acompaña y registra la asistencia de cada paso.',
       'active', true
where not exists (select 1 from ministries where is_course_ministry and deleted_at is null);

-- ---------- 2. Los servidores ----------
create table if not exists ministry_servants (
  id uuid primary key default gen_random_uuid(),
  ministry_id uuid not null references ministries(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  title text,
  contact text,
  notes text,
  -- Qué se le confía. Todo nace apagado: dar un permiso es una decisión.
  show_in_profile        boolean not null default false,
  can_show_qr            boolean not null default false,
  can_approve_attendance boolean not null default false,
  can_post_wall          boolean not null default false,
  can_give_info          boolean not null default false,
  can_add_members        boolean not null default false,
  assigned_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ministry_id, user_id),
  constraint chk_servant_texts check (
    char_length(coalesce(title,'')) <= 80
    and char_length(coalesce(contact,'')) <= 160
    and char_length(coalesce(notes,'')) <= 300)
);
create index if not exists idx_servants_user on ministry_servants(user_id);

create table if not exists ministry_servant_steps (
  servant_id uuid not null references ministry_servants(id) on delete cascade,
  step_number int not null check (step_number between 1 and 4),
  primary key (servant_id, step_number)
);

-- Mismo patrón que el muro (012): RLS encendida y SIN políticas. Todo el acceso
-- pasa por funciones security definer. Así no hay forma de leer ni escribir
-- estos permisos por REST, ni de que una policy mal escrita abra una puerta.
alter table ministry_servants enable row level security;
alter table ministry_servant_steps enable row level security;
revoke all on ministry_servants from anon, authenticated;
revoke all on ministry_servant_steps from anon, authenticated;

-- ---------- 3. ¿Qué puede hacer un servidor? ----------
-- Un permiso solo vale mientras la persona siga siendo miembro activo, con la
-- cuenta al día y asignada a ese equipo. Si el director la saca del equipo, sus
-- poderes mueren solos: no hace falta acordarse de revocarlos a mano.
create or replace function fn_servant_has(p_ministry uuid, p_perm text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare v boolean;
begin
  -- Lista blanca ANTES de construir la consulta. Antes esto se resolvía con un
  -- bloque `exception when others then return false`, que escondía cualquier
  -- fallo real (un grant que faltara, un tiempo de espera agotado) como si
  -- fuera "no tienes permiso", y además abría una subtransacción por FILA:
  -- estas funciones se evalúan dentro de policies.
  if p_perm not in ('show_in_profile','can_show_qr','can_approve_attendance',
                    'can_post_wall','can_give_info','can_add_members') then
    return false;
  end if;
  execute format($q$
    select exists (
      select 1 from ministry_servants s
        join profiles p on p.id = s.user_id
        join ministry_assignments ma on ma.user_id = s.user_id and ma.ministry_id = s.ministry_id
        join ministries mi on mi.id = s.ministry_id
       where s.ministry_id = $1 and s.user_id = auth.uid()
         and s.%I
         and p.active_member and p.account_status = 'active'
         and ma.status in ('assigned','active')
         and mi.status = 'active' and mi.deleted_at is null)
  $q$, p_perm) into v using p_ministry;
  return coalesce(v, false);
end $$;

-- ¿Puedo manejar la asistencia de ESTA sesión como servidor del curso?
create or replace function fn_servant_runs_session(p_session uuid, p_perm text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare v_step int; v_min uuid; v boolean;
begin
  -- El paso NO basta: sin mirar el ciclo, un servidor podía reabrir la
  -- asistencia de un ciclo cerrado hace un año y dejar que la gente de
  -- entonces volviera a marcar.
  select cs.step_number into v_step
    from course_sessions cs
    join course_cycles cc on cc.id = cs.cycle_id
   where cs.id = p_session
     and cc.status in ('registration_open','active') and cc.deleted_at is null;
  if v_step is null then return false; end if;
  select id into v_min from ministries
   where is_course_ministry and status = 'active' and deleted_at is null;
  if v_min is null then return false; end if;
  if not fn_servant_has(v_min, p_perm) then return false; end if;
  select exists (
    select 1 from ministry_servants s
      join ministry_servant_steps st on st.servant_id = s.id
     where s.ministry_id = v_min and s.user_id = auth.uid()
       and st.step_number = v_step) into v;
  return coalesce(v, false);
end $$;

-- La versión por número de paso, para la aprobación de asistencia.
-- Recibe la SESIÓN, no el número de paso: así el ciclo también se comprueba.
create or replace function fn_servant_runs_step(p_session uuid, p_perm text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare v_min uuid; v_step int; v boolean;
begin
  select cs.step_number into v_step
    from course_sessions cs
    join course_cycles cc on cc.id = cs.cycle_id
   where cs.id = p_session
     and cc.status in ('registration_open','active') and cc.deleted_at is null;
  if v_step is null then return false; end if;
  select id into v_min from ministries
   where is_course_ministry and status = 'active' and deleted_at is null;
  if v_min is null then return false; end if;
  if not fn_servant_has(v_min, p_perm) then return false; end if;
  select exists (
    select 1 from ministry_servants s
      join ministry_servant_steps st on st.servant_id = s.id
     where s.ministry_id = v_min and s.user_id = auth.uid()
       and st.step_number = v_step) into v;
  return coalesce(v, false);
end $$;

-- ---------- 4. El director nombra y quita servidores ----------
create or replace function set_ministry_servant(
  p_ministry uuid, p_user uuid,
  p_title text default null, p_contact text default null, p_notes text default null,
  p_show_in_profile boolean default false,
  p_can_show_qr boolean default false,
  p_can_approve_attendance boolean default false,
  p_can_post_wall boolean default false,
  p_can_give_info boolean default false,
  p_can_add_members boolean default false,
  p_steps int[] default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_name text; v_course boolean; v_id uuid; v_before jsonb; v_step int;
begin
  if not (fn_is_admin() or fn_is_ministry_leader_of(p_ministry)) then
    raise exception 'Solo el director de este ministerio o el administrador pueden nombrar servidores.';
  end if;
  -- Un director no se nombra servidor de su propio equipo: si no, podría
  -- auto-concederse abrir y aprobar la asistencia de TODOS los ciclos, algo
  -- que hasta ahora solo tenía un coordinador nombrado por el administrador.
  if p_user = auth.uid() and not fn_is_admin() then
    raise exception 'No puedes nombrarte servidor de tu propio ministerio.';
  end if;
  select is_course_ministry into v_course from ministries
   where id = p_ministry and status = 'active' and deleted_at is null;
  if v_course is null then raise exception 'Ese ministerio no está activo.'; end if;

  select first_name || ' ' || last_name into v_name from profiles
   where id = p_user and active_member and account_status = 'active';
  if v_name is null then
    raise exception 'Esa persona todavía no es miembro activo con la cuenta al día. Los servidores salen de tu propio equipo.';
  end if;
  if not exists (select 1 from ministry_assignments
                  where user_id = p_user and ministry_id = p_ministry
                    and status in ('assigned','active')) then
    raise exception 'Primero súmala a tu equipo y después nómbrala servidora.';
  end if;
  if char_length(coalesce(p_title,'')) > 80
     or char_length(coalesce(p_contact,'')) > 160
     or char_length(coalesce(p_notes,'')) > 300 then
    raise exception 'Alguno de los textos es demasiado largo.';
  end if;

  -- Los pasos solo existen en el ministerio del curso.
  if not v_course and coalesce(array_length(p_steps,1),0) > 0 then
    raise exception 'Solo el ministerio del curso trabaja por pasos.';
  end if;
  -- Y fuera del curso esos dos permisos no significan nada: se apagan aquí en
  -- vez de guardarse encendidos e invisibles en un formulario que no los pinta.
  if not v_course then
    p_can_show_qr := false;
    p_can_approve_attendance := false;
  end if;
  if v_course and (coalesce(p_can_show_qr,false) or coalesce(p_can_approve_attendance,false))
     and coalesce(array_length(p_steps,1),0) = 0 then
    raise exception 'Para manejar la asistencia hay que decir en qué paso sirve. Elige al menos uno.';
  end if;
  foreach v_step in array coalesce(p_steps, '{}'::int[]) loop
    if v_step < 1 or v_step > 4 then raise exception 'Los pasos van del 1 al 4.'; end if;
  end loop;

  select to_jsonb(s) - 'created_at' - 'updated_at' into v_before
    from ministry_servants s where s.ministry_id = p_ministry and s.user_id = p_user;

  insert into ministry_servants (
    ministry_id, user_id, title, contact, notes, show_in_profile,
    can_show_qr, can_approve_attendance, can_post_wall, can_give_info, can_add_members, assigned_by)
  values (p_ministry, p_user,
    nullif(btrim(coalesce(p_title,'')),''), nullif(btrim(coalesce(p_contact,'')),''),
    nullif(btrim(coalesce(p_notes,'')),''),
    coalesce(p_show_in_profile,false), coalesce(p_can_show_qr,false),
    coalesce(p_can_approve_attendance,false), coalesce(p_can_post_wall,false),
    coalesce(p_can_give_info,false), coalesce(p_can_add_members,false), auth.uid())
  on conflict (ministry_id, user_id) do update set
    title = excluded.title, contact = excluded.contact, notes = excluded.notes,
    show_in_profile = excluded.show_in_profile,
    can_show_qr = excluded.can_show_qr,
    can_approve_attendance = excluded.can_approve_attendance,
    can_post_wall = excluded.can_post_wall,
    can_give_info = excluded.can_give_info,
    can_add_members = excluded.can_add_members,
    assigned_by = auth.uid(), updated_at = now()
  returning id into v_id;

  delete from ministry_servant_steps where servant_id = v_id;
  if coalesce(array_length(p_steps,1),0) > 0 then
    insert into ministry_servant_steps (servant_id, step_number)
    select v_id, unnest(p_steps) on conflict do nothing;
  end if;

  perform fn_audit('set_ministry_servant','ministry_servants',v_id,p_notes,
    jsonb_build_object('antes', v_before, 'usuario', p_user, 'ministerio', p_ministry,
      'despues', (select to_jsonb(s) - 'created_at' - 'updated_at'
                    from ministry_servants s where s.id = v_id),
      'pasos', coalesce(p_steps,'{}'::int[])));
  return jsonb_build_object('name', v_name);
end $$;

create or replace function remove_ministry_servant(p_ministry uuid, p_user uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_name text; v_id uuid;
begin
  if not (fn_is_admin() or fn_is_ministry_leader_of(p_ministry)) then
    raise exception 'Solo el director de este ministerio o el administrador pueden quitar servidores.';
  end if;
  select s.id, p.first_name || ' ' || p.last_name into v_id, v_name
    from ministry_servants s join profiles p on p.id = s.user_id
   where s.ministry_id = p_ministry and s.user_id = p_user;
  if v_id is null then raise exception 'Esa persona no es servidora de este ministerio.'; end if;
  perform fn_audit('remove_ministry_servant','ministry_servants',v_id,null,
    jsonb_build_object('antes', (select to_jsonb(s) from ministry_servants s where s.id = v_id)));
  delete from ministry_servants where id = v_id;
  return jsonb_build_object('name', v_name);
end $$;

-- Lo que ve el director de su propio equipo: todo el detalle.
create or replace function get_ministry_servants(p_ministry uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not (fn_is_admin() or fn_is_ministry_leader_of(p_ministry)) then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(t) order by t.nombre) from (
      select s.user_id, p.first_name || ' ' || p.last_name as nombre, p.email, p.photo_url as foto,
             s.title, s.contact, s.notes, s.show_in_profile, s.can_show_qr,
             s.can_approve_attendance, s.can_post_wall, s.can_give_info, s.can_add_members,
             coalesce((select array_agg(st.step_number order by st.step_number)
                         from ministry_servant_steps st where st.servant_id = s.id), '{}') as pasos,
             -- Si dejó el equipo o perdió la marca de miembro activo, sus
             -- permisos ya no valen: hay que decirlo, no dejar al director
             -- creyendo que ese turno está cubierto.
             (p.active_member and p.account_status = 'active'
              and exists (select 1 from ministry_assignments ma
                           where ma.user_id = s.user_id and ma.ministry_id = s.ministry_id
                             and ma.status in ('assigned','active'))) as activa
      from ministry_servants s join profiles p on p.id = s.user_id
      where s.ministry_id = p_ministry
    ) t
  ), '[]'::jsonb);
end $$;

-- Quiénes de mi equipo pueden ser nombrados: miembros activos ya asignados.
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
    ) t
  ), '[]'::jsonb);
end $$;

-- ---------- 5. El catálogo muestra a quien el director quiso mostrar ----------
create or replace function get_ministries_catalog()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((
    select jsonb_agg(to_jsonb(t) order by t.name) from (
      select m.id, m.name, m.description, m.requirements, m.meeting_info, m.image_url,
             m.is_course_ministry,
             m.leader_name,
             case when m.show_contact then m.leader_contact    else null end as leader_contact,
             case when m.show_contact then m.reference_name    else null end as reference_name,
             case when m.show_contact then m.reference_contact else null end as reference_contact,
             -- Servidores: solo los que su director decidió publicar. El teléfono
             -- o correo sale únicamente si además le confió dar información.
             coalesce((
               select jsonb_agg(jsonb_build_object(
                        'nombre', p.first_name || ' ' || p.last_name,
                        'cargo', s.title,
                        'contacto', case when s.can_give_info then s.contact else null end)
                      order by p.first_name)
                 from ministry_servants s
                 join profiles p on p.id = s.user_id
                 join ministry_assignments ma
                   on ma.user_id = s.user_id and ma.ministry_id = s.ministry_id
                      and ma.status in ('assigned','active')
                where s.ministry_id = m.id and s.show_in_profile
                  and p.active_member and p.account_status = 'active'
             ), '[]'::jsonb) as servidores
      from ministries m
      where m.status = 'active' and m.deleted_at is null
    ) t
  ), '[]'::jsonb)
  where auth.uid() is not null;
$$;

-- ---------- 6. El servidor puede con la asistencia de SU paso ----------
create or replace function open_attendance(p_session uuid, p_ttl_minutes int default null)
returns table(token text, expires_at timestamptz) language plpgsql security definer set search_path = public as $$
declare s record; ttl int; tok text; exp timestamptz;
begin
  select cs.*, cc.id as cid into s from course_sessions cs join course_cycles cc on cc.id=cs.cycle_id where cs.id=p_session;
  if s is null then raise exception 'sesión no encontrada'; end if;
  -- NUEVO (019): además del coordinador, el servidor del curso asignado a ese paso.
  if not (fn_is_coordinator_of(s.cid) or fn_servant_runs_session(p_session, 'can_show_qr')) then
    raise exception 'No estás autorizado para abrir la asistencia de esta clase.';
  end if;
  ttl := coalesce(p_ttl_minutes, (select (value #>> '{}')::int from app_settings where key='default_token_ttl_min'), 30);
  update attendance_tokens set revoked=true where session_id=p_session and revoked=false;
  tok := encode(gen_random_bytes(32),'hex');
  exp := now() + make_interval(mins => ttl);
  insert into attendance_tokens (session_id, token, expires_at, created_by) values (p_session, tok, exp, auth.uid());
  update course_sessions set qr_active=true, status='open',
    attendance_open_at = coalesce(attendance_open_at, now()),
    attendance_close_at = greatest(coalesce(attendance_close_at, exp), exp)
  where id=p_session;
  perform fn_audit('open_attendance','course_sessions',p_session,null,jsonb_build_object('ttl_min',ttl));
  return query select tok, exp;
end $$;

create or replace function close_attendance(p_session uuid)
returns void language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  select cycle_id into cid from course_sessions where id=p_session;
  if cid is null then raise exception 'sesión no encontrada'; end if;
  if not (fn_is_coordinator_of(cid) or fn_servant_runs_session(p_session, 'can_show_qr')) then
    raise exception 'No estás autorizado para cerrar la asistencia de esta clase.';
  end if;
  update attendance_tokens set revoked=true where session_id=p_session and revoked=false;
  update course_sessions set qr_active=false, status='closed', attendance_close_at=now() where id=p_session;
  perform fn_audit('close_attendance','course_sessions',p_session);
end $$;

create or replace function approve_attendance_request(p_id uuid, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record; s record;
begin
  select * into r from attendance_records where id = p_id;
  if r is null then raise exception 'solicitud no encontrada'; end if;
  select * into s from course_sessions where id = r.session_id;
  if not (fn_is_coordinator_of(s.cycle_id) or fn_is_speaker_of(s.step_number)
          or fn_servant_runs_step(r.session_id, 'can_approve_attendance')) then
    raise exception 'No estás autorizado para resolver esta solicitud.';
  end if;
  if r.result <> 'pending_approval' then raise exception 'Esta solicitud ya fue resuelta.'; end if;
  -- Nadie se confirma su propia asistencia. El coordinador del ciclo sí puede,
  -- porque es quien responde por la clase y su nombramiento viene del admin.
  if r.user_id = auth.uid() and not fn_is_coordinator_of(s.cycle_id) then
    raise exception 'No puedes confirmar tu propia asistencia. Pídeselo al coordinador o al orador del paso.';
  end if;
  update attendance_records set result='valid', recorded_by=auth.uid(),
    manual_reason=coalesce(nullif(trim(p_note),''), manual_reason)
    where id=p_id;
  perform fn_audit('approve_attendance_request','attendance_records', p_id, p_note,
    jsonb_build_object('user_id', r.user_id, 'session_id', r.session_id));
  perform fn_refresh_enrollment(r.enrollment_id);
  return jsonb_build_object('ok',true);
end $$;

create or replace function reject_attendance_request(p_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record; s record;
begin
  if char_length(btrim(coalesce(p_reason,''))) < 5 then
    raise exception 'Escribe el motivo (mínimo 5 caracteres). La persona lo va a leer.';
  end if;
  select * into r from attendance_records where id = p_id;
  if r is null then raise exception 'solicitud no encontrada'; end if;
  select * into s from course_sessions where id = r.session_id;
  if not (fn_is_coordinator_of(s.cycle_id) or fn_is_speaker_of(s.step_number)
          or fn_servant_runs_step(r.session_id, 'can_approve_attendance')) then
    raise exception 'No estás autorizado para resolver esta solicitud.';
  end if;
  if r.result <> 'pending_approval' then raise exception 'Esta solicitud ya fue resuelta.'; end if;
  if r.user_id = auth.uid() and not fn_is_coordinator_of(s.cycle_id) then
    raise exception 'No puedes resolver tu propia solicitud.';
  end if;
  perform fn_audit('reject_attendance_request','attendance_records', p_id, p_reason,
    jsonb_build_object('user_id', r.user_id, 'session_id', r.session_id));
  delete from attendance_records where id = p_id;
  return jsonb_build_object('ok',true);
end $$;

-- Quien muestra el QR necesita ver quién va marcando: si no, está de pie frente
-- a una pantalla sin saber si el sistema está recibiendo algo.
drop policy if exists p_att_sel_servant on attendance_records;
create policy p_att_sel_servant on attendance_records for select using (
  fn_servant_runs_session(session_id, 'can_show_qr')
  -- Para resolver solicitudes solo hacen falta las PENDIENTES: abrir todo el
  -- historial del paso (distancias, notas, quién registró) es de más.
  or (result = 'pending_approval'
      and fn_servant_runs_step(session_id, 'can_approve_attendance'))
);

-- Y necesita ver el NOMBRE de quien va marcando: si no, la pantalla del QR le
-- muestra una lista de horas sin personas y no sirve de nada.
create or replace function fn_servant_can_see_profile(p_profile uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from attendance_records ar
     where ar.user_id = p_profile
       and (fn_servant_runs_session(ar.session_id, 'can_show_qr')
            or (ar.result = 'pending_approval'
                and fn_servant_runs_step(ar.session_id, 'can_approve_attendance'))));
$$;
drop policy if exists p_prof_sel_servant on profiles;
create policy p_prof_sel_servant on profiles for select using (fn_servant_can_see_profile(id));

-- Y necesita poder leer la sesión y su token para pintarlo.
drop policy if exists p_sess_sel_servant on course_sessions;
create policy p_sess_sel_servant on course_sessions for select using (
  fn_servant_runs_session(id, 'can_show_qr')
);
drop policy if exists p_tok_sel_servant on attendance_tokens;
create policy p_tok_sel_servant on attendance_tokens for select using (
  fn_servant_runs_session(session_id, 'can_show_qr')
);

-- El muro del ministerio también se le puede confiar a un servidor.
-- OJO: copia EXACTA de la versión de la 012 más una sola línea. El nombre del
-- parámetro tiene que seguir siendo p_wall (Postgres no deja cambiarlo con
-- `create or replace`) y ninguna de las ramas anteriores puede desaparecer.
create or replace function fn_can_post_wall(p_wall wall_kind, p_ministry uuid, p_step int)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when auth.uid() is null then false
    when fn_role() in ('pastor','superadmin') then true
    when p_wall = 'general' then
      exists (select 1 from wall_publishers where user_id = auth.uid())
      or exists (select 1 from ministry_leaders where user_id = auth.uid())
      or exists (select 1 from step_speakers where user_id = auth.uid())
    when p_wall = 'ministry' then
      exists (select 1 from ministry_leaders where user_id = auth.uid() and ministry_id = p_ministry)
      or fn_servant_has(p_ministry, 'can_post_wall')   -- NUEVO (019)
    when p_wall = 'step' then
      exists (select 1 from step_speakers where user_id = auth.uid() and step_number = p_step)
    else false
  end;
$$;

-- Las clases que me toca atender como servidor: solo las de MIS pasos, y solo
-- de ciclos vivos. Sin esto el permiso del QR sería inservible, porque la
-- pantalla del código vive dentro del panel de administración.
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
         and cs.step_number in (
              select st.step_number from ministry_servants sv
                join ministry_servant_steps st on st.servant_id = sv.id
               where sv.ministry_id = v_min and sv.user_id = auth.uid())
         and (cs.session_date is null or cs.session_date >= current_date - 7)
    ) t
  ), '[]'::jsonb);
end $$;

-- Lo que yo mismo puedo hacer como servidor, para que la app sepa qué mostrar.
create or replace function fn_my_servant_roles()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(t) order by t.ministerio) from (
      select mi.name as ministerio, mi.id as ministry_id, mi.is_course_ministry,
             s.title, s.can_show_qr, s.can_approve_attendance, s.can_post_wall,
             s.can_give_info, s.can_add_members, s.show_in_profile,
             coalesce((select array_agg(st.step_number order by st.step_number)
                         from ministry_servant_steps st where st.servant_id = s.id), '{}') as pasos
        from ministry_servants s
        join ministries mi on mi.id = s.ministry_id
        join profiles p on p.id = s.user_id
        join ministry_assignments ma on ma.user_id = s.user_id and ma.ministry_id = s.ministry_id
       where s.user_id = auth.uid()
         and p.active_member and p.account_status = 'active'
         and ma.status in ('assigned','active')
         and mi.status = 'active' and mi.deleted_at is null
    ) t
  ), '[]'::jsonb);
end $$;

-- Un permiso que el sistema no hace cumplir no es un permiso: `can_add_members`
-- se mostraba en la ficha del servidor y no lo leía nadie. Copia EXACTA de la
-- 016 con una sola disyunción añadida en el control de entrada.
create or replace function add_ministry_member(p_ministry uuid, p_email text, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_user uuid; v_name text; v_n int; v_prev text; v_assignment uuid;
begin
  if not (fn_is_admin() or fn_is_ministry_leader_of(p_ministry)
          or fn_servant_has(p_ministry, 'can_add_members')) then
    raise exception 'Solo el director de este ministerio, quien él autorice o el administrador pueden sumar personas.';
  end if;
  if not exists (select 1 from ministries where id = p_ministry and status = 'active' and deleted_at is null) then
    raise exception 'Ese ministerio no está activo.';
  end if;

  select count(*) into v_n from profiles where lower(email) = lower(btrim(coalesce(p_email,'')));
  if v_n > 1 then
    raise exception 'Hay más de una cuenta con ese correo. Avísale al administrador para que lo resuelva.';
  end if;

  select id, first_name || ' ' || last_name into v_user, v_name
    from profiles
    where lower(email) = lower(btrim(coalesce(p_email,'')))
      and active_member and account_status = 'active';

  if v_user is null then
    raise exception 'No podemos sumar a esa persona ahora. Revisa que el correo esté bien escrito y que ya sea miembro activo (si completó el curso pero no aparece, el administrador puede marcarla desde su ficha).';
  end if;

  if exists (
    select 1 from ministry_assignments ma join ministries mi on mi.id = ma.ministry_id
    where ma.user_id = v_user and ma.status in ('assigned','active')
      and ma.ministry_id <> p_ministry
      and mi.status = 'active' and mi.deleted_at is null
  ) then
    raise exception 'Esa persona ya sirve en otro ministerio. Si se quiere cambiar, tiene que pedirlo desde su pantalla de Ministerios.';
  end if;

  if exists (select 1 from ministry_assignments
             where user_id = v_user and ministry_id = p_ministry and status in ('assigned','active')) then
    raise exception '% ya está en tu equipo.', v_name;
  end if;

  select status::text into v_prev from ministry_assignments
   where user_id = v_user and ministry_id = p_ministry;

  insert into ministry_assignments (ministry_id, user_id, status, assigned_by, notes)
  values (p_ministry, v_user, 'assigned', auth.uid(), nullif(btrim(coalesce(p_note,'')),''))
  on conflict (ministry_id, user_id)
    do update set status = 'assigned', assigned_by = auth.uid(),
                  notes = excluded.notes, updated_at = now()
  returning id into v_assignment;

  update member_requests
     set status = 'cancelled', resolved_at = now(), resolved_by = auth.uid(),
         resolution_note = 'El director te sumó directamente a un equipo.'
   where user_id = v_user and status = 'pending' and kind in ('join','leave','switch');

  perform fn_audit('add_ministry_member','ministry_assignments',v_assignment,p_note,
    jsonb_build_object('user', v_user, 'ministry', p_ministry, 'estado_previo', v_prev));
  return jsonb_build_object('name', v_name);
end $$;

-- El permiso de publicar en el muro del ministerio no servía de nada: la
-- pantalla decide si pinta el editor mirando `led_ministries`, que solo mira
-- ministry_leaders. Copia EXACTA de la 013 más `servant_ministries`.
create or replace function get_my_walls()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_admin boolean := fn_role() in ('pastor','superadmin');
  v_ministries jsonb;
  v_steps jsonb;
  v_led jsonb;
  v_speaker jsonb;
  v_servant jsonb;
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
  select coalesce(jsonb_agg(sv.ministry_id), '[]'::jsonb) into v_servant
    from ministry_servants sv
   where sv.user_id = v_uid and sv.can_post_wall
     and fn_servant_has(sv.ministry_id, 'can_post_wall');

  return jsonb_build_object(
    'general', fn_can_view_wall('general', null, null),
    'can_post_general', fn_can_post_wall('general', null, null),
    'is_admin', v_admin,
    'ministries', v_ministries,
    'steps', v_steps,
    'led_ministries', v_led,
    'speaker_steps', v_speaker,
    'servant_ministries', v_servant
  );
end;
$$;

-- ---------- 7. El administrador puede auto-proclamarse director ----------
create or replace function assign_ministry_leader(p_user uuid, p_ministry uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if fn_role() not in ('superadmin','pastor') then
    raise exception 'Solo el administrador o el pastor pueden asignar directores de ministerio.';
  end if;
  -- La regla de la 014 sigue en pie para todos los demás. La excepción es
  -- estrecha a propósito: el administrador y el pastor pueden ponerse a sí
  -- mismos al frente de un equipo sin tener que marcarse antes como miembros
  -- activos, porque su autoridad no viene del curso.
  if p_user <> auth.uid()
     and not exists (select 1 from profiles where id = p_user and active_member) then
    raise exception 'Para dirigir un ministerio hay que ser miembro activo. Marca primero a esta persona como miembro activo desde su ficha y vuelve a intentarlo.';
  end if;
  insert into ministry_leaders (user_id, ministry_id, assigned_by) values (p_user, p_ministry, auth.uid())
  on conflict (user_id, ministry_id) do nothing;
  perform fn_audit('assign_ministry_leader','ministry_leaders',p_ministry,null,
    jsonb_build_object('user_id',p_user,'auto', p_user = auth.uid()));
end $$;

-- ---------- 8. Solicitar ser director ----------
alter table member_requests drop constraint if exists chk_target;
alter table member_requests add constraint chk_target check (
  (kind in ('leave','switch','director') and target_ministry_id is not null)
  or (kind in ('join','role_change') and target_ministry_id is null)
);

create or replace function request_ministry_director(p_ministry uuid, p_details text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_id uuid;
begin
  if v_uid is null then raise exception 'Sesión no válida.'; end if;
  if char_length(btrim(coalesce(p_details,''))) < 10 then
    raise exception 'Cuéntanos en un par de líneas por qué quieres dirigir ese equipo (mínimo 10 caracteres).';
  end if;
  if char_length(p_details) > 1000 then raise exception 'El texto es demasiado largo.'; end if;
  if not exists (select 1 from profiles where id = v_uid and active_member and account_status = 'active') then
    raise exception 'Para dirigir un ministerio hay que ser miembro activo. Pídelo primero desde tu perfil.';
  end if;
  if not exists (select 1 from ministries where id = p_ministry and status = 'active' and deleted_at is null) then
    raise exception 'Ese ministerio no está activo.';
  end if;
  if exists (select 1 from ministry_leaders where user_id = v_uid and ministry_id = p_ministry) then
    raise exception 'Ya diriges ese ministerio.';
  end if;
  if exists (select 1 from member_requests
              where user_id = v_uid and kind = 'director' and status = 'pending') then
    raise exception 'Ya tienes una solicitud de dirección en revisión. Cancélala si quieres pedir otro equipo.';
  end if;

  insert into member_requests (user_id, kind, target_ministry_id, details)
  values (v_uid, 'director', p_ministry, btrim(p_details))
  returning id into v_id;
  perform fn_audit('request_ministry_director','member_requests',v_id,p_details,
    jsonb_build_object('ministerio', p_ministry));
  return v_id;
end $$;

create or replace function resolve_director_request(p_request uuid, p_accept boolean, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record; v_name text;
begin
  if not fn_is_admin() then
    raise exception 'Solo el administrador o el pastor resuelven las solicitudes de dirección.';
  end if;
  select * into r from member_requests where id = p_request and kind = 'director' for update;
  if r is null then raise exception 'Esa solicitud no existe.'; end if;
  if r.status <> 'pending' then raise exception 'Esa solicitud ya fue resuelta. Actualiza la página.'; end if;
  if not p_accept and char_length(btrim(coalesce(p_note,''))) < 5 then
    raise exception 'Escribe el motivo (mínimo 5 caracteres). La persona lo va a leer.';
  end if;
  select first_name || ' ' || last_name into v_name from profiles where id = r.user_id;

  if p_accept then
    if not exists (select 1 from profiles where id = r.user_id and active_member and account_status = 'active') then
      raise exception 'Esa persona ya no es miembro activo con la cuenta al día. Revisa su ficha primero.';
    end if;
    insert into ministry_leaders (user_id, ministry_id, assigned_by)
    values (r.user_id, r.target_ministry_id, auth.uid())
    on conflict (user_id, ministry_id) do nothing;
  end if;

  update member_requests set status = case when p_accept then 'accepted' else 'rejected' end,
         resolved_at = now(), resolved_by = auth.uid(),
         resolved_ministry_id = case when p_accept then r.target_ministry_id end,
         resolution_note = nullif(btrim(coalesce(p_note,'')),'')
   where id = p_request;

  perform fn_audit('resolve_director_request','member_requests',p_request,p_note,
    jsonb_build_object('aceptada', p_accept, 'usuario', r.user_id, 'ministerio', r.target_ministry_id));
  return jsonb_build_object('name', v_name);
end $$;

-- Las solicitudes de dirección tienen su propia función. Sin este cerrojo, el
-- director actual de un ministerio podía rechazar a quien pidiera dirigirlo, y
-- peor: `accept_member_request` la marcaba como aceptada sin insertar nada en
-- `ministry_leaders`, así que la persona veía "Aprobada" y nunca era directora.
-- Es copia EXACTA de la 011 más las tres líneas nuevas.
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
  if r.kind = 'director' then
    raise exception 'Las solicitudes de dirección se resuelven con su propio botón, en Solicitudes.';
  end if;
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

-- ---------- 9. Solicitudes: mis cosas, mi buzón y el archivo ----------
-- Una sola forma para todo: {origen, id, tipo, titulo, detalle, persona, fecha,
-- estado, nota, ministerio_id}. La pantalla decide qué botones pintar según el
-- `tipo`, y llama a las RPC que ya existen para cada uno.
create or replace function get_my_requests()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(t) order by t.fecha desc) from (
      -- Ministerio (ingreso, baja, cambio, rol, dirección)
      select 'member_request' as origen, r.id::text as id, r.kind::text as tipo,
             r.details as detalle, mi.name as ministerio, r.created_at as fecha,
             r.status::text as estado, r.resolution_note as nota,
             coalesce(array_length(r.ministry_preferences,1),0) as opciones
        from member_requests r
        left join ministries mi on mi.id = r.target_ministry_id
       where r.user_id = v_uid and r.status = 'pending'
      union all
      -- Miembro activo
      select 'active_member', p.id::text, 'active_member',
             p.active_member_request_note, null, p.active_member_requested_at, 'pending', null, 0
        from profiles p
       where p.id = v_uid and p.active_member_requested_at is not null and not p.active_member
      union all
      -- Asistencia que pedí que me confirmaran
      select 'attendance', ar.id::text, 'attendance',
             ar.request_note, cs.name, ar.created_at, 'pending', null, cs.step_number
        from attendance_records ar join course_sessions cs on cs.id = ar.session_id
       where ar.user_id = v_uid and ar.result = 'pending_approval'
    ) t
  ), '[]'::jsonb);
end $$;

create or replace function get_my_inbox()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(t) order by t.fecha) from (
      -- Solicitudes de ministerio que me toca resolver a mí
      -- OJO con el ingreso: `target_ministry_id` es NULL por diseño (el
      -- ministerio va en ministry_preferences). Si se devolviera tal cual, el
      -- botón Aprobar llamaría a accept_ministry_join con NULL y nunca podría
      -- aceptarse a nadie desde aquí. Se resuelve el ministerio de quien mira.
      select 'member_request' as origen, r.id::text as id, r.kind::text as tipo,
             r.details as detalle,
             coalesce(mi.name, mp.nombre) as ministerio,
             coalesce(r.target_ministry_id::text, mp.id::text) as ministerio_id,
             p.first_name || ' ' || p.last_name as persona,
             r.created_at as fecha, null::text as extra
        from member_requests r
        join profiles p on p.id = r.user_id
        left join ministries mi on mi.id = r.target_ministry_id
        left join lateral (
          select m2.id, m2.name as nombre
            from unnest(coalesce(r.ministry_preferences,'{}')) with ordinality as u(mid, ord)
            join ministries m2 on m2.id = u.mid
           where r.kind = 'join'
             and (fn_is_ministry_leader_of(m2.id) or fn_is_admin())
           order by u.ord
           limit 1
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
      -- Miembro activo: director, pastor o administrador
      select 'active_member', p.id::text, 'active_member',
             p.active_member_request_note, null, null,
             p.first_name || ' ' || p.last_name, p.active_member_requested_at,
             case when exists (select 1 from certificates c where c.user_id = p.id
                                and c.status in ('issued','delivered','ready_for_pickup','physical_pending'))
                  then 'con_certificado' else null end
        from profiles p
       where fn_can_review_active_member()
         and p.active_member_requested_at is not null and not p.active_member
         and p.account_status = 'active'
         and p.id <> v_uid
         -- Misma condición que get_active_member_requests (017): sin esto,
         -- cualquiera llena el buzón de todos los directores con cuentas
         -- inventadas que nunca confirmaron su correo.
         and exists (select 1 from auth.users u
                      where u.id = p.id and u.email_confirmed_at is not null)
      union all
      -- Asistencia olvidada: coordinador, orador del paso o servidor del paso
      select 'attendance', ar.id::text, 'attendance',
             ar.request_note, cs.name, null,
             p.first_name || ' ' || p.last_name, ar.created_at, cs.step_number::text
        from attendance_records ar
        join course_sessions cs on cs.id = ar.session_id
        join profiles p on p.id = ar.user_id
       where ar.result = 'pending_approval'
         and ar.user_id <> v_uid   -- la propia va en "Mis solicitudes", no aquí
         and (fn_is_coordinator_of(cs.cycle_id) or fn_is_speaker_of(cs.step_number)
              or fn_servant_runs_step(ar.session_id, 'can_approve_attendance'))
    ) t
  ), '[]'::jsonb);
end $$;

create or replace function get_my_requests_archive(p_limit int default 30)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(t) order by t.fecha desc) from (
      select 'member_request' as origen, r.id::text as id, r.kind::text as tipo,
             r.details as detalle, mi.name as ministerio,
             p.first_name || ' ' || p.last_name as persona,
             coalesce(r.resolved_at, r.created_at) as fecha,
             r.status::text as estado, r.resolution_note as nota,
             (r.user_id = v_uid) as mia
        from member_requests r
        join profiles p on p.id = r.user_id
        left join ministries mi on mi.id = r.target_ministry_id
       where r.status <> 'pending'
         and (r.user_id = v_uid or r.resolved_by = v_uid)
      union all
      select 'active_member', p.id::text, 'active_member',
             p.active_member_review_note, null,
             p.first_name || ' ' || p.last_name, p.active_member_reviewed_at,
             p.active_member_review_status, p.active_member_review_note,
             (p.id = v_uid)
        from profiles p
       where p.active_member_reviewed_at is not null
         and (p.id = v_uid or p.active_member_reviewed_by = v_uid)
      order by 7 desc
      limit greatest(1, least(coalesce(p_limit,30), 100))
    ) t
  ), '[]'::jsonb);
end $$;

-- ---------- 10. El QR pasa a 30 minutos ----------
update app_settings set value = to_jsonb('30'::text), updated_at = now()
 where key = 'default_token_ttl_min';
insert into app_settings (key, value, description)
select 'default_token_ttl_min', to_jsonb('30'::text), 'Minutos de vida por defecto del QR'
where not exists (select 1 from app_settings where key = 'default_token_ttl_min');

-- ---------- 11. Permisos ----------
revoke execute on function fn_servant_has(uuid,text) from public, anon;
revoke execute on function fn_servant_runs_session(uuid,text) from public, anon;
revoke execute on function fn_servant_runs_step(uuid,text) from public, anon;
revoke execute on function set_ministry_servant(uuid,uuid,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean,int[]) from public, anon;
revoke execute on function remove_ministry_servant(uuid,uuid) from public, anon;
revoke execute on function get_ministry_servants(uuid) from public, anon;
revoke execute on function get_ministry_candidates(uuid) from public, anon;
revoke execute on function request_ministry_director(uuid,text) from public, anon;
revoke execute on function resolve_director_request(uuid,boolean,text) from public, anon;
revoke execute on function get_my_requests() from public, anon;
revoke execute on function get_my_inbox() from public, anon;
revoke execute on function get_my_requests_archive(int) from public, anon;
revoke execute on function reject_attendance_request(uuid,text) from public, anon;
revoke execute on function get_servant_sessions() from public, anon;
revoke execute on function fn_servant_can_see_profile(uuid) from public, anon;
revoke execute on function fn_my_servant_roles() from public, anon;

grant execute on function fn_servant_has(uuid,text) to authenticated;
grant execute on function fn_servant_runs_session(uuid,text) to authenticated;
grant execute on function fn_servant_runs_step(uuid,text) to authenticated;
grant execute on function set_ministry_servant(uuid,uuid,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean,int[]) to authenticated;
grant execute on function remove_ministry_servant(uuid,uuid) to authenticated;
grant execute on function get_ministry_servants(uuid) to authenticated;
grant execute on function get_ministry_candidates(uuid) to authenticated;
grant execute on function request_ministry_director(uuid,text) to authenticated;
grant execute on function resolve_director_request(uuid,boolean,text) to authenticated;
grant execute on function get_my_requests() to authenticated;
grant execute on function get_my_inbox() to authenticated;
grant execute on function get_my_requests_archive(int) to authenticated;
grant execute on function reject_attendance_request(uuid,text) to authenticated;
grant execute on function get_servant_sessions() to authenticated;
grant execute on function fn_servant_can_see_profile(uuid) to authenticated;
grant execute on function fn_my_servant_roles() to authenticated;
