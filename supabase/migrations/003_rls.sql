-- ============================================================
-- PRÓXIMO PASO · 003_rls.sql · Row Level Security (todas las tablas)
-- Las mutaciones sensibles pasan por funciones SECURITY DEFINER (002).
-- ============================================================

alter table profiles enable row level security;
alter table user_roles enable row level security;
alter table course_cycles enable row level security;
alter table cycle_coordinators enable row level security;
alter table course_sessions enable row level security;
alter table enrollments enable row level security;
alter table attendance_tokens enable row level security;
alter table attendance_records enable row level security;
alter table assessments enable row level security;
alter table assessment_sections enable row level security;
alter table assessment_questions enable row level security;
alter table assessment_options enable row level security;
alter table assessment_attempts enable row level security;
alter table assessment_answers enable row level security;
alter table assessment_results enable row level security;
alter table dream_team_questions enable row level security;
alter table dream_team_forms enable row level security;
alter table dream_team_answers enable row level security;
alter table ministries enable row level security;
alter table ministry_assignments enable row level security;
alter table certificates enable row level security;
alter table announcements enable row level security;
alter table contact_requests enable row level security;
alter table audit_logs enable row level security;
alter table app_settings enable row level security;

-- profiles
create policy p_profiles_self_sel on profiles for select using (id = auth.uid() or fn_is_staff());
create policy p_profiles_self_upd on profiles for update using (id = auth.uid() or fn_is_admin())
  with check (id = auth.uid() or fn_is_admin());
-- (INSERT lo hace el trigger handle_new_user con security definer)

-- user_roles: lectura propia y staff; escritura solo vía set_user_role()
create policy p_roles_sel on user_roles for select using (user_id = auth.uid() or fn_is_staff());

-- course_cycles: autenticados ven ciclos no borrados que no estén en draft; staff ve todo; escribe admin
create policy p_cycles_sel on course_cycles for select using (
  deleted_at is null and (status <> 'draft' or fn_is_staff()));
create policy p_cycles_ins on course_cycles for insert with check (fn_is_admin());
create policy p_cycles_upd on course_cycles for update using (fn_is_admin());

-- cycle_coordinators
create policy p_cc_sel on cycle_coordinators for select using (fn_is_staff());
create policy p_cc_all on cycle_coordinators for all using (fn_is_admin()) with check (fn_is_admin());

-- course_sessions: ver las de ciclos visibles; escribir admin o coordinador del ciclo
create policy p_sess_sel on course_sessions for select using (
  exists (select 1 from course_cycles c where c.id = cycle_id and c.deleted_at is null
          and (c.status <> 'draft' or fn_is_staff())));
create policy p_sess_ins on course_sessions for insert with check (fn_is_admin());
create policy p_sess_upd on course_sessions for update using (fn_is_coordinator_of(cycle_id));

-- enrollments: dueño lee; coordinador de su ciclo lee; admin todo; insert vía enroll_in_cycle
create policy p_enr_sel on enrollments for select using (
  user_id = auth.uid() or fn_is_admin() or fn_is_coordinator_of(cycle_id));
create policy p_enr_upd on enrollments for update using (
  fn_is_admin() or (user_id = auth.uid()))
  with check (fn_is_admin() or (user_id = auth.uid() and status in ('withdrawn')));
-- participante solo puede retirarse; el resto de cambios de estado ocurren en funciones definer

-- attendance_tokens: solo staff del ciclo (participantes usan el token vía RPC sin leer la tabla)
create policy p_tok_sel on attendance_tokens for select using (
  fn_is_coordinator_of((select cycle_id from course_sessions s where s.id = session_id)));

-- attendance_records: dueño lee; staff del ciclo lee; escritura solo por funciones definer
create policy p_att_sel on attendance_records for select using (
  user_id = auth.uid() or fn_is_admin()
  or fn_is_coordinator_of((select cycle_id from course_sessions s where s.id = session_id)));

-- assessments (estructura): activos visibles para autenticados; gestión admin
create policy p_ass_sel on assessments for select using (deleted_at is null and (is_active or fn_is_admin()));
create policy p_ass_all on assessments for all using (fn_is_admin()) with check (fn_is_admin());
create policy p_asec_sel on assessment_sections for select using (
  exists (select 1 from assessments a where a.id = assessment_id and a.deleted_at is null and (a.is_active or fn_is_admin())));
create policy p_asec_all on assessment_sections for all using (fn_is_admin()) with check (fn_is_admin());
create policy p_aq_sel on assessment_questions for select using (
  exists (select 1 from assessment_sections s join assessments a on a.id = s.assessment_id
          where s.id = section_id and a.deleted_at is null and (a.is_active or fn_is_admin())));
create policy p_aq_all on assessment_questions for all using (fn_is_admin()) with check (fn_is_admin());
create policy p_ao_sel on assessment_options for select using (
  exists (select 1 from assessment_questions q join assessment_sections s on s.id=q.section_id
          join assessments a on a.id=s.assessment_id
          where q.id = question_id and a.deleted_at is null and (a.is_active or fn_is_admin())));
