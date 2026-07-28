import { describe, it, expect } from 'vitest';

// Réplica exacta de fn_haversine (002_functions.sql) para validar la fórmula usada en servidor.
function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  return 6371000 * 2 * Math.asin(Math.sqrt(
    Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2));
}

describe('haversine', () => {
  it('distancia cero en el mismo punto', () => {
    expect(haversine(28.5383, -81.3792, 28.5383, -81.3792)).toBe(0);
  });
  it('~111 km por grado de latitud', () => {
    const d = haversine(28, -81, 29, -81);
    expect(d).toBeGreaterThan(110000);
    expect(d).toBeLessThan(112000);
  });
  it('detecta dentro/fuera de un radio de 150 m', () => {
    // ~100 m al norte (0.0009 grados)
    const cerca = haversine(28.5383, -81.3792, 28.5392, -81.3792);
    expect(cerca).toBeLessThan(150);
    // ~300 m
    const lejos = haversine(28.5383, -81.3792, 28.541, -81.3792);
    expect(lejos).toBeGreaterThan(150);
  });
});
