-- ============================================================
-- 012 — Fase 3c: Muro tipo red social (versión completa)
-- ============================================================
-- 3 muros:
--   · general   → solo miembros activos (y pastor/superadmin)
--   · ministry  → miembros vigentes del ministerio + su director
--   · step      → el orador del paso con su grupo actual (inscritos en ciclo activo)
-- Publican contenido nuevo en el muro GENERAL: pastor/superadmin (siempre),
-- directores de ministerio, oradores, y personas puntuales autorizadas por el
-- administrador (tabla wall_publishers). El resto solo comenta/reacciona.
-- En el muro de un ministerio publica su director; en el de un paso, su orador.
--
-- Arquitectura: TODO el acceso (lectura y escritura) pasa por RPCs security
-- definer. Las tablas quedan con RLS activo y SIN políticas (deny-all), salvo
-- una de lectura para admins en wall_publishers. Así evitamos de raíz la
-- trampa "RLS-as-caller" (incidente migración 010) y resolvemos el hallazgo
-- diferido de Fase 3a: los participantes ven nombre y foto del autor (orador
-- incluido) SIN abrir la fila completa de profiles (teléfono/dirección/fecha
-- de nacimiento siguen privados).

-- ---------- enums ----------
create type wall_kind as enum ('general','ministry','step');
create type reaction_kind as enum ('like','love','pray','amen','celebrate');

-- ---------- tablas ----------
create table posts (
  id uuid primary key default gen_random_uuid(),
  wall wall_kind not null,
  ministry_id uuid references ministries(id) on delete cascade,
  step_number int check (step_number between 1 and 4),
  author_id uuid not null references profiles(id) on delete cascade,
  content text not null check (char_length(btrim(content)) between 1 and 5000),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references profiles(id),
  constraint chk_wall_target check (
    (wall = 'general'  and ministry_id is null     and step_number is null) or
    (wall = 'ministry' and ministry_id is not null and step_number is null) or
    (wall = 'step'     and ministry_id is null     and step_number is not null)
  )
);
create index idx_posts_wall on posts (wall, ministry_id, step_number, created_at desc) where deleted_at is null;

create table post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  author_id uuid not null references profiles(id) on delete cascade,
  content text not null check (char_length(btrim(content)) between 1 and 2000),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references profiles(id)
);
create index idx_pcomments_post on post_comments (post_id, created_at) where deleted_at is null;

create table post_reactions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  reaction reaction_kind not null,
  created_at timestamptz not null default now(),
  unique (post_id, user_id)
  -- el unique ya indexa por post_id (prefijo); no hace falta índice extra
);

