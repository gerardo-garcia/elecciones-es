import { describe, expect, it } from 'vitest';
import { circunscripciones2023, municipios2023 } from './datos2023';
import { circ } from './helpers';
import {
  backtest,
  crearEscenario,
  ErrorDatos,
  evaluar,
  proyectarInstantanea,
  type Instantanea,
  type MetricasInstante,
  type OrdenEscrutinio,
} from '../src';

const TIEMPO = 60_000;
const SEMILLAS = [1, 2, 3, 4, 5];

const noche = (semilla: number, orden: OrdenEscrutinio = 'aleatorio') =>
  backtest(circunscripciones2023, crearEscenario(municipios2023, { semilla, orden }));

/** Puntos con todas las circunscripciones ya dando datos y el censo nacional escrutado en [desde, hasta). */
const entre = (puntos: MetricasInstante[], desde: number, hasta: number) =>
  puntos.filter((p) => p.escanosPendientes === 0 && p.porcentajeCenso >= desde && p.porcentajeCenso < hasta);

describe('evaluar (a mano)', () => {
  // Circunscripción A (3 escaños) con la final P 60 / Q 40 → P 2, Q 1. Circunscripción B (1 escaño) sin datos aún.
  const cA = circ('01', 3);
  const cB = circ('02', 1);
  const esc = (codigo: string, censoEscrutado: number, votos: Record<string, number>) => ({
    codigo,
    censo: 100,
    censoEscrutado,
    blancos: 0,
    candidaturas: Object.entries(votos).map(([siglas, v]) => ({ siglas, votos: v })),
  });
  const inst = (minutos: number, escrutinios: Instantanea['escrutinios']): Instantanea => ({ minutos, porcentajeCenso: 0, escrutinios });
  const circs = [cA, cB];
  const finales = proyectarInstantanea(circs, inst(300, [esc('01', 100, { P: 60, Q: 40 }), esc('02', 100, { P: 5, Q: 9 })]));

  it('cuenta los escaños que cambian de manos y los pendientes', () => {
    // Con Q 32 / P 28 el reparto es Q 2, P 1: un escaño pasa de P a Q.
    const parcial = proyectarInstantanea(circs, inst(30, [esc('01', 60, { P: 28, Q: 32 })]));
    const m = evaluar(inst(30, []), parcial, finales);
    expect(m).toMatchObject({
      circunscripcionesConDatos: 1,
      escanosPendientes: 1,
      circunscripcionesDistintas: 1,
      escanosErroneos: 1,
    });
  });

  it('si el reparto ya es el definitivo no hay error, aunque falte censo por escrutar', () => {
    const parcial = proyectarInstantanea(circs, inst(30, [esc('01', 50, { P: 31, Q: 29 }), esc('02', 20, { P: 2, Q: 5 })]));
    const m = evaluar(inst(30, []), parcial, finales);
    expect(m).toMatchObject({ circunscripcionesConDatos: 2, escanosPendientes: 0, circunscripcionesDistintas: 0, escanosErroneos: 0 });
  });

  it('mide si la tabla de disputa señala las circunscripciones que acabarán cambiando', () => {
    const parcial = proyectarInstantanea(circs, inst(30, [esc('01', 60, { P: 28, Q: 32 }), esc('02', 20, { P: 2, Q: 5 })]));
    const dos = evaluar(inst(30, []), parcial, finales, 10);
    expect(dos).toMatchObject({ filasTabla: 2, distintasEnTabla: 1, filasQueCambian: 1 });
    const una = evaluar(inst(30, []), parcial, finales, 1);
    expect(una.filasTabla).toBe(1);
  });

  it('rechaza listas desalineadas y datos de circunscripciones desconocidas', () => {
    const parcial = proyectarInstantanea(circs, inst(30, []));
    expect(() => evaluar(inst(30, []), parcial.slice(1), finales)).toThrow(ErrorDatos);
    expect(() => evaluar(inst(30, []), [...parcial].reverse(), finales)).toThrow(ErrorDatos);
    expect(() => proyectarInstantanea(circs, inst(30, [esc('99', 10, { P: 1 })]))).toThrow(ErrorDatos);
  });
});

