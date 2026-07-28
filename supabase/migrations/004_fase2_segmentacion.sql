-- ============================================================
-- PRÓXIMO PASO · 004_fase2_segmentacion.sql
-- Fase 2: resultado autoreportado del test externo, campos reales
-- del formulario Dream Team, líderes de ministerio (RLS) y el
-- panel de segmentación de participantes.
-- No modifica 001/002/003; solo agrega columnas/tablas/funciones
-- y políticas nuevas (create or replace / create policy).
-- ============================================================

-- ---------- Parte 1 · Test externo: resultado autoreportado ----------
-- La iglesia usa su propio test de personalidad en su sitio web; nosotros
-- no calculamos ningún puntaje, solo guardamos la etiqueta que la persona
-- dice haber obtenido (p. ej. "D", "I", "S", "C" u otra que reporte).
alter table assessment_results add column if not exists external_result text;

-- RPC para que el propio usuario guarde su resultado autoreportado
-- (assessment_results no tiene política de insert/update para el usuario;
-- solo se escribe vía funciones definer, igual que complete_assessment_attempt).
create or replace function set_external_test_result(p_attempt uuid, p_result text)
returns void language plpgsql security definer set search_path = public as $$
declare a record; clean text;
begin
  select * into a from assessment_attempts where id = p_attempt and user_id = auth.uid();
  if a is null then raise exception 'intento no encontrado'; end if;
  clean := nullif(trim(p_result), '');
  update assessment_results set external_result = clean where attempt_id = p_attempt;
  if not found then
    insert into assessment_results (attempt_id, user_id, external_result) values (p_attempt, a.user_id, clean);
  end if;
end $$;
grant execute on function set_external_test_result(uuid, text) to authenticated;

-- ---------- Parte 2 · Dream Team: campos reales del formulario de la iglesia ----------
alter table dream_team_forms add column if not exists marital_status text
  check (marital_status is null or marital_status in ('single','married','widowed','divorced'));
alter table dream_team_forms add column if not exists gender text
  check (gender is null or gender in ('female','male'));
alter table dream_team_forms add column if not exists education_level text
  check (education_level is null or education_level in ('primary','secondary','university'));
alter table dream_team_forms add column if not exists education_degree text;
alter table dream_team_forms add column if not exists occupation text;
alter table dream_team_forms add column if not exists church_attendance_time text
  check (church_attendance_time is null or church_attendance_time in ('lt_1y','1_3y','3_4y','4y_plus'));
alter table dream_team_forms add column if not exists theological_studies boolean not null default false;
alter table dream_team_forms add column if not exists theological_studies_degree text;
alter table dream_team_forms add column if not exists guidance_interest text;

-- "elige hasta 3 ministerios en orden de preferencia" se representa con el
-- orden del arreglo ministry_interest_ids (índice 0 = 1ª opción). Se valida
-- el máximo de 3 en el server action; este check es una red de seguridad.
alter table dream_team_forms add constraint dtf_max_3_ministry_interests
  check (ministry_interest_ids is null or array_length(ministry_interest_ids, 1) is null or array_length(ministry_interest_ids, 1) <= 3);

create index if not exists idx_dtf_ministry_interest on dream_team_forms using gin (ministry_interest_ids);

-- ---------- Parte 3 · Líderes de ministerio (concepto transversal, no un rol jerárquico) ----------
create table ministry_leaders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  ministry_id uuid not null references ministries(id) on delete cascade,
  assigned_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  unique (user_id, ministry_id)
);
create index idx_ml_user on ministry_leaders(user_id);
create index idx_ml_ministry on ministry_leaders(ministry_id);
alter table ministry_leaders enable row level security;
-- lectura: el propio líder ve sus asignaciones; admin ve todas. Escritura
-- SOLO vía assign_ministry_leader()/remove_ministry_leader() (superadmin).
create policy p_ml_sel on ministry_leaders for select using (user_id = auth.uid() or fn_is_admin());