-- personas puntuales autorizadas por el admin a publicar en el muro general
create table wall_publishers (
  user_id uuid primary key references profiles(id) on delete cascade,
  granted_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

-- ---------- helpers de permiso (security definer) ----------
create or replace function fn_can_view_wall(p_wall wall_kind, p_ministry uuid, p_step int)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when auth.uid() is null then false
    when fn_role() in ('pastor','superadmin') then true
    when p_wall = 'general' then
      -- miembros activos, y también quienes pueden publicar (directores, oradores,
      -- autorizados puntuales): quien publica debe poder ver lo que publica.
      -- (Inline y no via fn_can_post_wall: esa función se crea más abajo.)
      exists (select 1 from profiles where id = auth.uid() and active_member)
      or exists (select 1 from wall_publishers where user_id = auth.uid())
      or exists (select 1 from ministry_leaders where user_id = auth.uid())
      or exists (select 1 from step_speakers where user_id = auth.uid())
    when p_wall = 'ministry' then
      -- solo muros de ministerios activos (coherente con las pestañas de get_my_walls)
      exists (select 1 from ministries where id = p_ministry and status = 'active' and deleted_at is null)
      and (
        exists (select 1 from ministry_leaders where user_id = auth.uid() and ministry_id = p_ministry)
        or exists (select 1 from ministry_assignments
                   where user_id = auth.uid() and ministry_id = p_ministry and status in ('assigned','active'))
      )
    when p_wall = 'step' then
      exists (select 1 from step_speakers where user_id = auth.uid() and step_number = p_step)
      -- inscrito en un ciclo activo QUE tenga sesión de ese paso (igual que get_my_walls)
      or exists (select 1 from enrollments e
                 join course_cycles c on c.id = e.cycle_id
                 join course_sessions s on s.cycle_id = c.id and s.step_number = p_step
                 where e.user_id = auth.uid() and c.status = 'active' and c.deleted_at is null
                   and e.status in ('registered','enrolled','in_progress','requirements_pending'))
    else false
  end;
$$;

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
    when p_wall = 'step' then
      exists (select 1 from step_speakers where user_id = auth.uid() and step_number = p_step)
    else false
  end;
$$;

-- moderador del muro: puede borrar publicaciones/comentarios ajenos en su muro
create or replace function fn_is_wall_mod(p_wall wall_kind, p_ministry uuid, p_step int)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when auth.uid() is null then false
    when fn_role() in ('pastor','superadmin') then true
    when p_wall = 'ministry' then
      exists (select 1 from ministry_leaders where user_id = auth.uid() and ministry_id = p_ministry)
    when p_wall = 'step' then
      exists (select 1 from step_speakers where user_id = auth.uid() and step_number = p_step)
    else false
  end;
$$;

-- ---------- RPCs de lectura ----------
-- Qué muros puede ver/usar quien llama (para armar las pestañas de la UI).
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
      where c.status = 'active' and c.deleted_at is null and s.step_number is not null;
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
        where c.status = 'active' and c.deleted_at is null and s.step_number is not null
          and exists (select 1 from enrollments e
                      where e.cycle_id = c.id and e.user_id = v_uid
                        and e.status in ('registered','enrolled','in_progress','requirements_pending'))
    ) t where n is not null;
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

-- Publicaciones de un muro (paginado hacia atrás con cursor compuesto created_at+id,
-- para no saltar posts con el mismo timestamp).
create or replace function get_wall_posts(p_wall wall_kind, p_ministry uuid default null, p_step int default null,
                                          p_before timestamptz default null, p_before_id uuid default null,
                                          p_limit int default 20)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if not fn_can_view_wall(p_wall, p_ministry, p_step) then
    raise exception 'No tienes acceso a este muro.';
  end if;
  return coalesce((
    select jsonb_agg(to_jsonb(t) order by t.created_at desc, t.id desc) from (
      select p.id, p.content, p.created_at,
             pr.first_name || ' ' || pr.last_name as author_name,
             pr.photo_url as author_photo,
             (p.author_id = v_uid) as is_mine,
             (select coalesce(jsonb_object_agg(r.reaction, r.n), '{}'::jsonb)
                from (select reaction, count(*)::int as n from post_reactions where post_id = p.id group by reaction) r
             ) as reactions,
             (select reaction::text from post_reactions where post_id = p.id and user_id = v_uid) as my_reaction,
             (select count(*)::int from post_comments c where c.post_id = p.id and c.deleted_at is null) as comment_count,
             (p.author_id = v_uid or fn_is_wall_mod(p.wall, p.ministry_id, p.step_number)) as can_delete
      from posts p
      join profiles pr on pr.id = p.author_id
      where p.wall = p_wall
        and p.ministry_id is not distinct from p_ministry
        and p.step_number is not distinct from p_step
        and p.deleted_at is null
        and (p_before is null
             or (p.created_at, p.id) < (p_before, coalesce(p_before_id, '00000000-0000-0000-0000-000000000000'::uuid)))
      order by p.created_at desc, p.id desc
      limit greatest(1, least(coalesce(p_limit, 20), 50))
    ) t
  ), '[]'::jsonb);
end;
$$;