describe('backtest sobre las generales de 2023', () => {
  it('termina con el escrutinio completo y sin ningún error', () => {
    const r = noche(1);
    const ultimo = r.puntos.at(-1) as MetricasInstante;
    expect(ultimo).toMatchObject({ porcentajeCenso: 1, escanosPendientes: 0, circunscripcionesDistintas: 0, escanosErroneos: 0 });
    expect(ultimo.circunscripcionesConDatos).toBe(52);
    expect(ultimo.minutos).toBe(r.minutosCompleto);
  });

  it('empieza sin datos, avanza en el tiempo y acaba estabilizándose', () => {
    const r = noche(1);
    expect(r.puntos[0]).toMatchObject({ minutos: 0, porcentajeCenso: 0, circunscripcionesConDatos: 0, escanosPendientes: 350 });
    const minutos = r.puntos.map((p) => p.minutos);
    expect(minutos).toEqual([...minutos].sort((a, b) => a - b));
    const censo = r.puntos.map((p) => p.porcentajeCenso);
    expect(censo).toEqual([...censo].sort((a, b) => a - b));
    expect(r.minutoEstable).not.toBeNull();
    expect(r.minutoEstable).toBeLessThanOrEqual(r.minutosCompleto);
  }, TIEMPO);

  it('un paso menor da más puntos, y el paso tiene que ser positivo', () => {
    const e = crearEscenario(municipios2023, { semilla: 1 });
    const gordo = backtest(circunscripciones2023, e, { pasoMin: 60 });
    const fino = backtest(circunscripciones2023, e, { pasoMin: 30 });
    expect(fino.puntos.length).toBeGreaterThan(gordo.puntos.length);
    expect(() => backtest(circunscripciones2023, e, { pasoMin: 0 })).toThrow(ErrorDatos);
  }, TIEMPO);

  it('el error baja a medida que avanza el escrutinio (5 noches distintas)', () => {
    for (const semilla of SEMILLAS) {
      const { puntos } = noche(semilla);
      const media = (xs: MetricasInstante[]) => xs.reduce((s, p) => s + p.escanosErroneos, 0) / xs.length;
      const pronto = entre(puntos, 0.25, 0.5);
      const tarde = entre(puntos, 0.95, 1);
      expect(pronto.length, `semilla ${semilla}`).toBeGreaterThan(0);
      expect(tarde.length, `semilla ${semilla}`).toBeGreaterThan(0);
      expect(media(pronto), `semilla ${semilla}`).toBeGreaterThan(media(tarde) + 3);
    }
  }, TIEMPO);

  it('con el 95 % del censo escrutado, la proyección acierta casi todo (cota holgada sobre 20 noches medidas)', () => {
    for (const semilla of SEMILLAS) {
      for (const p of entre(noche(semilla).puntos, 0.95, 1)) {
        // Medido con 20 semillas: máximo 4 escaños mal repartidos. Se deja margen.
        expect(p.escanosErroneos).toBeLessThanOrEqual(8);
        // y la tabla de disputa señala las circunscripciones que acabarán cambiando (medido: ninguna omitida, margen 1).
        expect(p.circunscripcionesDistintas - p.distintasEnTabla).toBeLessThanOrEqual(2);
      }
    }
  }, TIEMPO);

  it('si llegan antes los municipios grandes, la proyección de mitad de noche es peor que con orden aleatorio', () => {
    const errorMedio = (orden: OrdenEscrutinio) => {
      const xs = SEMILLAS.flatMap((s) => entre(noche(s, orden).puntos, 0.6, 0.85));
      return xs.reduce((s, p) => s + p.escanosErroneos, 0) / xs.length;
    };
    expect(errorMedio('urbanos-primero')).toBeGreaterThan(errorMedio('aleatorio'));
  }, TIEMPO);
});
