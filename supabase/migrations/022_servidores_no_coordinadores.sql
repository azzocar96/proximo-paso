-- ============================================================
-- 022 — En esta iglesia no hay "coordinadores": hay servidores
-- ============================================================
-- Jesús: "recuerda que no se llaman coordinadores sino servidores". Y lo
-- explicó así: en Próximo Paso los servidores tienen la responsabilidad de uno
-- o varios pasos concretos — manejar la asistencia, colaborar y la logística
-- en general —, y en los demás ministerios cada director decide qué
-- responsabilidades les da.
--
-- Es un cambio de VOCABULARIO, no de permisos: quien podía hacer algo lo sigue
-- pudiendo hacer igual. Los identificadores internos (el rol `coordinator`, la
-- tabla `cycle_coordinators`, los nombres de función) se quedan como están: no
-- los ve nadie y renombrarlos sería un riesgo sin beneficio.
--
-- Aquí solo se corrigen los CUATRO textos que la persona lee en pantalla y que
-- vivían dentro de funciones. Se hace sobre la definición real que hay en la
-- base, no sobre una copia escrita a mano: si el texto no está donde se espera,
-- la migración falla en vez de dejar la mitad cambiada.

do $mig$
declare
  f record;
  def text;
  nuevo text;
  cambios text[][] := array[
    array['Pide al coordinador que genere uno nuevo.',
          'Pide a quien atiende la clase que genere uno nuevo.'],
    array['La sesión no tiene ubicación configurada. Avisa al coordinador.',
          'La sesión no tiene ubicación configurada. Avisa a quien atiende la clase.'],
    array['El coordinador o un administrador la revisará pronto.',
          'Un servidor del paso, el orador o el administrador la revisará pronto.'],
    array['Pídeselo al coordinador o al orador del paso.',
          'Pídeselo a otro servidor o al orador del paso.']
  ];
  par text[];
  tocadas int := 0;
begin
  for f in
    select p.oid, p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('register_attendance','request_attendance_approval','approve_attendance_request')
  loop
    def := pg_get_functiondef(f.oid);
    nuevo := def;
    foreach par slice 1 in array cambios loop
      nuevo := replace(nuevo, par[1], par[2]);
    end loop;
    if nuevo <> def then
      execute nuevo;
      tocadas := tocadas + 1;
    end if;
  end loop;

  -- Si no cambió ninguna es que ya se aplicó; si cambió alguna pero quedan
  -- textos viejos, algo no encaja y hay que mirarlo.
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosrc like '%al coordinador%'
  ) then
    raise exception 'Quedaron textos con "coordinador" dentro de alguna función';
  end if;
end $mig$;

-- La cuenta de prueba también: se llamaba "Carla Coordinadora". El correo NO se
-- toca (está impreso en la guía y en las notas del proyecto), solo el nombre.
update profiles set first_name = 'Carla', last_name = 'Servidora', updated_at = now()
 where lower(email) = 'coordinador@demo.local' and last_name = 'Coordinadora';
