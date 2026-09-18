-- ============================================================
-- 029 — Notificaciones dentro de la app y mensajes con la iglesia
-- ============================================================
-- Hasta hoy la app no avisaba nada: la persona tenía que entrar a cada pantalla
-- a ver si algo había cambiado. Esto añade:
--   · `notifications`: una campana por persona, que se llena sola con
--     disparadores sobre eventos que YA ocurren (inscripción, asistencia,
--     solicitud resuelta, ministerio asignado, certificado, anuncio dirigido,
--     permiso del representante, comentario en tu publicación, rol nuevo).
--   · `conversations` + `messages`: hilos de ida y vuelta entre una persona y
--     la iglesia (o el director de su ministerio, o el orador de su paso).
--     NO es chat entre miembros: hay menores en la plataforma y eso exige
--     moderación, bloqueo y reporte que aquí no existen. Queda como decisión
--     pendiente, no como regla escondida en el código.
--   · `fn_my_counters()`: los tres contadores de la barra superior en una sola
--     llamada (solicitudes por resolver, notificaciones sin leer, mensajes sin
--     leer).
-- Todo lo que escribe pasa por funciones; las tablas solo se leen (RLS) y
-- por eso también sirven para Realtime.

-- ---------- 1. Notificaciones ----------
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists ix_notifications_user on notifications (user_id, created_at desc);
create index if not exists ix_notifications_unread on notifications (user_id) where read_at is null;

alter table notifications enable row level security;
revoke all on notifications from public, anon, authenticated;
grant select on notifications to authenticated;
drop policy if exists p_notif_sel on notifications;
create policy p_notif_sel on notifications for select to authenticated using (user_id = auth.uid());

-- Escribir un aviso NUNCA debe tumbar la acción que lo originó: si esto falla,
-- se traga el error a propósito (la inscripción vale más que su aviso).
create or replace function fn_notify_user(p_user uuid, p_kind text, p_title text, p_body text default null, p_link text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user is null then return; end if;
  begin
    insert into notifications (user_id, kind, title, body, link)
    values (p_user, p_kind, left(p_title, 140), left(p_body, 600), p_link);
  exception when others then
    null;
  end;
end $$;
revoke execute on function fn_notify_user(uuid, text, text, text, text) from public, anon, authenticated;

create or replace function get_my_notifications(p_limit int default 50)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(n) order by n.created_at desc), '[]'::jsonb)
    from (select id, kind, title, body, link, read_at, created_at
            from notifications where user_id = auth.uid()
           order by created_at desc limit greatest(1, least(p_limit, 200))) n;
$$;
revoke execute on function get_my_notifications(int) from public, anon;
grant execute on function get_my_notifications(int) to authenticated;

-- Sin ids = todas.
create or replace function mark_notifications_read(p_ids uuid[] default null)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if auth.uid() is null then return 0; end if;
  update notifications set read_at = now()
   where user_id = auth.uid() and read_at is null
     and (p_ids is null or id = any(p_ids));
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function mark_notifications_read(uuid[]) from public, anon;
grant execute on function mark_notifications_read(uuid[]) to authenticated;

