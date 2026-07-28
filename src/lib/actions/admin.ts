'use server';
import { createClient } from '@/lib/supabase/server';
import { cycleSchema, sessionSchema, announcementSchema, ministrySchema } from '@/lib/schemas';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { FormState } from '@/lib/actions/auth';

async function requireStaffAction() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Sesión no válida');
  const { data: role } = await supabase.rpc('fn_role');
  if (!['coordinator', 'admin', 'superadmin'].includes(role as string)) throw new Error('No autorizado');
  return { supabase, user, role: role as string };
}
async function requireAdminAction() {
  const ctx = await requireStaffAction();
  if (!['admin', 'superadmin'].includes(ctx.role)) throw new Error('No autorizado');
  return ctx;
}

// ---------- ciclos ----------
export async function saveCycle(cycleId: string | null, _prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const { supabase } = await requireAdminAction();
    const parsed = cycleSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { error: parsed.error.errors[0].message };
    const d = parsed.data;
    const row = {
      name: d.name, description: d.description || null,
      registration_start: d.registration_start || null, registration_end: d.registration_end || null,
      capacity: d.capacity === '' ? null : d.capacity, status: d.status,
      location_name: d.location_name || null, full_address: d.full_address || null,
      latitude: d.latitude === '' ? null : d.latitude, longitude: d.longitude === '' ? null : d.longitude,
      allowed_radius_meters: d.allowed_radius_meters,
      certificate_delivery_date: d.certificate_delivery_date || null,
    };
    if (cycleId) {
      const { error } = await supabase.from('course_cycles').update(row).eq('id', cycleId);
      if (error) return { error: 'No pudimos guardar el ciclo.' };
      await supabase.rpc('fn_audit', { p_action: 'update_cycle', p_entity: 'course_cycles', p_id: cycleId, p_reason: null, p_details: null });
    } else {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase.from('course_cycles').insert({ ...row, created_by: user!.id }).select('id').single();
      if (error) return { error: 'No pudimos crear el ciclo.' };
      // crear las 4 sesiones vacías
      for (let i = 1; i <= 4; i++) {
        await supabase.from('course_sessions').insert({ cycle_id: data.id, step_number: i, name: `Paso ${i}` });
      }
      revalidatePath('/admin/ciclos');
      redirect(`/admin/ciclos/${data.id}`);
    }
    revalidatePath('/admin/ciclos');
    return { success: 'Ciclo guardado.' };
  } catch (e) {
    if ((e as any)?.digest?.startsWith?.('NEXT_REDIRECT')) throw e;
    return { error: (e as Error).message };
  }
}

export async function deleteCycle(cycleId: string, reason: string): Promise<FormState> {
  try {
    const { supabase } = await requireAdminAction();
    if (!reason || reason.trim().length < 5) return { error: 'Indica un motivo (mínimo 5 caracteres).' };
    const { error } = await supabase.from('course_cycles').update({ deleted_at: new Date().toISOString(), status: 'archived' }).eq('id', cycleId);
    if (error) return { error: 'No pudimos archivar el ciclo.' };
    await supabase.rpc('fn_audit', { p_action: 'archive_cycle', p_entity: 'course_cycles', p_id: cycleId, p_reason: reason, p_details: null });
    revalidatePath('/admin/ciclos');
    return { success: 'Ciclo archivado.' };
  } catch (e) { return { error: (e as Error).message }; }
}

export async function saveSession(sessionId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const { supabase } = await requireStaffAction();
    const parsed = sessionSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { error: parsed.error.errors[0].message };
    const d = parsed.data;
    const { error } = await supabase.from('course_sessions').update({
      name: d.name, description: d.description || null,
      session_date: d.session_date || null, start_time: d.start_time || null, end_time: d.end_time || null,
      location_name: d.location_name || null,
      latitude: d.latitude === '' ? null : d.latitude, longitude: d.longitude === '' ? null : d.longitude,
      allowed_radius_meters: d.allowed_radius_meters === '' ? null : d.allowed_radius_meters,
      min_accuracy_meters: d.min_accuracy_meters === '' ? 100 : d.min_accuracy_meters,
    }).eq('id', sessionId);
    if (error) return { error: 'No pudimos guardar la sesión.' };
    revalidatePath('/admin/ciclos');
    return { success: 'Sesión guardada.' };
  } catch (e) { return { error: (e as Error).message }; }
}

