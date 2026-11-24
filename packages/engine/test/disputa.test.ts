import { describe, expect, it } from 'vitest';
import {
  calcularCircunscripcion,
  disputaCircunscripcion,
  disputaPorEscano,
  disputaPorUmbral,
  ErrorDatos,
  porcentajeCensoNacional,
  repartirDHondt,
  tablaDisputa,
  type Escrutinio,
  type ResultadoCircunscripcion,
} from '../src';
import { circ, crearAzar, entero, escrutinioCompleto } from './helpers';

describe('disputaPorEscano', () => {
  it('ejemplo a mano: A=1000 (2 escaños) frente a B=900 (1 escaño), 3 escaños', () => {
    const r = calcularCircunscripcion(circ('99', 3), escrutinioCompleto('99', { A: 1_000, B: 900 }));
    expect(r.escanos.map((e) => [e.siglas, e.escanos])).toEqual([
      ['A', 2],
      ['B', 1],
    ]);

    const f = disputaPorEscano(r);
    expect(f).toMatchObject({ tipo: 'escano', actual: 'A', aspirante: 'B', votosAMover: 50 });
    // 50 votos sobre 1.900 válidos.
    expect(f?.porcentajeVotosAMover).toBeCloseTo(50 / 1_900, 12);
    // Tras mover 50 votos hay empate de cocientes: 950/2 = 950/2.
    const empate = repartirDHondt(
      [
        { id: 'A', votos: 950 },
        { id: 'B', votos: 950 },
      ],
      3,
    );
    expect(empate.clasificacion[2]?.valor).toBe(475);
    expect(empate.clasificacion[3]?.valor).toBe(475);
  });

  it('Ceuta y Melilla: (vA − vB) / 2 votos deben cambiar de bando', () => {
    const r = calcularCircunscripcion(
      circ('51', 1, 'mayoritaria'),
      escrutinioCompleto('51', { PP: 20_000, PSOE: 15_000, VOX: 12_000 }, 500),
    );
    const f = disputaPorEscano(r);
    expect(f).toMatchObject({ actual: 'PP', aspirante: 'PSOE', votosAMover: 2_500 });
    expect(f?.porcentajeVotosAMover).toBeCloseTo(2_500 / 47_500, 12);
  });

  it('no depende del factor de extrapolación: mismo % con 25 % que con 100 % del censo', () => {
    const votos = { A: 41_000, B: 33_000, C: 15_000, D: 7_500 };
    const completo = calcularCircunscripcion(circ('08', 8), escrutinioCompleto('08', votos, 1_000));
    const parcial = calcularCircunscripcion(circ('08', 8), {
      codigo: '08',
      censo: 400_000,
      censoEscrutado: 100_000,
      blancos: 1_000,
      candidaturas: Object.entries(votos).map(([siglas, v]) => ({ siglas, votos: v })),
    });
    expect(disputaPorEscano(parcial)?.porcentajeVotosAMover).toBeCloseTo(
      disputaPorEscano(completo)?.porcentajeVotosAMover ?? Number.NaN,
      12,
    );
    expect(disputaPorEscano(parcial)?.porcentajeCenso).toBe(0.25);
  });

  it('coincide con una búsqueda por fuerza bruta moviendo votos de uno en uno', () => {
    const azar = crearAzar(99);
    let comprobados = 0;
    for (let caso = 0; caso < 150; caso++) {
      const n = entero(azar, 3, 12);
      const k = entero(azar, 4, 8);
      // Pesos entre 3 y 5 → cada candidatura pasa del 7 % y la barrera nunca interviene.
      const pesos = Array.from({ length: k }, () => 3 + azar() * 2);
      const suma = pesos.reduce((a, b) => a + b, 0);
      const votos: Record<string, number> = {};
      // Escala pequeña (≈3.000 votos) para que mover votos de uno en uno sea barato.
      pesos.forEach((p, i) => {
        votos[`P${i}`] = Math.round((p / suma) * 3_000);
      });
      const blancos = 30;

      const r = calcularCircunscripcion(circ('99', n), escrutinioCompleto('99', votos, blancos));
      const f = disputaPorEscano(r);
      if (!f || !f.actual) continue;

      const entradas = (movidos: number) =>
        Object.entries(votos).map(([id, v]) => ({
          id,
          votos: id === f.actual ? v - movidos : id === f.aspirante ? v + movidos : v,
        }));
      const original = repartirDHondt(entradas(0), n).escanos;

      let minimo = -1;
      for (let m = 0; m <= (votos[f.actual] ?? 0); m++) {
        const e = repartirDHondt(entradas(m), n).escanos;
        if (e[f.aspirante] === (original[f.aspirante] ?? 0) + 1 && e[f.actual] === (original[f.actual] ?? 0) - 1) {
          minimo = m;
          break;
        }
        // Antes de ese momento el reparto no debe haber cambiado de ninguna otra forma.
        expect(e).toEqual(original);
      }

      expect(minimo).toBeGreaterThanOrEqual(0);
      if (Number.isInteger(f.votosAMover)) {
        // Empate exacto de cocientes: el desempate puede dar el escaño en x o en x + 1.
        expect([f.votosAMover, f.votosAMover + 1]).toContain(minimo);
      } else {
        expect(minimo).toBe(Math.ceil(f.votosAMover));
      }
      comprobados++;
    }
    expect(comprobados).toBeGreaterThan(100);
  }, 30_000);

  it('no hay disputa sin aspirante (una sola candidatura) ni sin datos', () => {
    const una = calcularCircunscripcion(circ('99', 3), escrutinioCompleto('99', { A: 1_000 }));
    expect(disputaPorEscano(una)).toBeNull();
    expect(disputaCircunscripcion(calcularCircunscripcion(circ('99', 3), null))).toBeNull();
  });
});