-- ---------- 2. Mensajes (persona ↔ iglesia) ----------
create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references profiles(id) on delete cascade,
  scope text not null default 'church' check (scope in ('church','ministry','step')),
  ministry_id uuid references ministries(id) on delete cascade,
  step_number int check (step_number between 1 and 4),
  subject text not null check (char_length(btrim(subject)) between 1 and 140),
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  closed_at timestamptz,
  constraint chk_conv_scope check (
    (scope = 'church'   and ministry_id is null     and step_number is null) or
    (scope = 'ministry' and ministry_id is not null and step_number is null) or
    (scope = 'step'     and ministry_id is null     and step_number is not null)
  )
);
create index if not exists ix_conversations_member on conversations (member_id, last_message_at desc);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_id uuid not null references profiles(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists ix_messages_conv on messages (conversation_id, created_at);

alter table conversations enable row level security;
alter table messages enable row level security;
revoke all on conversations, messages from public, anon, authenticated;
grant select on conversations, messages to authenticated;

-- Quién ve un hilo: la persona, la administración, el director del ministerio
-- del hilo o el orador del paso del hilo. Nadie más.
create or replace function fn_can_see_conversation(p_conv uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from conversations c
     where c.id = p_conv
       and (c.member_id = auth.uid()
            or fn_is_admin()
            or (c.scope = 'ministry' and fn_is_ministry_leader_of(c.ministry_id))
            or (c.scope = 'step' and fn_is_speaker_of(c.step_number))));
$$;
revoke execute on function fn_can_see_conversation(uuid) from public, anon;
grant execute on function fn_can_see_conversation(uuid) to authenticated;

drop policy if exists p_conv_sel on conversations;
create policy p_conv_sel on conversations for select to authenticated using (fn_can_see_conversation(id));
drop policy if exists p_msg_sel on messages;
create policy p_msg_sel on messages for select to authenticated using (fn_can_see_conversation(conversation_id));

-- Abrir un hilo. Sin p_member, lo abre la propia persona hacia la iglesia (o
-- hacia su ministerio / su paso). Con p_member, lo abre alguien del equipo
-- hacia esa persona, y solo dentro de lo que ese alguien puede ver.
create or replace function start_conversation(
  p_subject text, p_body text,
  p_scope text default 'church', p_ministry uuid default null, p_step int default null,
  p_member uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_member uuid := coalesce(p_member, auth.uid());
  v_id uuid;
  v_other uuid;
  v_nombre text;
begin
  if v_me is null then raise exception 'inicia sesión'; end if;
  if not fn_guardian_ok() then
    raise exception 'Tu cuenta está esperando la autorización de tu representante.' using errcode = 'P0001';
  end if;
  if p_scope not in ('church','ministry','step') then raise exception 'Tipo de hilo desconocido.' using errcode = 'P0001'; end if;
  if coalesce(btrim(p_subject), '') = '' then raise exception 'Escribe un asunto.' using errcode = 'P0001'; end if;
  if coalesce(btrim(p_body), '') = '' then raise exception 'Escribe el mensaje.' using errcode = 'P0001'; end if;

  if v_member <> v_me then
    -- Lo abre el equipo: tiene que poder ver ese ámbito.
    if not (fn_is_admin()
            or (p_scope = 'ministry' and fn_is_ministry_leader_of(p_ministry))
            or (p_scope = 'step' and fn_is_speaker_of(p_step))) then
      raise exception 'No autorizado' using errcode = 'P0001';
    end if;
  else
    -- Lo abre la persona: a su ministerio solo si está en él; a un paso solo si
    -- está inscrita en un ciclo (el orador es el mismo para todos).
    if p_scope = 'ministry' and not exists (
         select 1 from ministry_assignments where user_id = v_me and ministry_id = p_ministry
            and status in ('assigned','active')) then
      raise exception 'Solo puedes escribirle al ministerio del que formas parte.' using errcode = 'P0001';
    end if;
    if p_scope = 'step' and not exists (
         select 1 from enrollments where user_id = v_me and status not in ('withdrawn','cancelled')) then
      raise exception 'Para escribirle al orador de un paso hay que estar inscrito en el curso.' using errcode = 'P0001';
    end if;
  end if;

  insert into conversations (member_id, scope, ministry_id, step_number, subject, created_by)
  values (v_member, p_scope,
          case when p_scope = 'ministry' then p_ministry end,
          case when p_scope = 'step' then p_step end,
          btrim(p_subject), v_me)
  returning id into v_id;
  insert into messages (conversation_id, sender_id, body) values (v_id, v_me, btrim(p_body));

  -- Aviso en la campana: a la persona si le escribe el equipo; al equipo si
  -- escribe la persona (administración, o el director / orador del ámbito).
  if v_member <> v_me then
    perform fn_notify_user(v_member, 'message',
      'Tienes un mensaje nuevo', btrim(p_subject), '/mensajes/' || v_id);
  else
    select first_name || ' ' || last_name into v_nombre from profiles where id = v_me;
    if p_scope = 'church' then
      for v_other in select user_id from user_roles where role in ('superadmin','pastor') loop
        perform fn_notify_user(v_other, 'message', v_nombre || ' te escribió', btrim(p_subject), '/mensajes/' || v_id);
      end loop;
    elsif p_scope = 'ministry' then
      for v_other in select user_id from ministry_leaders where ministry_id = p_ministry loop
        perform fn_notify_user(v_other, 'message', v_nombre || ' escribió al ministerio', btrim(p_subject), '/mensajes/' || v_id);
      end loop;
    else
      for v_other in select user_id from step_speakers where step_number = p_step loop
        perform fn_notify_user(v_other, 'message', v_nombre || ' escribió sobre tu paso', btrim(p_subject), '/mensajes/' || v_id);
      end loop;
    end if;
  end if;
  return v_id;
end $$;
revoke execute on function start_conversation(text, text, text, uuid, int, uuid) from public, anon;
grant execute on function start_conversation(text, text, text, uuid, int, uuid) to authenticated;

create or replace function send_message(p_conversation uuid, p_body text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_c conversations;
begin
  if auth.uid() is null then raise exception 'inicia sesión'; end if;
  if not fn_guardian_ok() then
    raise exception 'Tu cuenta está esperando la autorización de tu representante.' using errcode = 'P0001';
  end if;
  select * into v_c from conversations where id = p_conversation;
  if v_c is null or not fn_can_see_conversation(p_conversation) then
    raise exception 'No encontramos esa conversación.' using errcode = 'P0001';
  end if;
  if v_c.closed_at is not null then raise exception 'Esta conversación está cerrada.' using errcode = 'P0001'; end if;
  if coalesce(btrim(p_body), '') = '' then raise exception 'Escribe el mensaje.' using errcode = 'P0001'; end if;
  insert into messages (conversation_id, sender_id, body) values (p_conversation, auth.uid(), btrim(p_body))
  returning id into v_id;
  update conversations set last_message_at = now() where id = p_conversation;
  return v_id;
end $$;
revoke execute on function send_message(uuid, text) from public, anon;
grant execute on function send_message(uuid, text) to authenticated;

-- "Mi lado" de un hilo: soy la persona, o soy el equipo. Un mensaje está sin
-- leer PARA MÍ si lo mandó el otro lado y nadie de mi lado lo abrió.
create or replace function fn_msg_unread_for_me(p_conv uuid)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int
    from messages m join conversations c on c.id = m.conversation_id
   where m.conversation_id = p_conv and m.read_at is null
     and case when c.member_id = auth.uid() then m.sender_id <> c.member_id
              else m.sender_id = c.member_id end;
$$;
revoke execute on function fn_msg_unread_for_me(uuid) from public, anon;
grant execute on function fn_msg_unread_for_me(uuid) to authenticated;

-- Con quién es el hilo, visto desde quien mira.
create or replace function fn_conversation_title(p_conv uuid)
returns text language sql stable security definer set search_path = public as $$
  select case
           when c.member_id <> auth.uid() then p.first_name || ' ' || p.last_name
           when c.scope = 'ministry' then coalesce(m.name, 'Mi ministerio')
           when c.scope = 'step' then 'Orador del Paso ' || c.step_number
           else coalesce((select value #>> '{}' from app_settings where key = 'church_name'), 'La iglesia')
         end
    from conversations c
    join profiles p on p.id = c.member_id
    left join ministries m on m.id = c.ministry_id
   where c.id = p_conv;
$$;
revoke execute on function fn_conversation_title(uuid) from public, anon;
grant execute on function fn_conversation_title(uuid) to authenticated;

create or replace function get_my_conversations()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(t) order by t.last_message_at desc), '[]'::jsonb)
    from (
      select c.id, c.scope, c.subject, c.last_message_at, c.closed_at,
             (c.member_id = auth.uid()) as soy_la_persona,
             fn_conversation_title(c.id) as con_quien,
             fn_msg_unread_for_me(c.id) as sin_leer,
             (select left(m.body, 120) from messages m where m.conversation_id = c.id order by m.created_at desc limit 1) as ultimo
        from conversations c
       where fn_can_see_conversation(c.id)
       order by c.last_message_at desc
       limit 200
    ) t;
$$;
revoke execute on function get_my_conversations() from public, anon;
grant execute on function get_my_conversations() to authenticated;

-- Abre un hilo y, de paso, marca como leído lo que el otro lado me mandó.
create or replace function get_conversation(p_conv uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_c conversations; v_out jsonb;
begin
  if auth.uid() is null or not fn_can_see_conversation(p_conv) then return null; end if;
  select * into v_c from conversations where id = p_conv;
  update messages m set read_at = now()
   where m.conversation_id = p_conv and m.read_at is null
     and case when v_c.member_id = auth.uid() then m.sender_id <> v_c.member_id
              else m.sender_id = v_c.member_id end;
  select jsonb_build_object(
    'id', v_c.id, 'scope', v_c.scope, 'subject', v_c.subject, 'closed_at', v_c.closed_at,
    'soy_la_persona', v_c.member_id = auth.uid(),
    'con_quien', fn_conversation_title(v_c.id),
    'mensajes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', m.id, 'body', m.body, 'created_at', m.created_at,
               'mio', m.sender_id = auth.uid(),
               'de', p.first_name || ' ' || p.last_name,
               'lado_persona', m.sender_id = v_c.member_id)
             order by m.created_at)
        from messages m join profiles p on p.id = m.sender_id
       where m.conversation_id = p_conv), '[]'::jsonb))
  into v_out;
  return v_out;
