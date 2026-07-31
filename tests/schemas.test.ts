import { describe, it, expect } from 'vitest';
import { registerSchema, contactSchema, cycleSchema } from '@/lib/schemas';

describe('registro', () => {
  it('exige consentimiento y contraseña de 8+', () => {
    const bad = registerSchema.safeParse({ first_name: 'Ana', last_name: 'Diaz', email: 'a@b.com', password: '1234567', privacy_consent: true });
    expect(bad.success).toBe(false);
    const noConsent = registerSchema.safeParse({ first_name: 'Ana', last_name: 'Diaz', email: 'a@b.com', password: '12345678', privacy_consent: false });
    expect(noConsent.success).toBe(false);
    const ok = registerSchema.safeParse({ first_name: 'Ana', last_name: 'Diaz', email: 'A@B.com', password: '12345678', privacy_consent: true, birth_date: '1990-05-10' });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data.email).toBe('a@b.com'); // normaliza a minúsculas
  });

  it('exige fecha de nacimiento y rechaza fechas que no existen', () => {
    const base = { first_name: 'Ana', last_name: 'Diaz', email: 'a@b.com', password: '12345678', privacy_consent: true };
    expect(registerSchema.safeParse(base).success).toBe(false);                              // sin fecha
    expect(registerSchema.safeParse({ ...base, birth_date: '1990-02-31' }).success).toBe(false); // 31 de febrero
    expect(registerSchema.safeParse({ ...base, birth_date: '10-05-1990' }).success).toBe(false); // formato al revés
    expect(registerSchema.safeParse({ ...base, birth_date: '1990-05-10' }).success).toBe(true);
  });
});

describe('contacto', () => {
  it('rechaza mensajes cortos y categorías inválidas', () => {
    expect(contactSchema.safeParse({ name: 'A', email: 'x', category: 'general', message: 'hola' }).success).toBe(false);
    expect(contactSchema.safeParse({ name: 'Ana', email: 'a@b.com', category: 'hack', message: 'mensaje suficientemente largo' }).success).toBe(false);
    expect(contactSchema.safeParse({ name: 'Ana', email: 'a@b.com', category: 'curso', message: 'mensaje suficientemente largo' }).success).toBe(true);
  });
});

describe('ciclo', () => {
  it('valida coordenadas y radio', () => {
    const bad = cycleSchema.safeParse({ name: 'Ciclo X', status: 'draft', latitude: '200', allowed_radius_meters: '100' });
    expect(bad.success).toBe(false);
    const ok = cycleSchema.safeParse({ name: 'Ciclo X', status: 'draft', latitude: '28.5', longitude: '-81.3', allowed_radius_meters: '150' });
    expect(ok.success).toBe(true);
  });
});
