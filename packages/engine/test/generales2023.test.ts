import { describe, expect, it } from 'vitest';
import fixtureJson from './fixtures/generales-2023.json';
import ceraJson from '../../../data/config/cera-2023.json';
import {
  calcularCircunscripcion,
  construirTablaDisputa,
  estimarVotosCera,
  rankingDisputa,
  votosCeraNecesarios,
  type Circunscripcion,
  type ConfigCera,
  type Escrutinio,
  type ResultadoCircunscripcion,
  type VotosCera,
} from '../src';

/**
 * Contraste con los resultados OFICIALES de las elecciones generales de julio de 2023
 * (Ministerio del Interior, Infoelectoral). Los escaños eran 350 en total; Madrid tenía 37.
 */
interface Circ2023 {
  codigo: string;
  nombre: string;
  escanos: number;
  censoCER: number;
  cer: { blancos: number; votos: Record<string, number> };
  cera: { blancos: number; votos: Record<string, number> };
  escanosOficiales: Record<string, number>;
}
const circunscripciones = (fixtureJson as unknown as { circunscripciones: Circ2023[] }).circunscripciones;
const configCera = ceraJson as unknown as ConfigCera;

const aCirc = (c: Circ2023): Circunscripcion => ({
  codigo: c.codigo,
  nombre: c.nombre,
  escanos: c.escanos,
  tipo: c.codigo === '51' || c.codigo === '52' ? 'mayoritaria' : 'proporcional',
});
const escrutinioCer = (c: Circ2023): Escrutinio => ({
  codigo: c.codigo,
  censo: c.censoCER,
  censoEscrutado: c.censoCER,
  blancos: c.cer.blancos,
  candidaturas: Object.entries(c.cer.votos).map(([siglas, votos]) => ({ siglas, votos })),
});
const votosCera = (c: Circ2023): VotosCera => ({
  blancos: c.cera.blancos,
  candidaturas: Object.entries(c.cera.votos).map(([siglas, votos]) => ({ siglas, votos })),
});
// Escaños por candidatura con las claves ordenadas: el orden de la lista cambia con los votos, el reparto no.
const escanosDe = (r: ResultadoCircunscripcion): Record<string, number> =>
  Object.fromEntries(r.escanos.map((e) => [e.siglas, e.escanos] as const).sort(([a], [b]) => (a < b ? -1 : 1)));
const totalCera = (c: Circ2023) => Object.values(c.cera.votos).reduce((s, v) => s + v, c.cera.blancos);

describe('fixture de 2023', () => {
  it('son 52 circunscripciones y 350 escaños oficiales', () => {
    expect(circunscripciones).toHaveLength(52);
    expect(circunscripciones.reduce((s, c) => s + c.escanos, 0)).toBe(350);
    expect(circunscripciones.find((c) => c.codigo === '28')?.escanos).toBe(37);
  });
});

describe('barrera del 3 % + D\'Hondt reproducen los escaños oficiales de 2023', () => {
  it('con los votos finales (residentes + CERA), las 52 circunscripciones coinciden', () => {
    const distintas: string[] = [];
    for (const c of circunscripciones) {
      const r = calcularCircunscripcion(aCirc(c), escrutinioCer(c), votosCera(c));
      expect(r.ceraIncluido).toBe(true);
      expect(r.estado).toBe('completo');
      if (JSON.stringify(escanosDe(r)) !== JSON.stringify(Object.fromEntries(Object.entries(c.escanosOficiales).sort(([a], [b]) => (a < b ? -1 : 1))))) {
        distintas.push(c.nombre);
      }
    }
    expect(distintas).toEqual([]);
  });

  it('el reparto nacional suma 350 y coincide por candidatura con el oficial', () => {
    const motor: Record<string, number> = {};
    const oficial: Record<string, number> = {};
    for (const c of circunscripciones) {
      const r = calcularCircunscripcion(aCirc(c), escrutinioCer(c), votosCera(c));
      for (const e of r.escanos) motor[e.siglas] = (motor[e.siglas] ?? 0) + e.escanos;
      for (const [s, n] of Object.entries(c.escanosOficiales)) oficial[s] = (oficial[s] ?? 0) + n;
    }
    expect(Object.values(motor).reduce((a, b) => a + b, 0)).toBe(350);
    expect(motor).toEqual(oficial);
    expect(motor['PP']! + motor['PSOE']! + motor['VOX']! + motor['SUMAR']!).toBeGreaterThan(300);
  });
});