end $$;
revoke execute on function get_conversation(uuid) from public, anon;
grant execute on function get_conversation(uuid) to authenticated;

-- ---------- 3. Los tres contadores de la barra superior ----------
create or replace function fn_my_counters()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_sol int := 0; v_not int := 0; v_msg int := 0;
begin
  if auth.uid() is null then return jsonb_build_object('solicitudes', 0, 'notificaciones', 0, 'mensajes', 0); end if;
  begin
    v_sol := coalesce(jsonb_array_length(get_my_inbox()), 0);
  exception when others then v_sol := 0; end;
  select count(*) into v_not from notifications where user_id = auth.uid() and read_at is null;
  select coalesce(sum(fn_msg_unread_for_me(c.id)), 0) into v_msg
    from conversations c where fn_can_see_conversation(c.id);
  return jsonb_build_object('solicitudes', v_sol, 'notificaciones', v_not, 'mensajes', v_msg);
end $$;
revoke execute on function fn_my_counters() from public, anon;
grant execute on function fn_my_counters() to authenticated;

-- ---------- 4. Disparadores: lo que ya pasa, ahora avisa ----------
create or replace function fn_trg_notify_enrollment() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  select name into v_name from course_cycles where id = new.cycle_id;
  perform fn_notify_user(new.user_id, 'enrollment', 'Quedaste inscrito',
    'Tu lugar en ' || coalesce(v_name, 'el ciclo') || ' está confirmado. Mira las fechas de tus clases.', '/curso');
  return new;
