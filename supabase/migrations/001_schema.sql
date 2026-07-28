-- ============================================================
-- PRÓXIMO PASO · 001_schema.sql · Esquema completo
-- Ejecutar en Supabase SQL Editor (o supabase db push)
-- ============================================================
create extension if not exists "pgcrypto";

-- ---------- Tipos ----------
create type app_role as enum ('participant','coordinator','admin','superadmin');
create type cycle_status as enum ('draft','registration_open','active','completed','cancelled','archived');
create type session_status as enum ('scheduled','open','closed','cancelled');
create type enrollment_status as enum ('registered','enrolled','in_progress','requirements_pending','completed','certified','withdrawn','cancelled');
create type attendance_method as enum ('qr_geolocation','manual_admin','makeup','imported');
create type attendance_result as enum ('valid','out_of_radius','expired_token','session_closed','duplicate','prerequisite_pending','low_accuracy','error');
create type question_type as enum ('single_choice','multiple_choice','scale','short_text','long_text');
create type assessment_mode as enum ('internal_test','external_url');
create type certificate_status as enum ('eligible','pending_approval','issued','physical_pending','ready_for_pickup','delivered','revoked');
create type ministry_assignment_status as enum ('suggested','interested','pending_contact','contacted','interview_scheduled','assigned','active','inactive','declined');
create type announcement_audience as enum ('all','cycle','ministry','role','certified');
create type contact_status as enum ('new','in_progress','resolved','closed');
create type account_status as enum ('active','suspended','deleted');

-- ---------- updated_at trigger ----------
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ---------- profiles ----------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text not null,
  middle_name text,
  last_name text not null,
  birth_date date,
  email text not null unique,
  phone text,
  address text,
  city text,
  state text,
  zip_code text,
  photo_url text,
  account_status account_status not null default 'active',
  privacy_consent boolean not null default false,
  privacy_consent_at timestamptz,
  guardian_consent boolean,
  guardian_name text,
  guardian_contact text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger t_profiles_u before update on profiles for each row execute function set_updated_at();

-- ---------- user_roles ----------
create table user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  role app_role not null default 'participant',
  assigned_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
create index idx_user_roles_user on user_roles(user_id);

-- ---------- course_cycles ----------
create table course_cycles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  registration_start timestamptz,
  registration_end timestamptz,
  capacity int check (capacity is null or capacity > 0),
  status cycle_status not null default 'draft',
  location_name text,
  full_address text,
  latitude double precision,
  longitude double precision,
  allowed_radius_meters int not null default 100,
  certificate_delivery_date date,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create trigger t_cycles_u before update on course_cycles for each row execute function set_updated_at();
create index idx_cycles_status on course_cycles(status) where deleted_at is null;

-- coordinadores asignados a ciclos
create table cycle_coordinators (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references course_cycles(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (cycle_id, user_id)
);
create index idx_cycle_coord_user on cycle_coordinators(user_id);

-- ---------- course_sessions ----------
create table course_sessions (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references course_cycles(id) on delete cascade,
  step_number int not null check (step_number between 1 and 4),
  name text not null,
  description text,
  session_date date,
  start_time time,
  end_time time,
  attendance_open_at timestamptz,
  attendance_close_at timestamptz,
  location_name text,
  latitude double precision,
  longitude double precision,
  allowed_radius_meters int,
  min_accuracy_meters int not null default 100,
  status session_status not null default 'scheduled',
  qr_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cycle_id, step_number)
);
create trigger t_sessions_u before update on course_sessions for each row execute function set_updated_at();
create index idx_sessions_cycle on course_sessions(cycle_id);

-- ---------- enrollments ----------
create table enrollments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  cycle_id uuid not null references course_cycles(id) on delete cascade,
  status enrollment_status not null default 'enrolled',
  withdrawn_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, cycle_id)
);
create trigger t_enroll_u before update on enrollments for each row execute function set_updated_at();
create index idx_enroll_cycle on enrollments(cycle_id);
create index idx_enroll_user on enrollments(user_id);