describe('voto CERA de 2023', () => {
  it('sin CERA el reparto cambia en una sola circunscripción: Madrid, un escaño del PSOE al PP', () => {
    const cambian: string[] = [];
    for (const c of circunscripciones) {
      const sin = calcularCircunscripcion(aCirc(c), escrutinioCer(c));
      const con = calcularCircunscripcion(aCirc(c), escrutinioCer(c), votosCera(c));
      expect(sin.ceraIncluido).toBe(false);
      if (JSON.stringify(escanosDe(sin)) !== JSON.stringify(escanosDe(con))) cambian.push(c.nombre);
    }
    expect(cambian).toEqual(['Madrid']);

    const madrid = circunscripciones.find((c) => c.codigo === '28')!;
    const sin = escanosDe(calcularCircunscripcion(aCirc(madrid), escrutinioCer(madrid)));
    const con = escanosDe(calcularCircunscripcion(aCirc(madrid), escrutinioCer(madrid), votosCera(madrid)));
    expect([sin['PP'], sin['PSOE']]).toEqual([15, 11]);
    expect([con['PP'], con['PSOE']]).toEqual([16, 10]);
  });

  it('la cota de votos CERA necesarios nunca descarta un cambio real (52 circunscripciones)', () => {
    for (const c of circunscripciones) {
      const sin = calcularCircunscripcion(aCirc(c), escrutinioCer(c));
      const con = calcularCircunscripcion(aCirc(c), escrutinioCer(c), votosCera(c));
      if (JSON.stringify(escanosDe(sin)) === JSON.stringify(escanosDe(con))) continue;
      const necesarios = votosCeraNecesarios(sin);
      expect(necesarios, c.nombre).not.toBeNull();
      expect(necesarios!, c.nombre).toBeLessThanOrEqual(totalCera(c));
    }
  });

  it('con la estimación para 2026, Madrid aparece como circunscripción donde el CERA podría decidir', () => {
    const resultados = circunscripciones.map((c) => calcularCircunscripcion(aCirc(c), escrutinioCer(c)));
    const esperados = estimarVotosCera(configCera, 2_663_407);
    const tabla = rankingDisputa(resultados, 52, esperados);
    const madrid = tabla.find((f) => f.codigo === '28');
    expect(madrid?.cera?.puedeDecidir).toBe(true);
    // No todo es "podría decidir": la cota descarta la gran mayoría.
    const posibles = tabla.filter((f) => f.cera?.puedeDecidir).length;
    expect(posibles).toBeGreaterThanOrEqual(1);
    expect(posibles).toBeLessThan(tabla.length / 2);
  });
});

describe('tabla de disputa con el voto exterior (2023)', () => {
  const esperados = estimarVotosCera(configCera, 2_663_407);

  it('con el recuento residente completo, solo quedan las circunscripciones que el CERA podría decidir (Madrid entre ellas)', () => {
    const sin = circunscripciones.map((c) => calcularCircunscripcion(aCirc(c), escrutinioCer(c)));
    const t = construirTablaDisputa(sin, { porcentajeEscrutadoGlobal: 1, ceraEsperados: esperados });
    expect(t.estado).not.toBe('sin-vuelco');
    expect(t.filas.map((f) => f.codigo)).toContain('28');
    // Las dos formas de decirlo coinciden: lo que la tabla conserva es lo que el CERA podría decidir.
    for (const f of t.filas) expect(f.cera?.puedeDecidir, f.nombre).toBe(true);
    expect(t.sinOpcionDeVuelco.length).toBeGreaterThan(t.total / 2);
  });

  it('una vez escrutado el CERA no queda ninguna circunscripción con opción de vuelco', () => {
    const con = circunscripciones.map((c) => calcularCircunscripcion(aCirc(c), escrutinioCer(c), votosCera(c)));
    const t = construirTablaDisputa(con, { porcentajeEscrutadoGlobal: 1, ceraEsperados: esperados });
    expect(t).toMatchObject({ estado: 'sin-vuelco', filas: [], conOpcionDeVuelco: 0, total: 52 });
  });
});

describe('estimarVotosCera', () => {
  it('el censo CERA 2023 de la configuración suma el oficial y los votos válidos suman 204.649', () => {
    const c = Object.values(configCera.circunscripciones);
    expect(c).toHaveLength(52);
    expect(c.reduce((s, x) => s + x.censoCera, 0)).toBe(2_328_260);
    expect(c.reduce((s, x) => s + x.votantesCera, 0)).toBe(208_431);
    expect(c.reduce((s, x) => s + x.votosValidosCera, 0)).toBe(204_649);
  });

  it('con el mismo censo y margen 1 devuelve los votos de referencia', () => {
    const e = estimarVotosCera(configCera, 2_328_260, 1);
    expect(e['28']).toBeCloseTo(configCera.circunscripciones['28']!.votosValidosCera, 6);
  });

  it('escala con el censo CERA nuevo y con el margen', () => {
    const base = estimarVotosCera(configCera, 2_328_260, 1)['28']!;
    expect(estimarVotosCera(configCera, 2_328_260 * 2, 1)['28']).toBeCloseTo(base * 2, 6);
    expect(estimarVotosCera(configCera, 2_328_260, 1.5)['28']).toBeCloseTo(base * 1.5, 6);
  });
});
