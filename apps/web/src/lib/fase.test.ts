import { describe, expect, it } from 'vitest';
import { CALENDARIO } from './calendario';
import { enVeda, faseEn, validarCalendario, type Calendario } from './fase';

const en = (iso: string) => new Date(iso);

describe('faseEn', () => {
  it('hasta el cierre de colegios es "previa", también el día de reflexión y la votación', () => {
    expect(faseEn(en('2026-11-23T12:00:00+01:00'), CALENDARIO)).toBe('previa');
    expect(faseEn(en('2026-11-28T12:00:00+01:00'), CALENDARIO)).toBe('previa');
    expect(faseEn(en('2026-11-29T19:59:59+01:00'), CALENDARIO)).toBe('previa');
  });

  it('desde el cierre de colegios (20:00 del 29) y los días posteriores es "recuento"', () => {
    expect(faseEn(en('2026-11-29T20:00:00+01:00'), CALENDARIO)).toBe('recuento');
    expect(faseEn(en('2026-11-29T21:30:00+01:00'), CALENDARIO)).toBe('recuento');
    expect(faseEn(en('2026-12-05T10:00:00+01:00'), CALENDARIO)).toBe('recuento');
  });

  it('sin inicioAnalisis nunca pasa sola a "analisis"', () => {
    expect(faseEn(en('2027-06-01T00:00:00+02:00'), CALENDARIO)).toBe('recuento');
  });

  it('con inicioAnalisis pasa a "analisis" en ese instante', () => {
    const cal: Calendario = { ...CALENDARIO, inicioAnalisis: '2026-12-07T23:59:59+01:00' };
    expect(faseEn(en('2026-12-07T23:59:58+01:00'), cal)).toBe('recuento');
    expect(faseEn(en('2026-12-07T23:59:59+01:00'), cal)).toBe('analisis');
  });

  it('interpreta bien la zona horaria: 19:00 UTC del 29 ya son las 20:00 en España', () => {
    expect(faseEn(en('2026-11-29T18:59:59Z'), CALENDARIO)).toBe('previa');
    expect(faseEn(en('2026-11-29T19:00:00Z'), CALENDARIO)).toBe('recuento');
  });
});

describe('enVeda (encuestas prohibidas 5 días antes de la votación)', () => {
  it('empieza el martes 24 a las 00:00 y no antes', () => {
    expect(enVeda(en('2026-11-23T23:59:59+01:00'), CALENDARIO)).toBe(false);
    expect(enVeda(en('2026-11-24T00:00:00+01:00'), CALENDARIO)).toBe(true);
  });

  it('dura hasta el cierre de colegios del 29 (las 20:00 ya no es veda)', () => {
    expect(enVeda(en('2026-11-28T12:00:00+01:00'), CALENDARIO)).toBe(true);
    expect(enVeda(en('2026-11-29T19:59:59+01:00'), CALENDARIO)).toBe(true);
    expect(enVeda(en('2026-11-29T20:00:00+01:00'), CALENDARIO)).toBe(false);
  });
});

describe('validarCalendario', () => {
  it('el calendario real es válido', () => {
    expect(() => validarCalendario(CALENDARIO)).not.toThrow();
  });

  it('rechaza fechas ilegibles o incoherentes', () => {
    expect(() => validarCalendario({ ...CALENDARIO, inicioRecuento: 'mañana' })).toThrow(/inválida/);
    expect(() =>
      validarCalendario({ ...CALENDARIO, vedaEncuestas: { desde: '2026-11-29T20:00:00+01:00', hasta: '2026-11-24T00:00:00+01:00' } }),
    ).toThrow(/veda/);
    expect(() => validarCalendario({ ...CALENDARIO, inicioAnalisis: '2026-11-29T10:00:00+01:00' })).toThrow(/análisis/);
  });
});
