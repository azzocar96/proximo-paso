import { describe, it, expect } from 'vitest';
import { csvEscape, toCsv, fmtTime } from '@/lib/utils';

describe('csv', () => {
  it('escapa comas, comillas y saltos', () => {
    expect(csvEscape('hola')).toBe('hola');
    expect(csvEscape('a,b')).toBe('"a,b"');
    expect(csvEscape('di "hola"')).toBe('"di ""hola"""');
    expect(csvEscape(null)).toBe('');
  });
  it('genera CSV con BOM y encabezados', () => {
    const csv = toCsv([{ a: 1, b: 'x,y' }], ['a', 'b']);
    expect(csv).toContain('a,b');
    expect(csv).toContain('1,"x,y"');
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });
});

describe('fmtTime', () => {
  it('convierte a 12h', () => {
    expect(fmtTime('10:00')).toBe('10:00 AM');
    expect(fmtTime('13:30')).toBe('1:30 PM');
    expect(fmtTime('00:05')).toBe('12:05 AM');
  });
});
