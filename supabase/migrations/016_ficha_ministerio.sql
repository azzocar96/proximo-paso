-- ============================================================
-- 016 — La ficha del ministerio, en manos de su director
-- ============================================================
-- Lo que pidió Jesús: que el director maneje la ficha de SU ministerio, decida
-- si publica el contacto o no, pueda poner un contacto de referencia además del
-- suyo, y sume directamente a personas que ya sirven con él.
--
-- REGLA QUE CAMBIA (confirmada por Jesús): hasta ahora "solo el administrador o
-- el pastor pueden asignar un ministerio directo sin pasar por solicitud".
-- Ahora el director también puede, PERO solo a miembros activos.
--
-- Correcciones de la auditoría (18 hallazgos) que dejaron marca aquí:
--   · ALTO: `ministries` era legible por `anon` con la clave pública del
--     navegador, así que los contactos se podían leer por REST aunque el
--     director los marcara como privados. La casilla solo los escondía en la
--     pantalla. Ahora el catálogo se sirve por un RPC que devuelve NULL en los
--     contactos cuando no están publicados, y se le quita el select a `anon`.
--   · `show_contact` nace en FALSE: el catálogo nunca mostró contactos hasta
--     hoy, así que empezar publicando lo que un admin cargó en su momento sería
--     decidir por el director justo lo que él debe decidir.

-- ---------- 1. Campos nuevos de la ficha ----------
alter table ministries add column if not exists meeting_info text;      -- cuándo y dónde se reúnen
alter table ministries add column if not exists show_contact boolean not null default false;
alter table ministries add column if not exists reference_name text;    -- segunda persona de contacto
alter table ministries add column if not exists reference_contact text;

comment on column ministries.show_contact is
  'Si es false, el catálogo no muestra ningún contacto del ministerio. Lo decide su director. Nace en false a propósito: publicar es una decisión, no un descuido.';

-- ---------- 2. Los contactos dejan de ser públicos ----------
-- La policy p_min_sel (003) no exige sesión y la 010 dio select a `anon`: con la
-- clave anónima del navegador se podía leer la tabla entera. El catálogo real
-- pasa por get_ministries_catalog(), así que `anon` ya no necesita leer nada.
revoke select on ministries from anon;

create or replace function get_ministries_catalog()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((
    select jsonb_agg(to_jsonb(t) order by t.name) from (
      select m.id, m.name, m.description, m.requirements, m.meeting_info, m.image_url,
             m.leader_name,
             -- Los contactos salen SOLO si su director decidió publicarlos.
             case when m.show_contact then m.leader_contact    else null end as leader_contact,
             case when m.show_contact then m.reference_name    else null end as reference_name,
             case when m.show_contact then m.reference_contact else null end as reference_contact
      from ministries m
      where m.status = 'active' and m.deleted_at is null
    ) t
  ), '[]'::jsonb)
  where auth.uid() is not null;
$$;
revoke execute on function get_ministries_catalog() from public, anon;
grant execute on function get_ministries_catalog() to authenticated;

