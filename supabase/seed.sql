-- ============================================================
-- PRÓXIMO PASO · seed.sql · Datos de DESARROLLO (demo)
-- ⚠️ NO ejecutar en producción. Las cuentas demo se crean con
--    el script scripts/create-demo-users.mjs (usa service role).
-- Ejecutar este SQL DESPUÉS de crear las cuentas demo.
-- ============================================================

-- Ministerios de ejemplo
insert into ministries (name, description, leader_name, leader_contact, capacity, requirements) values
 ('Alabanza (DEMO)','Equipo de música y adoración.','Por definir','',20,'Audición previa'),
 ('Bienvenida (DEMO)','Recibir y orientar a los visitantes.','Por definir','',30,null),
 ('Niños (DEMO)','Ministerio infantil dominical.','Por definir','',25,'Verificación de antecedentes'),
 ('Multimedia (DEMO)','Sonido, cámaras y transmisión.','Por definir','',15,null),
 ('Jóvenes (DEMO)','Ministerio de adolescentes y jóvenes.','Por definir','',20,null);

-- Evaluación DEMO (claramente marcada; NO es un test psicológico real)
with a as (
  insert into assessments (title, description, mode, is_active, is_demo)
  values ('Test de intereses de servicio (DEMO)',
          'DEMO de ejemplo para probar el módulo. La iglesia debe cargar su test real o configurar un enlace externo.',
          'internal_test', true, true)
  returning id
), s1 as (
  insert into assessment_sections (assessment_id, title, position)
  select id, 'Preferencias de servicio (DEMO)', 1 from a returning id
), q1 as (
  insert into assessment_questions (section_id, question_type, text, position)
  select id, 'single_choice', '(DEMO) ¿Qué actividad disfrutas más?', 1 from s1 returning id
), o1 as (
  insert into assessment_options (question_id, text, score, dimension, position)
  select id, x.t, x.s, x.d, x.p from q1, (values
    ('Cantar o tocar un instrumento',3,'ARTE',1),
    ('Conversar y recibir personas',3,'PERSONAS',2),
    ('Enseñar a niños',3,'ENSEÑANZA',3),
    ('Equipos, sonido o cámaras',3,'TECNICO',4)) as x(t,s,d,p)
  returning question_id
), q2 as (
  insert into assessment_questions (section_id, question_type, text, position, scale_min, scale_max)
  select id, 'scale', '(DEMO) Del 1 al 5, ¿cuánto te gusta trabajar en equipo?', 2, 1, 5 from s1 returning id
), q3 as (
  insert into assessment_questions (section_id, question_type, text, position, required)
  select id, 'long_text', '(DEMO) Cuéntanos brevemente tu experiencia sirviendo en una iglesia.', 3, false from s1 returning id
)
update app_settings set value = to_jsonb((select id::text from a)) where key='assessment_active_id';

-- Preguntas EXTRA configurables del Dream Team (los campos base ya están en el formulario)
insert into dream_team_questions (question_type, text, options, required, position) values
 ('single_choice','(DEMO) ¿Has servido como voluntario en otra organización?','["Sí","No"]',false,1),
 ('long_text','(DEMO) ¿Hay algo más que la iglesia deba saber para ubicarte mejor?',null,false,2);

-- Ciclo DEMO con 4 sesiones (fechas: próximos 4 domingos desde hoy)
do $$
declare cid uuid; d date; i int;
  names text[] := array['Sígueme','Intimidad con Dios','Compañerismo con los de adentro','Influencia hacia los de afuera'];
begin
  insert into course_cycles (name, description, status, registration_start, registration_end,
    capacity, location_name, full_address, latitude, longitude, allowed_radius_meters)
  values ('Ciclo DEMO', 'Ciclo de prueba para desarrollo.', 'registration_open',
    now() - interval '7 days', now() + interval '21 days',
    50, 'Auditorio principal (DEMO)', 'Dirección demo 123, Orlando, FL', 28.5383, -81.3792, 150)
  returning id into cid;
  d := current_date + ((7 - extract(dow from current_date)::int) % 7);
  if d = current_date then d := d; end if;
  for i in 1..4 loop
    insert into course_sessions (cycle_id, step_number, name, description, session_date, start_time, end_time,
      location_name, latitude, longitude, allowed_radius_meters, min_accuracy_meters)
    values (cid, i, 'Paso '||i||' · '||names[i], 'Clase presencial del Paso '||i||' (DEMO).', d + (i-1)*7,
      '10:00','11:30','Auditorio principal (DEMO)', 28.5383, -81.3792, 150, 100);
  end loop;
  update course_cycles set certificate_delivery_date = suggest_certificate_date(cid) where id = cid;
end $$;

-- Anuncio de bienvenida
insert into announcements (title, content, audience, priority)
values ('Bienvenido a Próximo Paso (DEMO)','Este es un anuncio de ejemplo. Edítalo o bórralo desde el panel administrativo.','all',1);
