import { describe, expect, it } from 'vitest';
import { calcularCircunscripcion, ErrorDatos, type Escrutinio } from '../src';
import { circ, escrutinioCompleto } from './helpers';

describe('calcularCircunscripcion — extrapolación lineal por % de censo', () => {
  it('sin escrutinio o con 0 de censo escrutado devuelve "sin-datos"', () => {
    const c = circ('28', 10);
    expect(calcularCircunscripcion(c, null).estado).toBe('sin-datos');

    const e: Escrutinio = { ...escrutinioCompleto('28', { A: 0, B: 0 }), censoEscrutado: 0 };
    const r = calcularCircunscripcion(c, e);
    expect(r.estado).toBe('sin-datos');
    expect(r.escanos).toEqual([]);
    expect(r.factor).toBeNull();
  });

  it('multiplica todos los votos por censo / censo escrutado', () => {
    const e: Escrutinio = {
      codigo: '28',
      censo: 1_000,
      censoEscrutado: 250,
      blancos: 10,
      candidaturas: [
        { siglas: 'A', votos: 100 },
        { siglas: 'B', votos: 50 },
      ],
    };
    const r = calcularCircunscripcion(circ('28', 5), e);
    expect(r.estado).toBe('parcial');
    expect(r.porcentajeCenso).toBe(0.25);
    expect(r.factor).toBe(4);
    expect(r.proyeccion?.candidaturas).toEqual([
      { siglas: 'A', votos: 400 },
      { siglas: 'B', votos: 200 },
    ]);
    expect(r.proyeccion?.blancos).toBe(40);
    expect(r.proyeccion?.validos).toBe(640);
  });

  it('al 100 % el factor es 1 y los votos no cambian', () => {
    const r = calcularCircunscripcion(circ('28', 5), escrutinioCompleto('28', { A: 600, B: 400 }, 20));
    expect(r.estado).toBe('completo');
    expect(r.factor).toBe(1);
    expect(r.proyeccion?.validos).toBe(1_020);
  });

  it('el reparto parcial coincide con el de los votos escrutados (invariancia a la escala)', () => {
    const votos = { A: 41_000, B: 33_000, C: 15_000, D: 7_500, E: 3_500 };
    const parcial = calcularCircunscripcion(circ('08', 8), {
      codigo: '08',
      censo: 800_000,
      censoEscrutado: 200_000,
      blancos: 1_000,
      candidaturas: Object.entries(votos).map(([siglas, v]) => ({ siglas, votos: v })),
    });
    const completo = calcularCircunscripcion(circ('08', 8), escrutinioCompleto('08', votos, 1_000));
    expect(parcial.escanos.map((e) => [e.siglas, e.escanos])).toEqual(
      completo.escanos.map((e) => [e.siglas, e.escanos]),
    );
  });
});

describe('calcularCircunscripcion — barrera del 3 %', () => {
  it('cuenta los votos en blanco en la base de votos válidos', () => {
    // Válidos = 55.001 + 40.000 + 2.999 + 2.000 blancos = 100.000 → 2.999 es el 2,999 %.
    // Sin contar los blancos sería 2.999 / 98.000 = 3,06 % y pasaría la barrera.
    const r = calcularCircunscripcion(
      circ('28', 10),
      escrutinioCompleto('28', { A: 55_001, B: 40_000, P: 2_999 }, 2_000),
    );
    expect(r.proyeccion?.validos).toBe(100_000);
    expect(r.elegibles).not.toContain('P');
  });

  it('el 3 % exacto supera la barrera', () => {
    const r = calcularCircunscripcion(
      circ('28', 10),
      escrutinioCompleto('28', { A: 55_000, B: 40_000, P: 3_000 }, 2_000),
    );
    expect(r.elegibles).toContain('P');
  });

  it('la barrera no depende del grado de escrutinio', () => {
    const e = (censoEscrutado: number): Escrutinio => ({
      codigo: '28',
      censo: 1_000_000,
      censoEscrutado,
      blancos: 20,
      candidaturas: [
        { siglas: 'A', votos: 550 },
        { siglas: 'B', votos: 400 },
        { siglas: 'P', votos: 29 },
      ],
    });
    // Mismos votos escrutados, distinto % de censo: P (2,9 %) queda fuera en ambos.
    expect(calcularCircunscripcion(circ('28', 10), e(1_000_000)).elegibles).not.toContain('P');
    expect(calcularCircunscripcion(circ('28', 10), e(100_000)).elegibles).not.toContain('P');
  });

  it('una candidatura bajo el 3 % no recibe escaño aunque su cociente lo habría ganado', () => {
    // 38 escaños: sin barrera, el 2,9 % obtendría escaño; con barrera, no.
    const votos = { A: 50_000, B: 30_000, C: 14_000, P: 2_900 };
    const r = calcularCircunscripcion(circ('28', 38), escrutinioCompleto('28', votos, 3_100));
    expect(r.escanos.find((e) => e.siglas === 'P')).toBeUndefined();
    expect(r.escanos.reduce((s, e) => s + e.escanos, 0)).toBe(38);
  });
});

describe('calcularCircunscripcion — Ceuta y Melilla', () => {
  it('gana el más votado, sin barrera', () => {
    const r = calcularCircunscripcion(
      circ('51', 1, 'mayoritaria'),
      escrutinioCompleto('51', { PP: 20_000, PSOE: 15_000, VOX: 12_000, X: 10 }, 500),
    );
    expect(r.escanos).toEqual([{ siglas: 'PP', escanos: 1, votos: 20_000 }]);
    expect(r.elegibles).toContain('X');
    expect(r.empateSorteo).toBe(false);
  });

  it('un empate a votos en cabeza se marca como sorteo', () => {
    const r = calcularCircunscripcion(
      circ('52', 1, 'mayoritaria'),
      escrutinioCompleto('52', { PP: 10_000, PSOE: 10_000 }),
    );
    expect(r.empateSorteo).toBe(true);
  });
});

describe('calcularCircunscripcion — validación', () => {
  const c = circ('28', 5);
  const base = escrutinioCompleto('28', { A: 10, B: 5 });

  it('rechaza datos incoherentes', () => {
    expect(() => calcularCircunscripcion(c, { ...base, censoEscrutado: base.censo + 1 })).toThrow(ErrorDatos);
    expect(() => calcularCircunscripcion(c, { ...base, censo: 0, censoEscrutado: 0 })).toThrow(ErrorDatos);
    expect(() => calcularCircunscripcion(c, { ...base, blancos: -1 })).toThrow(ErrorDatos);
    expect(() =>
      calcularCircunscripcion(c, { ...base, candidaturas: [{ siglas: 'A', votos: -3 }] }),
    ).toThrow(ErrorDatos);
    expect(() =>
      calcularCircunscripcion(c, {
        ...base,
        candidaturas: [
          { siglas: 'A', votos: 1 },
          { siglas: 'A', votos: 2 },
        ],
      }),
    ).toThrow(/duplicada/);
  });

  it('rechaza un escrutinio de otra circunscripción', () => {
    expect(() => calcularCircunscripcion(c, { ...base, codigo: '08' })).toThrow(ErrorDatos);
  });
});