describe('disputaPorUmbral', () => {
  // 38 escaños: con el 3 % exacto, P tendría escaño.
  const votos = { A: 50_000, B: 30_000, C: 14_000, P: 2_900 };

  it('detecta la candidatura bajo el 3 % que con la barrera tendría escaño', () => {
    const r = calcularCircunscripcion(circ('28', 38), escrutinioCompleto('28', votos, 3_100));
    const f = disputaPorUmbral(r);
    expect(f).toMatchObject({ tipo: 'umbral', aspirante: 'P' });
    // Le faltan 100 votos (el 0,1 % de 100.000 válidos).
    expect(f?.votosAMover).toBeCloseTo(100, 6);
    expect(f?.porcentajeVotosAMover).toBeCloseTo(0.001, 9);
    expect(f?.actual === null || typeof f?.actual === 'string').toBe(true);
  });

  it('ignora a quien, aun llegando al 3 %, no obtendría escaño', () => {
    // 10 escaños: el cociente de P al 3 % queda por debajo del último escaño.
    const r = calcularCircunscripcion(circ('99', 10), escrutinioCompleto('99', votos, 3_100));
    expect(disputaPorUmbral(r)).toBeNull();
  });

  it('no aplica en Ceuta y Melilla', () => {
    const r = calcularCircunscripcion(
      circ('51', 1, 'mayoritaria'),
      escrutinioCompleto('51', { PP: 20_000, X: 100 }),
    );
    expect(disputaPorUmbral(r)).toBeNull();
  });
});

describe('tablaDisputa', () => {
  it('devuelve las n circunscripciones con menos % de votos a mover, de menor a mayor', () => {
    const azar = crearAzar(3);
    const resultados: ResultadoCircunscripcion[] = Array.from({ length: 30 }, (_, i) => {
      const codigo = String(i + 1).padStart(2, '0');
      return calcularCircunscripcion(
        circ(codigo, entero(azar, 3, 12)),
        escrutinioCompleto(codigo, {
          A: entero(azar, 100_000, 300_000),
          B: entero(azar, 100_000, 300_000),
          C: entero(azar, 50_000, 150_000),
          D: entero(azar, 50_000, 150_000),
        }),
      );
    });
    const tabla = tablaDisputa(resultados);
    expect(tabla).toHaveLength(10);
    for (let i = 1; i < tabla.length; i++) {
      expect(tabla[i]?.porcentajeVotosAMover).toBeGreaterThanOrEqual(tabla[i - 1]?.porcentajeVotosAMover ?? 0);
    }
    // Es el mismo ranking que ordenar todas las filas y quedarse con 10.
    const todas = resultados
      .map(disputaCircunscripcion)
      .filter((f) => f !== null)
      .sort((a, b) => a.porcentajeVotosAMover - b.porcentajeVotosAMover)
      .slice(0, 10);
    expect(tabla.map((f) => f.codigo)).toEqual(todas.map((f) => f.codigo));
  });

  it('omite las circunscripciones sin datos', () => {
    const tabla = tablaDisputa([calcularCircunscripcion(circ('01', 4), null)]);
    expect(tabla).toEqual([]);
  });
});

describe('porcentajeCensoNacional', () => {
  const esc = (codigo: string, censo: number, censoEscrutado: number): Escrutinio => ({
    codigo,
    censo,
    censoEscrutado,
    blancos: 0,
    candidaturas: [{ siglas: 'A', votos: censoEscrutado / 2 }],
  });

  it('porcentajeCensoNacional pondera por censo, no por circunscripciones', () => {
    // 50 de 100 y 150 de 300: 200 de 400, aunque una circunscripción vaya al 50 % y la otra también.
    expect(porcentajeCensoNacional([esc('01', 100, 50), esc('02', 300, 150)])).toBe(0.5);
    // Una pequeña completa y una grande a la mitad: 100 + 500 de 100 + 1.000 → no es el 75 % de la media simple.
    expect(porcentajeCensoNacional([esc('01', 100, 100), esc('02', 1_000, 500)])).toBeCloseTo(600 / 1_100, 12);
  });

  it('con el censo nacional, cuenta también las circunscripciones que no aparecen', () => {
    const lista = [esc('01', 100, 50), esc('02', 300, 150)];
    expect(porcentajeCensoNacional(lista, 500)).toBe(0.4);
    expect(porcentajeCensoNacional([], 1_000)).toBe(0);
  });

  it('sin datos ni censo nacional devuelve 0', () => {
    expect(porcentajeCensoNacional([])).toBe(0);
  });

  it('una circunscripción en la lista pero sin escrutar cuenta como 0', () => {
    expect(porcentajeCensoNacional([esc('01', 100, 100), esc('02', 100, 0)])).toBe(0.5);
  });

  it('rechaza un censo nacional imposible y escrutinios incoherentes', () => {
    expect(() => porcentajeCensoNacional([esc('01', 100, 50)], 50)).toThrow(ErrorDatos);
    expect(() => porcentajeCensoNacional([esc('01', 100, 50)], 0)).toThrow(ErrorDatos);
    expect(() => porcentajeCensoNacional([esc('01', 100, 150)])).toThrow(ErrorDatos);
  });
});