export async function assignCoordinator(cycleId: string, email: string): Promise<FormState> {
  try {
    const { supabase } = await requireAdminAction();
    const { data: prof } = await supabase.from('profiles').select('id').eq('email', email.trim().toLowerCase()).maybeSingle();
    if (!prof) return { error: 'No existe un usuario con ese correo.' };
    const { error } = await supabase.from('cycle_coordinators').insert({ cycle_id: cycleId, user_id: prof.id });
    if (error) return { error: error.code === '23505' ? 'Ya es coordinador de este ciclo.' : 'No pudimos asignarlo.' };
    await supabase.rpc('fn_audit', { p_action: 'assign_coordinator', p_entity: 'course_cycles', p_id: cycleId, p_reason: null, p_details: { email } });
    revalidatePath(`/admin/ciclos/${cycleId}`);
    return { success: 'Coordinador asignado.' };
  } catch (e) { return { error: (e as Error).message }; }
}

// ---------- asistencia ----------
export async function openAttendance(sessionId: string, ttlMinutes: number): Promise<{ error?: string; token?: string; expires_at?: string }> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('open_attendance', { p_session: sessionId, p_ttl_minutes: ttlMinutes });
  if (error) return { error: error.message };
  const row = Array.isArray(data) ? data[0] : data;
  revalidatePath('/admin');
  return { token: row.token, expires_at: row.expires_at };
}
export async function closeAttendance(sessionId: string): Promise<FormState> {
  const supabase = createClient();
  const { error } = await supabase.rpc('close_attendance', { p_session: sessionId });
  if (error) return { error: error.message };
  revalidatePath('/admin');
  return { success: 'Asistencia cerrada.' };
}
export async function manualAttendance(sessionId: string, userId: string, reason: string, method: string): Promise<FormState> {
  const supabase = createClient();
  const { error } = await supabase.rpc('manual_attendance', { p_session: sessionId, p_user: userId, p_reason: reason, p_method: method });
  if (error) return { error: error.message };
  revalidatePath('/admin/asistencia');
  return { success: 'Asistencia registrada.' };
}
export async function removeAttendance(sessionId: string, userId: string, reason: string): Promise<FormState> {
  const supabase = createClient();
  const { error } = await supabase.rpc('remove_attendance', { p_session: sessionId, p_user: userId, p_reason: reason });
  if (error) return { error: error.message };
  revalidatePath('/admin/asistencia');
  return { success: 'Asistencia eliminada.' };
}
export async function approveAttendanceRequest(id: string, note?: string): Promise<FormState> {
  const supabase = createClient();
  const { error } = await supabase.rpc('approve_attendance_request', { p_id: id, p_note: note || null });
  if (error) return { error: error.message };
  revalidatePath('/admin/asistencia');
  return { success: 'Asistencia aprobada.' };
}
export async function rejectAttendanceRequest(id: string, reason: string): Promise<FormState> {
  const supabase = createClient();
  const { error } = await supabase.rpc('reject_attendance_request', { p_id: id, p_reason: reason });
  if (error) return { error: error.message };
  revalidatePath('/admin/asistencia');
  return { success: 'Solicitud rechazada.' };
}
export async function overrideRequirement(enrollmentId: string, kind: 'test' | 'dream_team', reason: string): Promise<FormState> {
  const supabase = createClient();
  const { error } = await supabase.rpc('admin_override_requirement', { p_enrollment: enrollmentId, p_kind: kind, p_reason: reason });
  if (error) return { error: error.message };
  revalidatePath('/admin');
  return { success: 'Excepción registrada (quedó en auditoría).' };
}

