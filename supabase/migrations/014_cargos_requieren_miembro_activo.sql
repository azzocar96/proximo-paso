-- ============================================================
-- 014 — Los cargos de la jerarquía exigen ser miembro activo
-- ============================================================
-- Regla de Jesús: "Para que alguien tenga algún tipo de posición dentro de la
-- jerarquía tendría que ya ser un miembro activo, es decir, haber pasado el curso.
-- Las personas que ya son miembros activos es porque en algún momento hicieron el
-- curso antes de usar esta plataforma. Eso lo decide el administrador."
--
-- Traducción al sistema: nadie puede ser director de ministerio ni orador de un
-- paso si antes no está marcado como miembro activo. El orden correcto es:
--   1) el administrador marca a la persona como miembro activo (ficha del
--      participante), sea porque completó el curso aquí o porque lo hizo antes;
--   2) recién entonces se le puede dar un cargo.
-- El error se lo dice al administrador con ese mismo orden, para que no se quede
-- adivinando por qué no lo deja.
--
-- Y la otra mitad de la regla: pertenecer a un ministerio es OPCIONAL. Un miembro
-- activo que no quiere servir en ningún equipo sigue siendo parte de la comunidad
-- y conserva el muro general. Eso ya funciona así (el muro general depende de
-- active_member, no de tener ministerio); esta migración no lo toca, solo lo deja
-- escrito para que nadie lo "arregle" por error más adelante.

-- ---------- director de ministerio ----------
create or replace function assign_ministry_leader(p_user uuid, p_ministry uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if fn_role() not in ('superadmin','pastor') then
    raise exception 'solo el administrador o el pastor pueden asignar directores de ministerio';
  end if;
  -- NUEVO (014)
  if not exists (select 1 from profiles where id = p_user and active_member) then
    raise exception 'Para dirigir un ministerio hay que ser miembro activo. Marca primero a esta persona como miembro activo desde su ficha y vuelve a intentarlo.';
  end if;
  insert into ministry_leaders (user_id, ministry_id, assigned_by) values (p_user, p_ministry, auth.uid())
  on conflict (user_id, ministry_id) do nothing;
  perform fn_audit('assign_ministry_leader','ministry_leaders',p_ministry,null,jsonb_build_object('user_id',p_user));
end $$;

-- ---------- orador de un paso ----------
create or replace function assign_step_speaker(p_step int, p_user uuid, p_bio text default null, p_phone text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not fn_is_admin() then raise exception 'no autorizado'; end if;
  -- NUEVO (014)
  if not exists (select 1 from profiles where id = p_user and active_member) then
    raise exception 'Para ser orador de un paso hay que ser miembro activo. Marca primero a esta persona como miembro activo desde su ficha y vuelve a intentarlo.';
  end if;
  insert into step_speakers (step_number, user_id, bio, contact_phone, assigned_by)
  values (p_step, p_user, nullif(trim(p_bio),''), nullif(trim(p_phone),''), auth.uid())
  on conflict (step_number) do update
    set user_id = excluded.user_id, bio = excluded.bio, contact_phone = excluded.contact_phone,
        assigned_by = excluded.assigned_by;
  perform fn_audit('assign_step_speaker','step_speakers',p_user,null,jsonb_build_object('step',p_step));
end $$;

-- ---------- red de seguridad ----------
-- Si a alguien con cargo le retiran la marca de miembro activo (por error o por
-- disciplina), NO lo dejamos sin acceso en silencio: fn_my_nav ya contempla a
-- directores y oradores explícitamente, así que conserva sus secciones hasta que
-- el administrador le quite también el cargo. Preferimos que se vea de más y se
-- corrija a que alguien se quede sin app sin saber por qué (lección de la 010).

-- ---------- consistencia de los datos actuales ----------
-- Cualquiera que hoy tenga un cargo y no esté marcado como miembro activo queda
-- marcado ahora: si la iglesia le confió un ministerio o un paso, es porque ya
-- hizo el curso en su momento. Se registra quién lo aprobó como "regularización".
with cargos as (
  select user_id from ministry_leaders
  union
  select user_id from step_speakers
)
update profiles p
   set active_member = true,
       active_member_since = coalesce(p.active_member_since, now())
  from cargos c
 where p.id = c.user_id and not p.active_member;
