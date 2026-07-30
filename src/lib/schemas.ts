import { z } from 'zod';

export const registerSchema = z.object({
  first_name: z.string().trim().min(2, 'Nombre requerido').max(60),
  middle_name: z.string().trim().max(60).optional().or(z.literal('')),
  last_name: z.string().trim().min(2, 'Apellido requerido').max(60),
  email: z.string().trim().toLowerCase().email('Correo inválido'),
  password: z.string().min(8, 'Mínimo 8 caracteres').max(72),
  privacy_consent: z.literal(true, { errorMap: () => ({ message: 'Debes aceptar la política de privacidad' }) }),
});

export const profileSchema = z.object({
  first_name: z.string().trim().min(2).max(60),
  middle_name: z.string().trim().max(60).optional().or(z.literal('')),
  last_name: z.string().trim().min(2).max(60),
  birth_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida').optional().or(z.literal('')),
  phone: z.string().trim().max(25).optional().or(z.literal('')),
  address: z.string().trim().max(160).optional().or(z.literal('')),
  city: z.string().trim().max(80).optional().or(z.literal('')),
  state: z.string().trim().max(80).optional().or(z.literal('')),
  zip_code: z.string().trim().max(12).optional().or(z.literal('')),
  emergency_contact_name: z.string().trim().max(120).optional().or(z.literal('')),
  emergency_contact_phone: z.string().trim().max(25).optional().or(z.literal('')),
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
  role: z.enum(['participant','coordinator','admin','superadmin','pastor']).optional().or(z.literal('')),
  publish_at: z.string().optional().or(z.literal('')),
  expires_at: z.string().optional().or(z.literal('')),
  priority: z.coerce.number().int().min(0).max(10).default(0),
});

export const ministrySchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2000).optional().or(z.literal('')),
  leader_name: z.string().trim().max(120).optional().or(z.literal('')),
  leader_contact: z.string().trim().max(160).optional().or(z.literal('')),
  capacity: z.coerce.number().int().positive().optional().or(z.literal('')),
  requirements: z.string().trim().max(1000).optional().or(z.literal('')),
  status: z.enum(['active','inactive']).default('active'),
});