-- Comentarios de una publicación (ascendente).
create or replace function get_post_comments(p_post uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_post posts%rowtype;
begin
  select * into v_post from posts where id = p_post and deleted_at is null;
  if not found then raise exception 'La publicación no existe.'; end if;
  if not fn_can_view_wall(v_post.wall, v_post.ministry_id, v_post.step_number) then
    raise exception 'No tienes acceso a este muro.';
  end if;
  return coalesce((
    select jsonb_agg(to_jsonb(t) order by t.created_at asc) from (
      select c.id, c.content, c.created_at,
             pr.first_name || ' ' || pr.last_name as author_name,
             pr.photo_url as author_photo,
             (c.author_id = v_uid or fn_is_wall_mod(v_post.wall, v_post.ministry_id, v_post.step_number)) as can_delete
      from post_comments c
      join profiles pr on pr.id = c.author_id
      where c.post_id = p_post and c.deleted_at is null
      order by c.created_at asc
    ) t
  ), '[]'::jsonb);
end;
$$;

-- ---------- RPCs de escritura ----------
create or replace function create_post(p_wall wall_kind, p_ministry uuid, p_step int, p_content text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Sesión no válida.'; end if;
  if p_content is null or char_length(btrim(p_content)) < 1 then
    raise exception 'Escribe algo antes de publicar.';
  end if;
  if char_length(btrim(p_content)) > 5000 then
    raise exception 'La publicación es demasiado larga (máximo 5000 caracteres).';
  end if;
  if not fn_can_post_wall(p_wall, p_ministry, p_step) then
    raise exception 'No tienes permiso para publicar en este muro.';
  end if;
  if p_wall = 'ministry' and not exists (
    select 1 from ministries where id = p_ministry and status = 'active' and deleted_at is null
  ) then
    raise exception 'El ministerio no está activo.';
  end if;
  insert into posts (wall, ministry_id, step_number, author_id, content)
  values (p_wall,
          case when p_wall = 'ministry' then p_ministry else null end,
          case when p_wall = 'step' then p_step else null end,
          auth.uid(), btrim(p_content))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function add_post_comment(p_post uuid, p_content text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_post posts%rowtype;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Sesión no válida.'; end if;
  select * into v_post from posts where id = p_post and deleted_at is null;
  if not found then raise exception 'La publicación ya no existe.'; end if;
  if not fn_can_view_wall(v_post.wall, v_post.ministry_id, v_post.step_number) then
    raise exception 'No tienes acceso a este muro.';
  end if;
  if p_content is null or char_length(btrim(p_content)) < 1 then
    raise exception 'Escribe algo antes de comentar.';
  end if;
  if char_length(btrim(p_content)) > 2000 then
    raise exception 'El comentario es demasiado largo (máximo 2000 caracteres).';
  end if;
  insert into post_comments (post_id, author_id, content)
  values (p_post, auth.uid(), btrim(p_content))
  returning id into v_id;
  return v_id;
end;
$$;

-- p_reaction null o '' quita la reacción; una reacción por persona por publicación.
create or replace function set_post_reaction(p_post uuid, p_reaction text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_post posts%rowtype;
  v_reaction reaction_kind;
begin
  if auth.uid() is null then raise exception 'Sesión no válida.'; end if;
  select * into v_post from posts where id = p_post and deleted_at is null;
  if not found then raise exception 'La publicación ya no existe.'; end if;
  if not fn_can_view_wall(v_post.wall, v_post.ministry_id, v_post.step_number) then
    raise exception 'No tienes acceso a este muro.';
  end if;
  if p_reaction is null or btrim(p_reaction) = '' then
    delete from post_reactions where post_id = p_post and user_id = auth.uid();
    return;
  end if;
  begin
    v_reaction := p_reaction::reaction_kind;
  exception when others then
    raise exception 'Reacción no válida.';
  end;
  insert into post_reactions (post_id, user_id, reaction)
  values (p_post, auth.uid(), v_reaction)
  on conflict (post_id, user_id) do update set reaction = excluded.reaction;
end;
$$;

create or replace function delete_post(p_post uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_post posts%rowtype;
begin
  if auth.uid() is null then raise exception 'Sesión no válida.'; end if;
  select * into v_post from posts where id = p_post and deleted_at is null;
  if not found then raise exception 'La publicación ya no existe.'; end if;
  if v_post.author_id <> auth.uid()
     and not fn_is_wall_mod(v_post.wall, v_post.ministry_id, v_post.step_number) then
    raise exception 'No puedes eliminar esta publicación.';
  end if;
  update posts set deleted_at = now(), deleted_by = auth.uid() where id = p_post;
  perform fn_audit('delete_post', 'posts', p_post, null,
                   jsonb_build_object('wall', v_post.wall, 'author_id', v_post.author_id));
end;
$$;

create or replace function delete_post_comment(p_comment uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_c post_comments%rowtype;
  v_post posts%rowtype;
begin
  if auth.uid() is null then raise exception 'Sesión no válida.'; end if;
  select * into v_c from post_comments where id = p_comment and deleted_at is null;
  if not found then raise exception 'El comentario ya no existe.'; end if;
  select * into v_post from posts where id = v_c.post_id;
  if v_c.author_id <> auth.uid()
     and not fn_is_wall_mod(v_post.wall, v_post.ministry_id, v_post.step_number) then
    raise exception 'No puedes eliminar este comentario.';
  end if;
  update post_comments set deleted_at = now(), deleted_by = auth.uid() where id = p_comment;
  perform fn_audit('delete_post_comment', 'post_comments', p_comment, null,
                   jsonb_build_object('post_id', v_c.post_id, 'author_id', v_c.author_id));
end;
$$;

-- Solo pastor/superadmin: autoriza (o revoca) a una persona puntual a publicar en el muro general.
create or replace function grant_wall_publisher(p_user uuid, p_grant boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_n int;
begin
  if fn_role() not in ('pastor','superadmin') then
    raise exception 'Solo el administrador general puede hacer esto.';
  end if;
  if not exists (select 1 from profiles where id = p_user) then
    raise exception 'La persona no existe.';
  end if;
  if p_grant then
    insert into wall_publishers (user_id, granted_by) values (p_user, auth.uid())
    on conflict (user_id) do nothing;
  else
    delete from wall_publishers where user_id = p_user;
  end if;
  get diagnostics v_n = row_count;
  if v_n > 0 then
    perform fn_audit('grant_wall_publisher', 'wall_publishers', p_user, null,
                     jsonb_build_object('grant', p_grant));
  end if;
end;
$$;

-- ---------- RLS: deny-all salvo lectura admin de wall_publishers ----------
alter table posts enable row level security;
alter table post_comments enable row level security;
alter table post_reactions enable row level security;
alter table wall_publishers enable row level security;

create policy p_wp_sel_admin on wall_publishers for select
  using (fn_role() in ('pastor','superadmin'));

-- ---------- endurecimiento de funciones (patrón de 002) ----------
revoke execute on function fn_can_view_wall(wall_kind,uuid,int) from public, anon;
revoke execute on function fn_can_post_wall(wall_kind,uuid,int) from public, anon;
revoke execute on function fn_is_wall_mod(wall_kind,uuid,int) from public, anon;
revoke execute on function get_my_walls() from public, anon;
revoke execute on function get_wall_posts(wall_kind,uuid,int,timestamptz,uuid,int) from public, anon;
revoke execute on function get_post_comments(uuid) from public, anon;
revoke execute on function create_post(wall_kind,uuid,int,text) from public, anon;
revoke execute on function add_post_comment(uuid,text) from public, anon;
revoke execute on function set_post_reaction(uuid,text) from public, anon;
revoke execute on function delete_post(uuid) from public, anon;
revoke execute on function delete_post_comment(uuid) from public, anon;
revoke execute on function grant_wall_publisher(uuid,boolean) from public, anon;

grant execute on function fn_can_view_wall(wall_kind,uuid,int) to authenticated;
grant execute on function fn_can_post_wall(wall_kind,uuid,int) to authenticated;
grant execute on function fn_is_wall_mod(wall_kind,uuid,int) to authenticated;
grant execute on function get_my_walls() to authenticated;
grant execute on function get_wall_posts(wall_kind,uuid,int,timestamptz,uuid,int) to authenticated;
grant execute on function get_post_comments(uuid) to authenticated;
grant execute on function create_post(wall_kind,uuid,int,text) to authenticated;
grant execute on function add_post_comment(uuid,text) to authenticated;
grant execute on function set_post_reaction(uuid,text) to authenticated;
grant execute on function delete_post(uuid) to authenticated;
grant execute on function delete_post_comment(uuid) to authenticated;
grant execute on function grant_wall_publisher(uuid,boolean) to authenticated;