// ---------- usuarios / roles ----------
export async function setRole(userId: string, role: string): Promise<FormState> {
  const supabase = createClient();
  const { error } = await supabase.rpc('set_user_role', { p_user: userId, p_role: role });
  if (error) return { error: error.message };
  revalidatePath('/admin/usuarios');
  return { success: 'Rol actualizado.' };
}
export async function setAccountStatus(userId: string, status: 'active' | 'suspended'): Promise<FormState> {
  try {
    const { supabase } = await requireAdminAction();
    const { error } = await supabase.from('profiles').update({ account_status: status }).eq('id', userId);
    if (error) return { error: 'No pudimos actualizar la cuenta.' };
    await supabase.rpc('fn_audit', { p_action: 'set_account_status', p_entity: 'profiles', p_id: userId, p_reason: null, p_details: { status } });
    revalidatePath('/admin/usuarios');
    return { success: 'Cuenta actualizada.' };
  } catch (e) { return { error: (e as Error).message }; }
}

// ---------- certificados ----------
export async function approveCertificate(certId: string): Promise<FormState> {
  const supabase = createClient();
  const { error } = await supabase.rpc('approve_certificate', { p_cert: certId });
  if (error) return { error: error.message };
  revalidatePath('/admin/certificados');
  return { success: 'Certificado aprobado y emitido.' };
}
export async function revokeCertificate(certId: string, reason: string): Promise<FormState> {
  const supabase = createClient();
  const { error } = await supabase.rpc('revoke_certificate', { p_cert: certId, p_reason: reason });
  if (error) return { error: error.message };
  revalidatePath('/admin/certificados');
  return { success: 'Certificado revocado.' };
}
export async function setCertificateStatus(certId: string, status: string): Promise<FormState> {
  try {
    const { supabase } = await requireAdminAction();
    if (!['physical_pending', 'ready_for_pickup', 'delivered'].includes(status)) return { error: 'Estado no permitido.' };
    const { error } = await supabase.from('certificates').update({ status }).eq('id', certId).in('status', ['issued', 'physical_pending', 'ready_for_pickup']);
    if (error) return { error: 'No pudimos actualizar el estado.' };
    revalidatePath('/admin/certificados');
    return { success: 'Estado actualizado.' };
  } catch (e) { return { error: (e as Error).message }; }
}

// ---------- ministerios ----------
export async function saveMinistry(ministryId: string | null, _prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const { supabase } = await requireAdminAction();
    const parsed = ministrySchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { error: parsed.error.errors[0].message };
    const d = parsed.data;
    const row = {
      name: d.name, description: d.description || null, leader_name: d.leader_name || null,
      leader_contact: d.leader_contact || null, capacity: d.capacity === '' ? null : d.capacity,
      requirements: d.requirements || null, status: d.status,
    };
    const q = ministryId
      ? supabase.from('ministries').update(row).eq('id', ministryId)
      : supabase.from('ministries').insert(row);
    const { error } = await q;
    if (error) return { error: 'No pudimos guardar el ministerio.' };
    revalidatePath('/admin/ministerios');
    return { success: 'Ministerio guardado.' };
  } catch (e) { return { error: (e as Error).message }; }
}
// ---------- líderes de ministerio (solo superadmin; lo valida la RPC) ----------
export async function assignMinistryLeader(ministryId: string, email: string): Promise<FormState> {
  const supabase = createClient();
  const { data: prof } = await supabase.from('profiles').select('id').eq('email', email.trim().toLowerCase()).maybeSingle();
  if (!prof) return { error: 'No existe un usuario con ese correo.' };
  const { error } = await supabase.rpc('assign_ministry_leader', { p_user: prof.id, p_ministry: ministryId });
  if (error) return { error: error.message };
  revalidatePath('/admin/ministerios');
  return { success: 'Líder de ministerio asignado.' };
}
export async function removeMinistryLeader(ministryId: string, userId: string): Promise<FormState> {
  const supabase = createClient();
  const { error } = await supabase.rpc('remove_ministry_leader', { p_user: userId, p_ministry: ministryId });
  if (error) return { error: error.message };
  revalidatePath('/admin/ministerios');
  return { success: 'Líder de ministerio removido.' };
}