-- ---------- 3. El director edita SU ficha ----------
create or replace function update_ministry_profile(
  p_ministry uuid,
  p_description text,
  p_requirements text,
  p_meeting_info text,
  p_leader_name text,
  p_leader_contact text,
  p_show_contact boolean,
  p_reference_name text,
  p_reference_contact text
) returns void language plpgsql security definer set search_path = public as $$
declare v_before jsonb;
begin
  if not (fn_is_admin() or fn_is_ministry_leader_of(p_ministry)) then
    raise exception 'Solo el director de este ministerio o el administrador pueden editar su ficha.';
  end if;
  select to_jsonb(m) - 'created_at' - 'updated_at' into v_before
    from ministries m where m.id = p_ministry and m.deleted_at is null;
  if v_before is null then
    raise exception 'Ese ministerio no existe.';
  end if;

  if char_length(coalesce(p_description,'')) > 1000
     or char_length(coalesce(p_requirements,'')) > 500
     or char_length(coalesce(p_meeting_info,'')) > 300
     or char_length(coalesce(p_leader_name,'')) > 160
     or char_length(coalesce(p_leader_contact,'')) > 160
     or char_length(coalesce(p_reference_name,'')) > 160
     or char_length(coalesce(p_reference_contact,'')) > 160 then
    raise exception 'Alguno de los textos es demasiado largo.';
  end if;

  -- Si se va a publicar, que haya algo que publicar. Vale con cualquiera de los
  -- dos contactos: un director puede querer publicar solo al colíder.
  if coalesce(p_show_contact, false)
     and coalesce(nullif(btrim(coalesce(p_leader_contact,'')),''),
                  nullif(btrim(coalesce(p_reference_contact,'')),'')) is null then
    raise exception 'Para publicar el contacto, escribe al menos un teléfono o un correo (el tuyo o el de la persona de referencia).';
  end if;

  update ministries set
    description       = nullif(btrim(coalesce(p_description,'')),''),
    requirements      = nullif(btrim(coalesce(p_requirements,'')),''),
    meeting_info      = nullif(btrim(coalesce(p_meeting_info,'')),''),
    leader_name       = nullif(btrim(coalesce(p_leader_name,'')),''),
    leader_contact    = nullif(btrim(coalesce(p_leader_contact,'')),''),
    show_contact      = coalesce(p_show_contact, false),
    reference_name    = nullif(btrim(coalesce(p_reference_name,'')),''),
    reference_contact = nullif(btrim(coalesce(p_reference_contact,'')),''),
    updated_at        = now()
  where id = p_ministry;

  -- Guardamos el antes y el después: si alguien publica un contacto por error,
  -- hay que poder ver qué cambió y quién lo cambió.
  perform fn_audit('update_ministry_profile','ministries',p_ministry,null,
    jsonb_build_object('antes', v_before,
      'despues', (select to_jsonb(m) - 'created_at' - 'updated_at' from ministries m where m.id = p_ministry)));
end $$;

-- ---------- 4. El director suma a alguien a su equipo ----------
-- Los mensajes de error no revelan nombres de gente que este director no tiene
-- por qué ver: si la operación no procede, se responde en genérico.
create or replace function add_ministry_member(p_ministry uuid, p_email text, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_user uuid; v_name text; v_n int; v_prev text; v_assignment uuid;
begin
  if not (fn_is_admin() or fn_is_ministry_leader_of(p_ministry)) then
    raise exception 'Solo el director de este ministerio o el administrador pueden sumar personas.';
  end if;
  if not exists (select 1 from ministries where id = p_ministry and status = 'active' and deleted_at is null) then
    raise exception 'Ese ministerio no está activo.';
  end if;

  -- profiles.email es unique pero SENSIBLE a mayúsculas: pueden convivir
  -- Ana@x.com y ana@x.com. Sin contar primero, se sumaría a una al azar.
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

  -- ¿Ya sirve en otro equipo? Solo cuentan los ministerios vivos: si no, una
  -- asignación a un ministerio dado de baja dejaba a la persona en un callejón
  -- sin salida (ni el director la puede sumar, ni ella pedir el cambio).
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

  -- Cualquier solicitud de ministerio que tuviera abierta queda sin sentido.
  -- Antes solo se cancelaban las de ingreso, y una de cambio olvidada podía
  -- sacar a la persona de este equipo semanas después.
  update member_requests
     set status = 'cancelled', resolved_at = now(), resolved_by = auth.uid(),
         resolution_note = 'El director te sumó directamente a un equipo.'
   where user_id = v_user and status = 'pending' and kind in ('join','leave','switch');

  perform fn_audit('add_ministry_member','ministry_assignments',v_assignment,p_note,
    jsonb_build_object('user', v_user, 'ministry', p_ministry, 'estado_previo', v_prev));
  return jsonb_build_object('name', v_name);
end $$;

revoke execute on function update_ministry_profile(uuid,text,text,text,text,text,boolean,text,text) from public, anon;
revoke execute on function add_ministry_member(uuid,text,text) from public, anon;
grant execute on function update_ministry_profile(uuid,text,text,text,text,text,boolean,text,text) to authenticated;
grant execute on function add_ministry_member(uuid,text,text) to authenticated;