create policy p_ao_all on assessment_options for all using (fn_is_admin()) with check (fn_is_admin());

-- intentos/respuestas/resultados: PRIVADOS (dueño + admin; coordinador NO)
create policy p_att2_sel on assessment_attempts for select using (user_id = auth.uid() or fn_is_admin());
create policy p_att2_ins on assessment_attempts for insert with check (user_id = auth.uid());
create policy p_ans_sel on assessment_answers for select using (
  exists (select 1 from assessment_attempts t where t.id = attempt_id and (t.user_id = auth.uid() or fn_is_admin())));
create policy p_ans_ins on assessment_answers for insert with check (
  exists (select 1 from assessment_attempts t where t.id = attempt_id and t.user_id = auth.uid() and t.completed_at is null));
create policy p_ans_upd on assessment_answers for update using (
  exists (select 1 from assessment_attempts t where t.id = attempt_id and t.user_id = auth.uid() and t.completed_at is null));
create policy p_res_sel on assessment_results for select using (user_id = auth.uid() or fn_is_admin());

-- dream team
create policy p_dtq_sel on dream_team_questions for select using (is_active or fn_is_admin());
create policy p_dtq_all on dream_team_questions for all using (fn_is_admin()) with check (fn_is_admin());
create policy p_dtf_sel on dream_team_forms for select using (user_id = auth.uid() or fn_is_admin());
create policy p_dtf_ins on dream_team_forms for insert with check (user_id = auth.uid());
create policy p_dtf_upd on dream_team_forms for update using (
  (user_id = auth.uid() and completed_at is null) or fn_is_admin());
create policy p_dta_sel on dream_team_answers for select using (
  exists (select 1 from dream_team_forms f where f.id = form_id and (f.user_id = auth.uid() or fn_is_admin())));
create policy p_dta_ins on dream_team_answers for insert with check (
  exists (select 1 from dream_team_forms f where f.id = form_id and f.user_id = auth.uid() and f.completed_at is null));
create policy p_dta_upd on dream_team_answers for update using (
  exists (select 1 from dream_team_forms f where f.id = form_id and f.user_id = auth.uid() and f.completed_at is null));

-- ministerios
create policy p_min_sel on ministries for select using (deleted_at is null);
create policy p_min_all on ministries for all using (fn_is_admin()) with check (fn_is_admin());
create policy p_mas_sel on ministry_assignments for select using (user_id = auth.uid() or fn_is_admin());
create policy p_mas_ins on ministry_assignments for insert with check (
  fn_is_admin() or (user_id = auth.uid() and status in ('interested')));
create policy p_mas_upd on ministry_assignments for update using (fn_is_admin() or user_id = auth.uid())
  with check (fn_is_admin() or (user_id = auth.uid() and status in ('interested','declined')));

-- certificados: dueño lee el suyo; admin gestiona; verificación pública vía verify_certificate()
create policy p_cert_sel on certificates for select using (user_id = auth.uid() or fn_is_admin());
create policy p_cert_upd on certificates for update using (fn_is_admin());

-- anuncios: publicados y vigentes para su audiencia; gestión admin
create policy p_ann_sel on announcements for select using (
  fn_is_admin() or (
    deleted_at is null and publish_at <= now() and (expires_at is null or expires_at > now())
    and (
      audience = 'all'
      or (audience = 'cycle' and exists (select 1 from enrollments e where e.user_id=auth.uid() and e.cycle_id=announcements.cycle_id and e.status not in ('withdrawn','cancelled')))
      or (audience = 'ministry' and exists (select 1 from ministry_assignments m where m.user_id=auth.uid() and m.ministry_id=announcements.ministry_id and m.status in ('assigned','active')))
      or (audience = 'role' and announcements.role = fn_role())
      or (audience = 'certified' and exists (select 1 from certificates c where c.user_id=auth.uid() and c.status in ('issued','delivered','ready_for_pickup','physical_pending')))
    )));
create policy p_ann_all on announcements for all using (fn_is_admin()) with check (fn_is_admin());

-- contacto: crea cualquiera autenticado; ve el suyo; gestiona admin
create policy p_cr_ins on contact_requests for insert with check (user_id = auth.uid() or user_id is null);
create policy p_cr_sel on contact_requests for select using (user_id = auth.uid() or fn_is_admin());
create policy p_cr_upd on contact_requests for update using (fn_is_admin());

-- auditoría: solo admin lee; inserta el sistema (fn_audit es definer)
create policy p_audit_sel on audit_logs for select using (fn_is_admin());

-- app_settings: lectura autenticada (branding/nombres); escritura admin (claves críticas: superadmin)
create policy p_set_sel on app_settings for select using (auth.uid() is not null);
create policy p_set_upd on app_settings for update using (
  case when key in ('certificate_auto_approve','min_age_without_guardian','allow_minors')
       then fn_role() = 'superadmin' else fn_is_admin() end);
create policy p_set_ins on app_settings for insert with check (fn_is_admin());

-- Storage: buckets (ejecutar tras crear buckets 'avatars' públicos-lectura y 'certificates' privado)
-- Ver README para políticas de storage.
