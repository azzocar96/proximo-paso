-- ============================================================
-- 025 — La inscripción tardía deja de ser un acuerdo de palabra
-- ============================================================
-- La regla del proyecto siempre dijo: "inscripción tardía a un ciclo ya
-- iniciado queda bloqueada; la persona espera al siguiente". Estaba escrita en
-- las notas y respetada por costumbre, pero **no estaba en el código**.
-- `enroll_in_cycle` solo miraba el estado del ciclo y la ventana de fechas de
-- inscripción.
--
-- Se vio en producción el 3 de agosto: el Paso 1 se dio el domingo 2 y las
-- inscripciones seguían abiertas hasta el 18. Cualquiera que se anotara ese
-- lunes habría quedado atascado para siempre — cada paso es prerrequisito del
-- siguiente y el primero ya no existe. No lo sufrió nadie de milagro: había
-- cero inscritos.
--
-- El mensaje importa tanto como el bloqueo: quien llega tarde no debe leer un
-- error, debe leer una invitación a esperar el próximo ciclo.

do $mig$
declare
  def text;
begin
  def := pg_get_functiondef('enroll_in_cycle(uuid)'::regprocedure);

  if position('ya empezó' in def) > 0 then
    return;  -- ya aplicada
  end if;

  if position('las inscripciones ya cerraron' in def) = 0 then
    raise exception '025: no encontré el chequeo de registration_end dentro de enroll_in_cycle';
  end if;

  -- El bloqueo va justo DESPUÉS de la ventana de inscripción y ANTES de
  -- comprobar duplicados: si el ciclo ya arrancó, no hay nada más que mirar.
  def := replace(
    def,
    'if exists (select 1 from enrollments where user_id=auth.uid() and cycle_id=p_cycle) then',
    'if exists (select 1 from course_sessions s where s.cycle_id = p_cycle'
      || ' and s.status <> ''cancelled'' and s.session_date is not null'
      || ' and s.session_date < current_date) then'
      || ' raise exception ''Este ciclo ya empezó y las clases se dan en orden, así que no podemos sumarte a mitad de camino. Tu cuenta queda lista: te avisamos en cuanto abra el próximo ciclo.''; end if;'
      || chr(10)
      || '  if exists (select 1 from enrollments where user_id=auth.uid() and cycle_id=p_cycle) then'
  );

  execute def;
end $mig$;

-- Comprobación: que quedó, y que sigue siendo ejecutable por quien debe.
do $mig$
begin
  if position('ya empezó' in pg_get_functiondef('enroll_in_cycle(uuid)'::regprocedure)) = 0 then
    raise exception '025: el bloqueo no quedó dentro de enroll_in_cycle';
  end if;
  if not has_function_privilege('authenticated', 'enroll_in_cycle(uuid)', 'execute') then
    raise exception '025: authenticated ya no puede ejecutar enroll_in_cycle';
  end if;
  if has_function_privilege('anon', 'enroll_in_cycle(uuid)', 'execute') then
    raise exception '025: enroll_in_cycle quedó abierta a anon';
  end if;
end $mig$;
