-- ============================================================
-- 032 — Cerrar (y reabrir) una conversación
-- ============================================================
-- La 029 dejó la columna `closed_at` y el mensaje "Esta conversación está
-- cerrada", pero nada que la cerrara: el equipo no tenía forma de dar un tema
-- por resuelto y los hilos se acumulaban abiertos para siempre.
--
-- Cierra el equipo, no la persona: si alguien escribe a la iglesia, es la
-- iglesia quien decide cuándo el asunto quedó atendido. Reabrir es el mismo
-- botón al revés, y la persona siempre puede abrir un hilo nuevo.

create or replace function close_conversation(p_conv uuid, p_reabrir boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare v_c conversations; v_nombre text;
begin
  if auth.uid() is null then raise exception 'inicia sesión'; end if;
  select * into v_c from conversations where id = p_conv;
  if v_c is null or not fn_can_see_conversation(p_conv) then
    raise exception 'No encontramos esa conversación.' using errcode = 'P0001';
  end if;
  -- Solo el lado de la iglesia: quien escribe no cierra su propio reclamo.
  if v_c.member_id = auth.uid() and not fn_is_admin() then
    raise exception 'Solo el equipo de la iglesia puede cerrar una conversación. Si tu tema quedó resuelto, no hace falta que hagas nada.' using errcode = 'P0001';
  end if;
  update conversations
     set closed_at = case when p_reabrir then null else now() end,
         last_message_at = now()
   where id = p_conv;

  select first_name || ' ' || last_name into v_nombre from profiles where id = auth.uid();
  if p_reabrir then
    perform fn_notify_user(v_c.member_id, 'message', 'Reabrimos tu conversación',
      coalesce(v_nombre, 'La iglesia') || ' volvió a abrir: ' || v_c.subject, '/mensajes/' || p_conv);
  else
    perform fn_notify_user(v_c.member_id, 'message', 'Damos por atendido tu tema',
      v_c.subject || '. Si necesitas algo más, escríbenos otra vez cuando quieras.', '/mensajes');
  end if;
end $$;
revoke execute on function close_conversation(uuid, boolean) from public, anon;
grant execute on function close_conversation(uuid, boolean) to authenticated;

-- Comprobación.
do $mig$
begin
  if has_function_privilege('anon', 'close_conversation(uuid, boolean)', 'execute') then
    raise exception '032: anon puede cerrar conversaciones';
  end if;
  if not has_function_privilege('authenticated', 'close_conversation(uuid, boolean)', 'execute') then
    raise exception '032: authenticated no puede cerrar conversaciones';
  end if;
end $mig$;
