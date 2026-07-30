export function fmtDate(d?: string | null): string {
  if (!d) return '—';
  const date = new Date(d.includes('T') ? d : d + 'T12:00:00');
  return date.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
export function fmtTime(t?: string | null): string {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}
export function csvEscape(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
export function toCsv(rows: Record<string, unknown>[], headers: string[]): string {
  const head = headers.map(csvEscape).join(',');
  const body = rows.map((r) => headers.map((h) => csvEscape(r[h])).join(',')).join('\n');
  return '﻿' + head + '\n' + body;
}
export const ENROLLMENT_LABEL: Record<string, string> = {
  registered: 'Registrado', enrolled: 'Inscrito', in_progress: 'En progreso',
  requirements_pending: 'Requisitos pendientes', completed: 'Completado',
  certified: 'Certificado', withdrawn: 'Retirado', cancelled: 'Cancelado',
};
export const CERT_LABEL: Record<string, string> = {
  eligible: 'Elegible', pending_approval: 'Pendiente de aprobación', issued: 'Emitido',
  physical_pending: 'Físico pendiente', ready_for_pickup: 'Listo para retirar',
  delivered: 'Entregado', revoked: 'Revocado',
};
export const MINISTRY_ASSIGN_LABEL: Record<string, string> = {
  suggested: 'Sugerido', interested: 'Interesado', pending_contact: 'Por contactar',
  contacted: 'Contactado', interview_scheduled: 'Entrevista agendada', assigned: 'Asignado',
  active: 'Activo', inactive: 'Inactivo', declined: 'Declinado',
};
export const MEMBER_REQUEST_KIND_LABEL: Record<string, string> = {
  join: 'Ingreso a ministerio', leave: 'Baja de ministerio',
  switch: 'Cambio de ministerio', role_change: 'Cambio de rol',
};
export const CYCLE_LABEL: Record<string, string> = {
  draft: 'Borrador', registration_open: 'Inscripciones abiertas', active: 'Activo',
  completed: 'Completado', cancelled: 'Cancelado', archived: 'Archivado',
};
export function calcAge(birthDate?: string | null): number | null {
  if (!birthDate) return null;
  const b = new Date(birthDate.includes('T') ? birthDate : birthDate + 'T12:00:00');
  if (Number.isNaN(b.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - b.getFullYear();
  const m = today.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < b.getDate())) age--;
  return age;
}
export const EDUCATION_LEVEL_LABEL: Record<string, string> = {
  primary: 'Primaria', secondary: 'Secundaria', university: 'Universitaria',
};
export const CHURCH_ATTENDANCE_LABEL: Record<string, string> = {
  lt_1y: 'Menos de 1 año', '1_3y': '1 a 3 años', '3_4y': '3 a 4 años', '4y_plus': '4+ años',
};