end $$;
drop trigger if exists t_notify_enrollment on enrollments;
create trigger t_notify_enrollment after insert on enrollments for each row execute function fn_trg_notify_enrollment();

create or replace function fn_trg_notify_attendance() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  if new.result <> 'valid' then return new; end if;
  select name into v_name from course_sessions where id = new.session_id;
  perform fn_notify_user(new.user_id, 'attendance', 'Asistencia registrada',
    coalesce(v_name, 'Tu clase') || ' quedó marcada como asistida.', '/progreso');
  return new;
end $$;
drop trigger if exists t_notify_attendance on attendance_records;
create trigger t_notify_attendance after insert on attendance_records for each row execute function fn_trg_notify_attendance();

create or replace function fn_trg_notify_member_request() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_nombre text; v_min text; v_other uuid;
begin
  if tg_op = 'INSERT' then
    -- A quien le toca resolverla: administración, y el director del ministerio.
    select first_name || ' ' || last_name into v_nombre from profiles where id = new.user_id;
    for v_other in
      select user_id from user_roles where role in ('superadmin','pastor')
      union
      select ml.user_id from ministry_leaders ml
       where ml.ministry_id = new.target_ministry_id
          or ml.ministry_id = any(coalesce(new.ministry_preferences, '{}'))
    loop
      if v_other <> new.user_id then
        perform fn_notify_user(v_other, 'request_new', 'Solicitud nueva por resolver',
          coalesce(v_nombre, 'Alguien') || ' envió una solicitud (' ||
          case new.kind::text when 'join' then 'unirse a un ministerio' when 'leave' then 'salir de un ministerio'
                              when 'switch' then 'cambiar de ministerio' else 'cambio de rol' end || ').',
          '/solicitudes');
      end if;
    end loop;
    return new;
  end if;
  if old.status = 'pending' and new.status in ('accepted','rejected') then
    select name into v_min from ministries where id = coalesce(new.resolved_ministry_id, new.target_ministry_id);
    perform fn_notify_user(new.user_id, 'request_' || new.status::text,
      case when new.status = 'accepted' then 'Tu solicitud fue aceptada' else 'Tu solicitud no fue aceptada' end,
      coalesce(nullif(new.resolution_note, ''),
               case when new.status = 'accepted' and v_min is not null then 'Bienvenido a ' || v_min || '.' else null end),
      '/solicitudes');
  end if;
  return new;
