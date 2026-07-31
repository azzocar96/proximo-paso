import { z } from 'zod';

export const registerSchema = z.object({
  first_name: z.string().trim().min(2, 'Nombre requerido').max(60),
  middle_name: z.string().trim().max(60).optional().or(z.literal('')),
  last_name: z.string().trim().min(2, 'Apellido requerido').max(60),
  email: z.string().trim().toLowerCase().email('Correo inválido'),
  password: z.string().min(8, 'Mínimo 8 caracteres').max(72),
  privacy_consent: z.literal(true, { errorMap: () => ({ message: 'Debes aceptar la política de privacidad' }) }),
  // Fase 3d: obligatoria. Con ella la app sabe si quien se registra es menor
  // y puede pedir los datos del representante en el momento.
  // La regex sola deja pasar fechas que no existen (1990-02-31), que JS
  // "normaliza" a marzo y luego revientan al insertarse. El refine comprueba
  // el viaje de ida y vuelta: si no vuelve igual, la fecha no existe.
  birth_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Indica tu fecha de nacimiento')
    .refine((s) => {
      const d = new Date(s + 'T00:00:00Z');
      return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
    }, 'Esa fecha no existe. Revísala, por favor.'),
  guardian_name: z.string().trim().max(120).optional().or(z.literal('')),
  guardian_contact: z.string().trim().max(120).optional().or(z.literal('')),
  guardian_consent: z.boolean().optional(),
  // Fase 3f: "ya hice el curso, ya soy miembro". Es una SOLICITUD, no un
  // permiso: queda pendiente hasta que un director o el administrador la vean.
  already_member: z.boolean().optional(),
  member_note: z.string().trim().max(500, 'La nota no puede pasar de 500 caracteres').optional().or(z.literal('')),
});

export const profileSchema = z.object({
  first_name: z.string().trim().min(2).max(60),
  middle_name: z.string().trim().max(60).optional().or(z.literal('')),
  last_name: z.string().trim().min(2).max(60),
  birth_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida')
    .refine((s) => {
      const d = new Date(s + 'T00:00:00Z');
      if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) return false;
      const now = Date.now();
      // Ni futuro ni hace 120 años: la misma regla que el registro.
      return d.getTime() <= now && d.getTime() > now - 120 * 365.25 * 24 * 3600 * 1000;
    }, 'Revisa tu fecha de nacimiento.')
    .optional().or(z.literal('')),
  phone: z.string().trim().max(25).optional().or(z.literal('')),
  address: z.string().trim().max(160).optional().or(z.literal('')),
  city: z.string().trim().max(80).optional().or(z.literal('')),
  state: z.string().trim().max(80).optional().or(z.literal('')),
  zip_code: z.string().trim().max(12).optional().or(z.literal('')),
  emergency_contact_name: z.string().trim().max(120).optional().or(z.literal('')),
  emergency_contact_phone: z.string().trim().max(25).optional().or(z.literal('')),
  // Fase 3d: cada persona decide si su cumpleaños aparece en el muro.
  show_birthday: z.union([z.literal('on'), z.literal('')]).optional(),
});

export const cycleSchema = z.object({
  name: z.string().trim().min(3).max(120),
  description: z.string().trim().max(2000).optional().or(z.literal('')),
  registration_start: z.string().optional().or(z.literal('')),
  registration_end: z.string().optional().or(z.literal('')),
  capacity: z.coerce.number().int().positive().optional().or(z.literal('')),
  status: z.enum(['draft','registration_open','active','completed','cancelled','archived']),
  location_name: z.string().trim().max(160).optional().or(z.literal('')),
  full_address: z.string().trim().max(240).optional().or(z.literal('')),
  latitude: z.coerce.number().min(-90).max(90).optional().or(z.literal('')),
  longitude: z.coerce.number().min(-180).max(180).optional().or(z.literal('')),
  allowed_radius_meters: z.coerce.number().int().min(10).max(5000).default(100),
  certificate_delivery_date: z.string().optional().or(z.literal('')),
});

export const sessionSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2000).optional().or(z.literal('')),
  session_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
  start_time: z.string().optional().or(z.literal('')),
  end_time: z.string().optional().or(z.literal('')),
  location_name: z.string().trim().max(160).optional().or(z.literal('')),
  latitude: z.coerce.number().min(-90).max(90).optional().or(z.literal('')),
  longitude: z.coerce.number().min(-180).max(180).optional().or(z.literal('')),
  allowed_radius_meters: z.coerce.number().int().min(10).max(5000).optional().or(z.literal('')),
  min_accuracy_meters: z.coerce.number().int().min(10).max(1000).optional().or(z.literal('')),
});

export const contactSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email(),
  category: z.enum(['general','curso','asistencia','certificado','ministerio','otro']),
  message: z.string().trim().min(10, 'Cuéntanos un poco más').max(3000),
});

export const announcementSchema = z.object({
  title: z.string().trim().min(3).max(160),
  content: z.string().trim().min(3).max(8000),
  audience: z.enum(['all','cycle','ministry','role','certified']),
  cycle_id: z.string().uuid().optional().or(z.literal('')),
  ministry_id: z.string().uuid().optional().or(z.literal('')),
  // 'admin' quedó inerte (Fase 3a): un anuncio dirigido a ese rol no lo vería nadie
  role: z.enum(['participant','coordinator','superadmin','pastor']).optional().or(z.literal('')),
  publish_at: z.string().optional().or(z.literal('')),
  expires_at: z.string().optional().or(z.literal('')),
  priority: z.coerce.number().int().min(0).max(10).default(0),
});

export const ministrySchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1000, 'La descripción no puede pasar de 1000 caracteres').optional().or(z.literal('')),
  leader_name: z.string().trim().max(160).optional().or(z.literal('')),
  leader_contact: z.string().trim().max(160).optional().or(z.literal('')),
  capacity: z.coerce.number().int().positive().optional().or(z.literal('')),
  requirements: z.string().trim().max(500, 'Los requisitos no pueden pasar de 500 caracteres').optional().or(z.literal('')),
  status: z.enum(['active','inactive']).default('active'),
  // Fase 3e: los mismos campos que maneja el director desde Mi ministerio,
  // para que el administrador vea y arregle exactamente lo mismo.
  meeting_info: z.string().trim().max(300).optional().or(z.literal('')),
  reference_name: z.string().trim().max(160).optional().or(z.literal('')),
  reference_contact: z.string().trim().max(160).optional().or(z.literal('')),
  show_contact: z.union([z.literal('on'), z.literal('')]).optional(),
});
