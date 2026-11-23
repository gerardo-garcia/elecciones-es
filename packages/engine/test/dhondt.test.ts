import { describe, expect, it } from 'vitest';
import { ErrorDatos, repartirDHondt, superaBarrera } from '../src';
import { crearAzar, entero } from './helpers';

describe('repartirDHondt', () => {
  it('reproduce el ejemplo clásico de 7 escaños', () => {
    const r = repartirDHondt(
      [
        { id: 'A', votos: 340_000 },
        { id: 'B', votos: 280_000 },
        { id: 'C', votos: 160_000 },
        { id: 'D', votos: 60_000 },
        { id: 'E', votos: 15_000 },
      ],
      7,
    );
    expect(r.escanos).toEqual({ A: 3, B: 3, C: 1, D: 0, E: 0 });
    expect(r.adjudicados).toBe(7);
    expect(r.empateSorteo).toBe(false);
  });

  it('adjudica siempre exactamente los escaños pedidos', () => {
    const azar = crearAzar(1);
    for (let i = 0; i < 200; i++) {
      const n = entero(azar, 1, 40);
      const entradas = Array.from({ length: entero(azar, 2, 9) }, (_, k) => ({
        id: `P${k}`,
        votos: entero(azar, 1_000, 900_000),
      }));
      const r = repartirDHondt(entradas, n);
      const total = Object.values(r.escanos).reduce((a, b) => a + b, 0);
      expect(total).toBe(n);
    }
  });

  it('ante cocientes iguales, el escaño es para quien tiene más votos', () => {
    // A2 = 100/2 = 50 = B1 = 50: gana A, que tiene más votos.
    const r = repartirDHondt(
      [
        { id: 'A', votos: 100 },
        { id: 'B', votos: 50 },
      ],
      2,
    );
    expect(r.escanos).toEqual({ A: 2, B: 0 });
    expect(r.empateSorteo).toBe(false);
  });

  it('con cociente y votos idénticos en el corte avisa de que hay sorteo', () => {
    const r = repartirDHondt(
      [
        { id: 'A', votos: 100 },
        { id: 'B', votos: 100 },
      ],
      1,
    );
    expect(r.empateSorteo).toBe(true);
    // Determinista por id mientras no haya sorteo real.
    expect(r.escanos).toEqual({ A: 1, B: 0 });
  });

  it('un empate que cae dentro de los escaños adjudicados no es sorteo', () => {
    const r = repartirDHondt(
      [
        { id: 'A', votos: 100 },
        { id: 'B', votos: 100 },
      ],
      2,
    );
    expect(r.escanos).toEqual({ A: 1, B: 1 });
    expect(r.empateSorteo).toBe(false);
  });

  it('una candidatura sin votos no obtiene escaño pero consta con 0', () => {
    const r = repartirDHondt(
      [
        { id: 'A', votos: 10 },
        { id: 'B', votos: 0 },
      ],
      3,
    );
    expect(r.escanos).toEqual({ A: 3, B: 0 });
  });

  it('con 0 escaños no adjudica nada', () => {
    const r = repartirDHondt([{ id: 'A', votos: 10 }], 0);
    expect(r.escanos).toEqual({ A: 0 });
    expect(r.adjudicados).toBe(0);
  });

  it('rechaza datos inválidos', () => {
    expect(() => repartirDHondt([{ id: 'A', votos: -1 }], 3)).toThrow(ErrorDatos);
    expect(() => repartirDHondt([{ id: 'A', votos: Number.NaN }], 3)).toThrow(ErrorDatos);
    expect(() => repartirDHondt([{ id: 'A', votos: 1 }], 2.5)).toThrow(ErrorDatos);
    expect(() =>
      repartirDHondt(
        [
          { id: 'A', votos: 1 },
          { id: 'A', votos: 2 },
        ],
        2,
      ),
    ).toThrow(/duplicada/);
  });

  it('es invariante a multiplicar todos los votos por una constante (base de la extrapolación lineal)', () => {
    const azar = crearAzar(7);
    for (let i = 0; i < 300; i++) {
      const n = entero(azar, 1, 38);
      const votos = Array.from({ length: entero(azar, 2, 8) }, () => entero(azar, 50_000, 900_000));
      const base = repartirDHondt(
        votos.map((v, k) => ({ id: `P${k}`, votos: v })),
        n,
      ).escanos;
      for (const k of [2, 3, 1000 / 37, 7.25]) {
        const escalado = repartirDHondt(
          votos.map((v, j) => ({ id: `P${j}`, votos: v * k })),
          n,
        ).escanos;
        expect(escalado).toEqual(base);
      }
    }
  });
});

describe('superaBarrera (3 % de votos válidos)', () => {
  it('exige "al menos" el 3 %: el 3 % exacto entra', () => {
    expect(superaBarrera(3_000, 100_000)).toBe(true);
    expect(superaBarrera(2_999, 100_000)).toBe(false);
  });

  it('sin votos válidos nadie supera la barrera', () => {
    expect(superaBarrera(0, 0)).toBe(false);
  });

  it('admite otro porcentaje', () => {
    expect(superaBarrera(5, 100, 5)).toBe(true);
    expect(superaBarrera(4, 100, 5)).toBe(false);
  });
});