end $$;
drop trigger if exists t_notify_member_request on member_requests;
create trigger t_notify_member_request after insert or update of status on member_requests
  for each row execute function fn_trg_notify_member_request();

create or replace function fn_trg_notify_ministry_assignment() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_min text;
begin
  if new.status in ('assigned','active') and (tg_op = 'INSERT' or old.status not in ('assigned','active')) then
    select name into v_min from ministries where id = new.ministry_id;
    perform fn_notify_user(new.user_id, 'ministry', 'Ya eres parte de ' || coalesce(v_min, 'un ministerio'),
      'Tu director te espera. Aquí verás el muro y los avisos de tu equipo.', '/servicio');
  end if;
  return new;
end $$;
drop trigger if exists t_notify_ministry_assignment on ministry_assignments;
create trigger t_notify_ministry_assignment after insert or update of status on ministry_assignments
  for each row execute function fn_trg_notify_ministry_assignment();

create or replace function fn_trg_notify_certificate() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'issued' and (tg_op = 'INSERT' or old.status <> 'issued') then
    perform fn_notify_user(new.user_id, 'certificate', 'Tu certificado está listo',
      'Completaste Próximo Paso. Puedes verlo, descargarlo y compartir el enlace de verificación.', '/certificado');
  end if;
  return new;
end $$;
drop trigger if exists t_notify_certificate on certificates;
create trigger t_notify_certificate after insert or update of status on certificates
  for each row execute function fn_trg_notify_certificate();

-- Anuncio dirigido: se resuelve el público y se avisa a cada persona.
create or replace function fn_trg_notify_announcement() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_user uuid;
begin
  if new.deleted_at is not null then return new; end if;
  for v_user in
    select p.id from profiles p
     where p.account_status = 'active'
       and case new.audience
             when 'all' then true
             when 'cycle' then exists (select 1 from enrollments e where e.user_id = p.id and e.cycle_id = new.cycle_id
                                          and e.status not in ('withdrawn','cancelled'))
             when 'ministry' then exists (select 1 from ministry_assignments a where a.user_id = p.id
                                             and a.ministry_id = new.ministry_id and a.status in ('assigned','active'))
             when 'role' then exists (select 1 from user_roles r where r.user_id = p.id and r.role = new.role)
             when 'certified' then exists (select 1 from certificates c where c.user_id = p.id and c.status <> 'revoked'
                                              and c.issued_at is not null)
             else false
           end
  loop
    if v_user is distinct from new.author_id then
      perform fn_notify_user(v_user, 'announcement', new.title, left(new.content, 200), '/anuncios');
    end if;
  end loop;
  return new;