-- ---------- helpers de rol (mismo patrón que fn_is_coordinator_of) ----------
create or replace function fn_is_ministry_leader_of(p_ministry uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select fn_is_admin() or exists (
    select 1 from ministry_leaders where ministry_id = p_ministry and user_id = auth.uid());
$$;
create or replace function fn_is_ministry_leader() returns boolean
language sql stable security definer set search_path = public as $$
  select fn_is_admin() or exists (select 1 from ministry_leaders where user_id = auth.uid());
$$;
grant execute on function fn_is_ministry_leader_of(uuid) to authenticated;
grant execute on function fn_is_ministry_leader() to authenticated;

-- ---------- gestión de líderes (solo superadmin, igual que set_user_role) ----------
create or replace function assign_ministry_leader(p_user uuid, p_ministry uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if fn_role() <> 'superadmin' then raise exception 'solo el superadministrador puede asignar líderes de ministerio'; end if;
  insert into ministry_leaders (user_id, ministry_id, assigned_by) values (p_user, p_ministry, auth.uid())
  on conflict (user_id, ministry_id) do nothing;
  perform fn_audit('assign_ministry_leader','ministry_leaders',p_ministry,null,jsonb_build_object('user_id',p_user));
end $$;
create or replace function remove_ministry_leader(p_user uuid, p_ministry uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if fn_role() <> 'superadmin' then raise exception 'solo el superadministrador puede quitar líderes de ministerio'; end if;
  delete from ministry_leaders where user_id = p_user and ministry_id = p_ministry;
  perform fn_audit('remove_ministry_leader','ministry_leaders',p_ministry,null,jsonb_build_object('user_id',p_user));
end $$;
grant execute on function assign_ministry_leader(uuid,uuid) to authenticated;
grant execute on function remove_ministry_leader(uuid,uuid) to authenticated;

-- ---------- RLS adicional: un líder ve SOLO a quienes marcaron interés ----------
-- en un ministerio que lidera (vía dream_team_forms.ministry_interest_ids).
-- Se agregan políticas nuevas (se combinan con OR junto a las de 003).
create policy p_profiles_ministry_leader_sel on profiles for select using (
  exists (
    select 1 from dream_team_forms f
    join ministry_leaders ml on ml.ministry_id = any(f.ministry_interest_ids)
    where f.user_id = profiles.id and ml.user_id = auth.uid()
  ));

create policy p_enr_ministry_leader_sel on enrollments for select using (
  exists (
    select 1 from dream_team_forms f
    join ministry_leaders ml on ml.ministry_id = any(f.ministry_interest_ids)
    where f.user_id = enrollments.user_id and ml.user_id = auth.uid()
  ));

create policy p_dtf_ministry_leader_sel on dream_team_forms for select using (
  exists (
    select 1 from ministry_leaders ml
    where ml.user_id = auth.uid() and ml.ministry_id = any(dream_team_forms.ministry_interest_ids)
  ));

-- assessment_attempts no guarda el ministerio directo; se llega vía el
-- dream_team_forms del mismo usuario (necesario para poder anidar
-- assessment_results desde assessment_attempts en la consulta de segmentación).
create policy p_att2_ministry_leader_sel on assessment_attempts for select using (
  exists (
    select 1 from dream_team_forms f
    join ministry_leaders ml on ml.ministry_id = any(f.ministry_interest_ids)
    where f.user_id = assessment_attempts.user_id and ml.user_id = auth.uid()
  ));

create policy p_res_ministry_leader_sel on assessment_results for select using (
  exists (
    select 1 from dream_team_forms f
    join ministry_leaders ml on ml.ministry_id = any(f.ministry_interest_ids)
    where f.user_id = assessment_results.user_id and ml.user_id = auth.uid()
  ));

-- ---------- Parte 4 · Corrección de redacción: cadencia real del programa ----------
-- No es "una clase al mes": los 4 pasos se dictan uno por cada domingo de un
-- mismo mes calendario, y ese ciclo de 4 domingos se repite cada mes excepto
-- diciembre y enero. Se agrega la clave "cadence" para dejarlo explícito
-- (se mantiene "frequency" por compatibilidad con datos/UI existentes).
update app_settings
set value = '{"location_name":"Salón Australia, Summit","time":"4:30 PM","when":"después del servicio principal","duration_min":20,"frequency":"mensual","cadence":"un paso cada domingo del mes","months_excluded":["diciembre","enero"]}'::jsonb,
    updated_at = now()
where key = 'program_schedule';