-- ---------- attendance_tokens ----------
create table attendance_tokens (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references course_sessions(id) on delete cascade,
  token text not null unique,
  expires_at timestamptz not null,
  revoked boolean not null default false,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create index idx_tokens_session on attendance_tokens(session_id);

-- ---------- attendance_records ----------
create table attendance_records (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references course_sessions(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  enrollment_id uuid not null references enrollments(id) on delete cascade,
  method attendance_method not null default 'qr_geolocation',
  result attendance_result not null default 'valid',
  distance_meters numeric(9,1),
  accuracy_meters numeric(9,1),
  recorded_at timestamptz not null default now(),
  recorded_by uuid references profiles(id),
  manual_reason text,
  created_at timestamptz not null default now(),
  unique (session_id, user_id)          -- impide duplicados a nivel BD
);
create index idx_att_user on attendance_records(user_id);
create index idx_att_session on attendance_records(session_id);

-- ---------- evaluaciones ----------
create table assessments (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  mode assessment_mode not null default 'internal_test',
  external_url text,
  is_active boolean not null default false,
  is_demo boolean not null default false,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create trigger t_assess_u before update on assessments for each row execute function set_updated_at();

create table assessment_sections (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references assessments(id) on delete cascade,
  title text not null,
  position int not null default 0,
  created_at timestamptz not null default now()
);
create table assessment_questions (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references assessment_sections(id) on delete cascade,
  question_type question_type not null,
  text text not null,
  required boolean not null default true,
  position int not null default 0,
  scale_min int, scale_max int,
  created_at timestamptz not null default now()
);
create table assessment_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references assessment_questions(id) on delete cascade,
  text text not null,
  score int not null default 0,
  dimension text,                      -- p. ej. "S","E","R","V" para sumar por dimensión
  position int not null default 0
);
create index idx_q_section on assessment_questions(section_id);
create index idx_o_question on assessment_options(question_id);

create table assessment_attempts (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references assessments(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  enrollment_id uuid references enrollments(id) on delete cascade,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (assessment_id, user_id, enrollment_id)
);
create table assessment_answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references assessment_attempts(id) on delete cascade,
  question_id uuid not null references assessment_questions(id) on delete cascade,
  option_ids uuid[],
  scale_value int,
  text_value text,
  created_at timestamptz not null default now(),
  unique (attempt_id, question_id)
);
create table assessment_results (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null unique references assessment_attempts(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  total_score int,
  dimension_scores jsonb,              -- {"S":12,"E":8,...}
  summary text,
  suggested_ministry_ids uuid[],
  created_at timestamptz not null default now()
);
create index idx_attempts_user on assessment_attempts(user_id);

-- ---------- Dream Team ----------
create table dream_team_questions (
  id uuid primary key default gen_random_uuid(),
  question_type question_type not null default 'short_text',
  text text not null,
  options jsonb,                       -- opciones simples para choice
  required boolean not null default true,
  is_active boolean not null default true,
  position int not null default 0,
  created_at timestamptz not null default now()
);
create table dream_team_forms (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  enrollment_id uuid not null references enrollments(id) on delete cascade,
  interest_areas text[],
  talents text[],
  experience text,
  weekly_availability text[],
  available_times text[],
  ministry_interest_ids uuid[],
  previous_church_experience text,
  comments text,
  contact_consent boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (enrollment_id)
);
create trigger t_dtf_u before update on dream_team_forms for each row execute function set_updated_at();
create table dream_team_answers (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references dream_team_forms(id) on delete cascade,
  question_id uuid not null references dream_team_questions(id) on delete cascade,
  value jsonb,
  created_at timestamptz not null default now(),
  unique (form_id, question_id)
);

-- ---------- ministerios ----------
create table ministries (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  leader_name text,
  leader_contact text,
  capacity int,
  status text not null default 'active' check (status in ('active','inactive')),
  image_url text,
  requirements text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create trigger t_min_u before update on ministries for each row execute function set_updated_at();

create table ministry_assignments (
  id uuid primary key default gen_random_uuid(),
  ministry_id uuid not null references ministries(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  status ministry_assignment_status not null default 'suggested',
  notes text,
  assigned_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ministry_id, user_id)
);
create trigger t_ma_u before update on ministry_assignments for each row execute function set_updated_at();
create index idx_ma_user on ministry_assignments(user_id);

-- ---------- certificados ----------
create table certificates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  enrollment_id uuid not null unique references enrollments(id) on delete cascade,
  status certificate_status not null default 'eligible',
  verify_code text not null unique default encode(gen_random_bytes(8),'hex'),
  full_name text not null,
  course_name text not null,
  church_name text not null,
  completion_date date,
  pdf_path text,
  approved_by uuid references profiles(id),
  issued_at timestamptz,
  revoked_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger t_cert_u before update on certificates for each row execute function set_updated_at();
create index idx_cert_user on certificates(user_id);

-- ---------- anuncios ----------
create table announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  image_url text,
  audience announcement_audience not null default 'all',
  cycle_id uuid references course_cycles(id) on delete set null,
  ministry_id uuid references ministries(id) on delete set null,
  role app_role,
  publish_at timestamptz not null default now(),
  expires_at timestamptz,
  priority int not null default 0,
  author_id uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create trigger t_ann_u before update on announcements for each row execute function set_updated_at();
create index idx_ann_pub on announcements(publish_at) where deleted_at is null;

-- ---------- contacto ----------
create table contact_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete set null,
  name text not null,
  email text not null,
  category text not null default 'general',
  message text not null,
  status contact_status not null default 'new',
  handled_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger t_cr_u before update on contact_requests for each row execute function set_updated_at();

-- ---------- auditoría y configuración ----------
create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references profiles(id),
  action text not null,
  entity text not null,
  entity_id uuid,
  reason text,
  details jsonb,
  created_at timestamptz not null default now()
);
create index idx_audit_entity on audit_logs(entity, entity_id);
create index idx_audit_actor on audit_logs(actor_id);

create table app_settings (
  key text primary key,
  value jsonb not null,
  description text,
  updated_by uuid references profiles(id),
  updated_at timestamptz not null default now()
);

-- ---------- valores iniciales de configuración ----------
-- Datos reales entregados por la iglesia (28-jul-2026): nombre, dirección,
-- marca (naranja/blanco, logo Próximo Paso), nombres de los 4 pasos y
-- objetivos/modalidad del programa. Todo editable luego desde Admin → Configuración.
insert into app_settings (key, value, description) values
 ('church_name','"Iglesia Global Orlando"','Nombre de la iglesia (mostrar en toda la app y certificados)'),
 ('church_address','"735 Herndon Ave, Orlando, FL 32803"','Dirección de la iglesia'),
 ('church_contact','{"phone":"","email":""}','Contacto de la iglesia'),
 ('course_name','"Próximo Paso"','Nombre del curso'),
 ('brand','{"primary":"#FE4703","accent":"#f59e0b","logo_url":"/logo.png"}','Colores y logo'),
 ('step_names','["Sígueme","Intimidad con Dios","Compañerismo con los de adentro","Influencia hacia los de afuera"]','Nombre oficial de cada uno de los 4 pasos presenciales, en orden'),
 ('program_objectives','"El Programa Próximo Paso tiene como finalidad ayudar a los participantes a seguir a Jesús, conectarse con la iglesia, descubrir su propósito y servir a otros. Consta de cuatro pasos presenciales diseñados para guiar a cada persona en su caminar de fe y servicio."','Objetivos del programa (texto público, página de inicio)'),
 ('program_schedule','{"location_name":"Salón Australia, Summit","time":"4:30 PM","when":"después del servicio principal","duration_min":20,"frequency":"mensual","months_excluded":["diciembre","enero"]}','Modalidad y horario del programa (texto público, página de inicio)'),
 ('certificate_auto_approve','false','Aprobar certificados automáticamente al ser elegible'),
 ('certificate_signatures','[]','Firmas del certificado [{name,title,image_url}]'),
 ('assessment_active_id','null','Evaluación activa para el flujo del curso'),
 ('assessment_mode','"internal_test"','internal_test | external_url'),
 ('assessment_external_url','""','URL externa del test si aplica'),
 ('min_age_without_guardian','18','Edad mínima sin consentimiento de representante'),
 ('allow_minors','false','Permitir menores con consentimiento de representante'),
 ('default_attendance_window_min','60','Minutos por defecto de ventana de asistencia'),
 ('default_token_ttl_min','15','Minutos de vida por defecto del QR'),
 ('privacy_policy','"Política de privacidad pendiente de redacción por la iglesia."','Texto editable de la política de privacidad');

-- ---------- perfil automático al registrarse ----------
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, first_name, last_name, privacy_consent, privacy_consent_at)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data->>'first_name',''),
          coalesce(new.raw_user_meta_data->>'last_name',''),
          coalesce((new.raw_user_meta_data->>'privacy_consent')::boolean,false),
          case when coalesce((new.raw_user_meta_data->>'privacy_consent')::boolean,false) then now() end);
  insert into user_roles (user_id, role) values (new.id, 'participant');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
for each row execute function handle_new_user();