export async function setAssignmentStatus(assignmentId: string, status: string, notes?: string): Promise<FormState> {
  try {
    const { supabase } = await requireAdminAction();
    const { error } = await supabase.from('ministry_assignments').update({ status, ...(notes !== undefined ? { notes } : {}) }).eq('id', assignmentId);
    if (error) return { error: 'No pudimos actualizar la asignación.' };
    revalidatePath('/admin/ministerios');
    return { success: 'Asignación actualizada.' };
  } catch (e) { return { error: (e as Error).message }; }
}
export async function suggestAssignment(ministryId: string, userId: string): Promise<FormState> {
  try {
    const { supabase, user } = await requireAdminAction();
    const { error } = await supabase.from('ministry_assignments')
      .insert({ ministry_id: ministryId, user_id: userId, status: 'suggested', assigned_by: user.id });
    if (error) return { error: error.code === '23505' ? 'Ya existe una asignación con ese ministerio.' : 'No pudimos crearla.' };
    revalidatePath('/admin');
    return { success: 'Sugerencia creada.' };
  } catch (e) { return { error: (e as Error).message }; }
}

// ---------- anuncios ----------
export async function saveAnnouncement(annId: string | null, _prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const { supabase, user } = await requireAdminAction();
    const parsed = announcementSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { error: parsed.error.errors[0].message };
    const d = parsed.data;
    const row = {
      title: d.title, content: d.content, audience: d.audience,
      cycle_id: d.audience === 'cycle' && d.cycle_id ? d.cycle_id : null,
      ministry_id: d.audience === 'ministry' && d.ministry_id ? d.ministry_id : null,
      role: d.audience === 'role' && d.role ? d.role : null,
      publish_at: d.publish_at || new Date().toISOString(),
      expires_at: d.expires_at || null, priority: d.priority,
    };
    const q = annId
      ? supabase.from('announcements').update(row).eq('id', annId)
      : supabase.from('announcements').insert({ ...row, author_id: user.id });
    const { error } = await q;
    if (error) return { error: 'No pudimos guardar el anuncio.' };
    revalidatePath('/admin/anuncios'); revalidatePath('/anuncios');
    return { success: 'Anuncio guardado.' };
  } catch (e) { return { error: (e as Error).message }; }
}
export async function deleteAnnouncement(annId: string): Promise<FormState> {
  try {
    const { supabase } = await requireAdminAction();
    const { error } = await supabase.from('announcements').update({ deleted_at: new Date().toISOString() }).eq('id', annId);
    if (error) return { error: 'No pudimos eliminar el anuncio.' };
    revalidatePath('/admin/anuncios');
    return { success: 'Anuncio eliminado.' };
  } catch (e) { return { error: (e as Error).message }; }
}

// ---------- contacto ----------
export async function setContactStatus(id: string, status: string): Promise<FormState> {
  try {
    const { supabase, user } = await requireAdminAction();
    const { error } = await supabase.from('contact_requests').update({ status, handled_by: user.id }).eq('id', id);
    if (error) return { error: 'No pudimos actualizar el mensaje.' };
    revalidatePath('/admin/contacto');
    return { success: 'Actualizado.' };
  } catch (e) { return { error: (e as Error).message }; }
}

// ---------- configuración ----------
export async function saveSetting(key: string, value: unknown): Promise<FormState> {
  try {
    const { supabase } = await requireAdminAction();
    const { error } = await supabase.from('app_settings').update({ value: JSON.parse(JSON.stringify(value)), updated_at: new Date().toISOString() }).eq('key', key);
    if (error) return { error: `No pudimos guardar "${key}" (¿permisos?).` };
    await supabase.rpc('fn_audit', { p_action: 'update_setting', p_entity: 'app_settings', p_id: null, p_reason: null, p_details: { key } });
    revalidatePath('/admin/configuracion');
    return { success: 'Configuración guardada.' };
  } catch (e) { return { error: (e as Error).message }; }
}

