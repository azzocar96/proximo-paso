-- ===========================================================================
--  PRÓXIMO PASO · CORRER SOLO DESPUÉS DE SUBIR EL CÓDIGO
-- ===========================================================================
--
--  CÓMO SABER QUE YA PUEDES CORRERLO
--  Abre https://proximo-paso.netlify.app/ayuda en el teléfono o en el
--  navegador. Si se abre la página de ayuda, el código nuevo ya está arriba y
--  puedes correr esto. Si te sale "404" o "página no encontrada", todavía no:
--  falta subir y esperar a que Netlify termine (tarda un par de minutos).
--
--  QUÉ HACE
--  Enciende el registro de menores de edad. A partir de ese momento, alguien
--  menor de 18 puede crear su cuenta dando el nombre, el apellido, el correo y
--  el teléfono de su representante — y su cuenta queda detenida hasta que esa
--  persona autorice.
--
--  POR QUÉ VA APARTE
--  Si se enciende antes de subir el código, el formulario viejo no pide los
--  cuatro datos del representante y ningún menor podría terminar de
--  registrarse. No se rompe nada, pero se lleva un mal rato para nada.
-- ===========================================================================

update app_settings
   set value = 'true'::jsonb, updated_at = now()
 where key = 'allow_minors';

insert into app_settings (key, value)
select 'allow_minors', 'true'::jsonb
where not exists (select 1 from app_settings where key = 'allow_minors');

do $chk$
declare v boolean;
begin
  select nullif(value #>> '{}','')::boolean into v
    from app_settings where key = 'allow_minors';
  if coalesce(v,false) = false then
    raise exception 'FALLÓ: el registro de menores sigue apagado.';
  end if;
  if position('guardian_email' in
      pg_get_functiondef('handle_new_user()'::regprocedure)) = 0 then
    raise exception 'FALLÓ: falta correr primero el archivo 1-APLICAR-EN-SUPABASE.sql.';
  end if;
end $chk$;

select 'Listo' as estado,
       'Un menor de 18 ya puede crear su cuenta con los datos de su representante' as significa,
       (select value #>> '{}' from app_settings where key = 'min_age_without_guardian') as "es menor si tiene menos de";
