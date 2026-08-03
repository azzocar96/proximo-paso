-- ============================================================
-- 024 — Cambio de contraseña obligatorio la primera vez
-- ============================================================
-- Las 12 cuentas del equipo se crearon con una contraseña temporal que conozco
-- yo y que viaja por WhatsApp. Pedirle a cada quien "por favor cámbiala" no es
-- un control: es una esperanza. Esto lo convierte en un control.
--
-- `must_change_password` en el perfil. Mientras esté en `true`, el middleware
-- de la app manda a la persona a /cambiar-clave y no la deja ir a ningún otro
-- sitio. Al cambiarla de verdad, la marca se apaga sola.
--
-- La marca la protege el mismo guardián que ya cuida `active_member`: si no,
-- bastaría un PATCH a la tabla para quitársela de encima sin cambiar nada.
-- Solo la apaga `fn_password_changed()`, que se llama DESPUÉS de que Supabase
-- confirmó el cambio, y los administradores.

alter table profiles
  add column if not exists must_change_password boolean not null default false;

comment on column profiles.must_change_password is
  'true = la persona entró con una clave temporal y tiene que cambiarla antes de usar la app.';

-- ---------- 1. El guardián también cuida esta marca ----------
-- Se parchea la definición REAL que hay en la base (no una copia escrita a
-- mano): si el bloque que espero no está donde creo, falla en vez de dejar el
-- guardián a medias. Idempotente: si ya está parcheado, no hace nada.
do $mig$
declare
  def text;
begin
  def := pg_get_functiondef('fn_guard_profile_privileges()'::regprocedure);

  if position('app.pwd_changed' in def) > 0 then
    return;
  end if;

  if position('if not v_admin then' in def) = 0 then
    raise exception '024: no encontré "if not v_admin then" dentro de fn_guard_profile_privileges';
  end if;

  def := replace(
    def,
    'if not v_admin then',
    'if coalesce(current_setting(''app.pwd_changed'', true), '''') <> ''on'' and not v_admin then'
      || ' new.must_change_password := old.must_change_password; end if;'
      || chr(10) || '  if not v_admin then'
  );

  execute def;
end $mig$;

-- ---------- 2. Apagar la marca (lo llama la app al cambiar la clave) ----------
-- OJO con la bandera: `set_config(..., true)` dura TODA la transacción, no la
-- sentencia. Se apaga justo después del update para que un PATCH posterior en
-- la misma petición no se cuele.
create or replace function fn_password_changed() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    return;
  end if;
  perform set_config('app.pwd_changed', 'on', true);
  update profiles set must_change_password = false, updated_at = now()
   where id = auth.uid() and must_change_password;
  perform set_config('app.pwd_changed', 'off', true);
end $$;

revoke execute on function fn_password_changed() from public, anon;
grant execute on function fn_password_changed() to authenticated;

-- ---------- 3. Volver a exigirlo (para el administrador) ----------
-- Sirve cuando haya que darle una clave temporal a alguien que la perdió.
create or replace function fn_require_password_change(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not fn_is_admin() then
    raise exception 'No autorizado' using errcode = 'P0001';
  end if;
  update profiles set must_change_password = true, updated_at = now() where id = p_user;
  -- Los null van casteados a propósito: sin tipo, Postgres no sabe qué
  -- sobrecarga de fn_audit estás llamando.
  perform fn_audit('profiles', 'require_password_change', p_user, null::text, null::jsonb);
end $$;

revoke execute on function fn_require_password_change(uuid) from public, anon;
grant execute on function fn_require_password_change(uuid) to authenticated;

-- ---------- 4. Comprobación ----------
do $mig$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'profiles'
       and column_name = 'must_change_password'
  ) then
    raise exception '024: no quedó la columna must_change_password';
  end if;

  if position('app.pwd_changed' in pg_get_functiondef('fn_guard_profile_privileges()'::regprocedure)) = 0 then
    raise exception '024: el guardián no quedó parcheado';
  end if;

  if not has_column_privilege('authenticated', 'profiles', 'must_change_password', 'select') then
    raise exception '024: authenticated no puede leer must_change_password';
  end if;

  if not has_function_privilege('authenticated', 'fn_password_changed()', 'execute') then
    raise exception '024: authenticated no puede ejecutar fn_password_changed';
  end if;

  if has_function_privilege('anon', 'fn_password_changed()', 'execute') then
    raise exception '024: fn_password_changed quedó abierta a anon';
  end if;
end $mig$;