end $$;
drop trigger if exists t_notify_announcement on announcements;
create trigger t_notify_announcement after insert on announcements for each row execute function fn_trg_notify_announcement();

create or replace function fn_trg_notify_guardian_granted() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.guardian_authorization_status = 'granted' and old.guardian_authorization_status is distinct from 'granted' then
    perform fn_notify_user(new.id, 'guardian', 'Tu representante autorizó tu cuenta',
      'Ya puedes inscribirte al curso y participar con normalidad.', '/inicio');
  end if;
  return new;
end $$;
drop trigger if exists t_notify_guardian_granted on profiles;
create trigger t_notify_guardian_granted after update of guardian_authorization_status on profiles
  for each row execute function fn_trg_notify_guardian_granted();

create or replace function fn_trg_notify_comment() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_author uuid; v_nombre text;
begin
  select author_id into v_author from posts where id = new.post_id;
  if v_author is null or v_author = new.author_id then return new; end if;
  select first_name into v_nombre from profiles where id = new.author_id;
  perform fn_notify_user(v_author, 'comment', coalesce(v_nombre, 'Alguien') || ' comentó tu publicación',
    left(new.content, 160), '/muro');
  return new;
end $$;
drop trigger if exists t_notify_comment on post_comments;
create trigger t_notify_comment after insert on post_comments for each row execute function fn_trg_notify_comment();

create or replace function fn_trg_notify_role() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.role = 'participant' then return new; end if;
  perform fn_notify_user(new.user_id, 'role', 'Tienes un rol nuevo',
    'Ahora eres ' || case new.role::text when 'coordinator' then 'coordinador' when 'pastor' then 'pastor'
                                          when 'superadmin' then 'administrador' else new.role::text end ||
    '. Verás nuevas opciones en el menú.', '/inicio');
  return new;
end $$;
drop trigger if exists t_notify_role on user_roles;
create trigger t_notify_role after insert on user_roles for each row execute function fn_trg_notify_role();

create or replace function fn_trg_notify_speaker() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and old.user_id = new.user_id then return new; end if;
  perform fn_notify_user(new.user_id, 'speaker', 'Eres el orador del Paso ' || new.step_number,
    'Desde "Mi paso" ves a tus asistentes y publicas en el muro de tu clase.', '/orador');
  return new;
end $$;
drop trigger if exists t_notify_speaker on step_speakers;
create trigger t_notify_speaker after insert or update of user_id on step_speakers
  for each row execute function fn_trg_notify_speaker();

-- ---------- 5. Realtime para la barra (si la publicación existe) ----------
do $mig$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'notifications') then
      alter publication supabase_realtime add table notifications;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'messages') then
      alter publication supabase_realtime add table messages;
    end if;
  end if;
end $mig$;

-- ---------- 6. Comprobación ----------
do $mig$
begin
  if has_table_privilege('anon', 'public.notifications', 'select') then raise exception '029: anon lee notifications'; end if;
  if has_table_privilege('anon', 'public.messages', 'select') then raise exception '029: anon lee messages'; end if;
  if has_table_privilege('authenticated', 'public.notifications', 'insert') then raise exception '029: authenticated inserta notifications directo'; end if;
  if has_table_privilege('authenticated', 'public.messages', 'insert') then raise exception '029: authenticated inserta messages directo'; end if;
  if has_function_privilege('anon', 'fn_notify_user(uuid, text, text, text, text)', 'execute') then raise exception '029: anon ejecuta fn_notify_user'; end if;
  if has_function_privilege('authenticated', 'fn_notify_user(uuid, text, text, text, text)', 'execute') then raise exception '029: authenticated ejecuta fn_notify_user'; end if;
  if not has_function_privilege('authenticated', 'fn_my_counters()', 'execute') then raise exception '029: authenticated sin fn_my_counters'; end if;
  if has_function_privilege('anon', 'start_conversation(text, text, text, uuid, int, uuid)', 'execute') then raise exception '029: anon abre conversaciones'; end if;
end $mig$;