// ---------- evaluaciones (gestión básica) ----------
export async function createAssessment(title: string, description: string): Promise<FormState> {
  try {
    const { supabase, user } = await requireAdminAction();
    const { error } = await supabase.from('assessments').insert({ title: title.trim(), description: description.trim() || null, created_by: user.id });
    if (error) return { error: 'No pudimos crear la evaluación.' };
    revalidatePath('/admin/evaluaciones');
    return { success: 'Evaluación creada.' };
  } catch (e) { return { error: (e as Error).message }; }
}
export async function toggleAssessment(id: string, active: boolean): Promise<FormState> {
  try {
    const { supabase } = await requireAdminAction();
    const { error } = await supabase.from('assessments').update({ is_active: active }).eq('id', id);
    if (error) return { error: 'No pudimos actualizar.' };
    revalidatePath('/admin/evaluaciones');
    return { success: active ? 'Evaluación activada.' : 'Evaluación desactivada.' };
  } catch (e) { return { error: (e as Error).message }; }
}
export async function addSection(assessmentId: string, title: string, position: number): Promise<FormState> {
  try {
    const { supabase } = await requireAdminAction();
    const { error } = await supabase.from('assessment_sections').insert({ assessment_id: assessmentId, title: title.trim(), position });
    if (error) return { error: 'No pudimos crear la sección.' };
    revalidatePath('/admin/evaluaciones');
    return { success: 'Sección creada.' };
  } catch (e) { return { error: (e as Error).message }; }
}
export async function addQuestion(sectionId: string, payload: {
  question_type: string; text: string; required: boolean; position: number;
  scale_min?: number; scale_max?: number;
  options?: { text: string; score: number; dimension?: string }[];
}): Promise<FormState> {
  try {
    const { supabase } = await requireAdminAction();
    const { data: q, error } = await supabase.from('assessment_questions').insert({
      section_id: sectionId, question_type: payload.question_type, text: payload.text.trim(),
      required: payload.required, position: payload.position,
      scale_min: payload.scale_min ?? null, scale_max: payload.scale_max ?? null,
    }).select('id').single();
    if (error || !q) return { error: 'No pudimos crear la pregunta.' };
    for (const [i, o] of (payload.options ?? []).entries()) {
      await supabase.from('assessment_options').insert({
        question_id: q.id, text: o.text, score: o.score, dimension: o.dimension || null, position: i + 1 });
    }
    revalidatePath('/admin/evaluaciones');
    return { success: 'Pregunta agregada.' };
  } catch (e) { return { error: (e as Error).message }; }
}
export async function toggleDreamTeamQuestion(id: string, active: boolean): Promise<FormState> {
  try {
    const { supabase } = await requireAdminAction();
    const { error } = await supabase.from('dream_team_questions').update({ is_active: active }).eq('id', id);
    if (error) return { error: 'No pudimos actualizar.' };
    revalidatePath('/admin/dream-team');
    return { success: 'Actualizado.' };
  } catch (e) { return { error: (e as Error).message }; }
}
export async function addDreamTeamQuestion(text: string, type: string, optionsCsv: string, required: boolean): Promise<FormState> {
  try {
    const { supabase } = await requireAdminAction();
    const options = optionsCsv.trim() ? optionsCsv.split(',').map((s) => s.trim()).filter(Boolean) : null;
    const { error } = await supabase.from('dream_team_questions').insert({
      question_type: type, text: text.trim(), options: options ? JSON.parse(JSON.stringify(options)) : null,
      required, position: 99 });
    if (error) return { error: 'No pudimos crear la pregunta.' };
    revalidatePath('/admin/dream-team');
    return { success: 'Pregunta creada.' };
  } catch (e) { return { error: (e as Error).message }; }
}
