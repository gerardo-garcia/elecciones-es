import { describe, expect, it } from 'vitest';
import {
  calcularCircunscripcion,
  disputaCircunscripcion,
  ErrorDatos,
  estimarVotosCera,
  rankingDisputa,
  votosCeraNecesarios,
  type ResultadoCircunscripcion,
} from '../src';
import { circ, crearAzar, entero, escrutinioCompleto } from './helpers';

// Escaños por candidatura con las claves ordenadas: el orden de la lista cambia con los votos, el reparto no.
const escanosDe = (r: ResultadoCircunscripcion): Record<string, number> =>
  Object.fromEntries(r.escanos.map((e) => [e.siglas, e.escanos] as const).sort(([a], [b]) => (a < b ? -1 : 1)));

describe('calcularCircunscripcion con voto CERA', () => {
  it('suma el CERA sin extrapolar y aparte de los votos residentes', () => {
    // Escrutado el 50 % del censo: los residentes se multiplican por 2, el CERA no.
    const e = { codigo: '28', censo: 1000, censoEscrutado: 500, blancos: 10, candidaturas: [{ siglas: 'A', votos: 100 }, { siglas: 'B', votos: 50 }] };
    const r = calcularCircunscripcion(circ('28', 3), e, { blancos: 4, candidaturas: [{ siglas: 'A', votos: 7 }, { siglas: 'C', votos: 3 }] });
    const votos = Object.fromEntries(r.proyeccion!.candidaturas.map((c) => [c.siglas, c.votos]));
    expect(votos).toEqual({ A: 207, B: 100, C: 3 });
    expect(r.proyeccion!.blancos).toBe(24);
    expect(r.proyeccion!.validos).toBe(207 + 100 + 3 + 24);
    expect(r.ceraIncluido).toBe(true);
    expect(r.estado).toBe('parcial');
  });

  it('sin CERA el resultado es el de siempre y lo marca', () => {
    const r = calcularCircunscripcion(circ('28', 3), escrutinioCompleto('28', { A: 600, B: 300, C: 100 }));
    expect(r.ceraIncluido).toBe(false);
    expect(calcularCircunscripcion(circ('28', 3), escrutinioCompleto('28', { A: 600, B: 300, C: 100 }), null).ceraIncluido).toBe(false);
  });

  it('el CERA puede hacer que una candidatura supere la barrera del 3 %', () => {
    // C: 29 de 1000 válidos (2,9 %) sin CERA; con 5 votos CERA más pasa a 34/1005 (3,38 %).
    const e = escrutinioCompleto('01', { A: 600, B: 371, C: 29 }, 0);
    expect(calcularCircunscripcion(circ('01', 8), e).elegibles).not.toContain('C');
    const con = calcularCircunscripcion(circ('01', 8), e, { blancos: 0, candidaturas: [{ siglas: 'C', votos: 5 }] });
    expect(con.elegibles).toContain('C');
  });

  it('sin datos del escrutinio normal no se suma el CERA', () => {
    const r = calcularCircunscripcion(circ('01', 3), null, { blancos: 5, candidaturas: [{ siglas: 'A', votos: 5 }] });
    expect(r.estado).toBe('sin-datos');
    expect(r.ceraIncluido).toBe(false);
  });

  it('rechaza CERA con votos negativos o candidaturas duplicadas', () => {
    const e = escrutinioCompleto('01', { A: 10 });
    expect(() => calcularCircunscripcion(circ('01', 3), e, { blancos: -1, candidaturas: [] })).toThrow(ErrorDatos);
    expect(() => calcularCircunscripcion(circ('01', 3), e, { blancos: 0, candidaturas: [{ siglas: 'A', votos: -2 }] })).toThrow(ErrorDatos);
    expect(() =>
      calcularCircunscripcion(circ('01', 3), e, { blancos: 0, candidaturas: [{ siglas: 'A', votos: 1 }, { siglas: 'A', votos: 2 }] }),
    ).toThrow(/duplicada/);
  });
});

describe('votosCeraNecesarios', () => {
  it('ejemplo calculado a mano: 2 escaños, A 600 / B 380 / C 20', () => {
    // D'Hondt con 2 escaños: A (600) y B (380) se llevan uno cada uno; el siguiente cociente es A/2 = 300.
    // El último escaño es de B (cociente 380, sB = 1). Para que A se lleve el segundo hace falta A/2 > 380,
    // es decir, 160 votos más para A: 380·2/1 − 600 = 160. C (20 votos, 2 %) necesitaría bastante más.
    const r = calcularCircunscripcion(circ('01', 2), escrutinioCompleto('01', { A: 600, B: 380, C: 20 }));
    expect(escanosDe(r)).toEqual({ A: 1, B: 1 });
    expect(votosCeraNecesarios(r)).toBeCloseTo(160, 9);
  });

  it('Ceuta/Melilla: el rival necesita la diferencia entera (todos los votos CERA a él)', () => {
    const r = calcularCircunscripcion(circ('51', 1, 'mayoritaria'), escrutinioCompleto('51', { A: 600, B: 500, C: 100 }));
    expect(votosCeraNecesarios(r)).toBeCloseTo(100, 9);
  });

  it('también cuenta la candidatura que perdería sus escaños al quedar bajo el 3 %', () => {
    // 3 escaños: A 900, B 66, C 34 (V = 1000). B es 6,6 %: no hay riesgo de barrera. C (3,4 %) no tiene escaño.
    // Elegibles: B (6,6 %) y C (3,4 %) pasan. Con N votos CERA a otros C cae bajo el 3 %: 34 / 0,03 − 1000 = 133,3.
    const r = calcularCircunscripcion(circ('01', 3), escrutinioCompleto('01', { A: 900, B: 66, C: 34 }));
    expect(escanosDe(r)).toEqual({ A: 3 });
    // Sin escaños para C ni B: la cota viene del escaño (B necesita 900·1/3 − 66 = 234 votos).
    expect(votosCeraNecesarios(r)).toBeCloseTo(234, 9);
  });

  it('no hay cota sin datos', () => {
    expect(votosCeraNecesarios(calcularCircunscripcion(circ('01', 3), null))).toBeNull();
  });

  it('es una cota inferior rigurosa: si el CERA cambia el reparto, nunca hay menos votos CERA que la cota', () => {
    const azar = crearAzar(2023);
    let cambios = 0;
    for (let i = 0; i < 600; i++) {
      const nCands = entero(azar, 2, 7);
      const escanos = entero(azar, 1, 9);
      const mayoritaria = escanos === 1 && azar() < 0.5;
      const votos: Record<string, number> = {};
      const cera: { siglas: string; votos: number }[] = [];
      for (let k = 0; k < nCands; k++) {
        const s = `P${k}`;
        votos[s] = entero(azar, 0, 2000);
        cera.push({ siglas: s, votos: azar() < 0.4 ? 0 : entero(azar, 0, 400) });
      }
      const blancos = entero(azar, 0, 100);
      const blancosCera = entero(azar, 0, 40);
      if (Object.values(votos).reduce((a, b) => a + b, 0) === 0) continue;

      const c = circ('01', escanos, mayoritaria ? 'mayoritaria' : 'proporcional');
      const e = escrutinioCompleto('01', votos, blancos);
      const sin = calcularCircunscripcion(c, e);
      const con = calcularCircunscripcion(c, e, { blancos: blancosCera, candidaturas: cera });
      if (JSON.stringify(escanosDe(sin)) === JSON.stringify(escanosDe(con))) continue;
      cambios++;
      const totalCera = cera.reduce((s, x) => s + x.votos, blancosCera);
      const cota = votosCeraNecesarios(sin);
      expect(cota, `escenario ${i}`).not.toBeNull();
      expect(cota!, `escenario ${i}`).toBeLessThanOrEqual(totalCera + 1e-9);
    }
    // El generador tiene que provocar cambios de verdad, o la prueba no prueba nada.
    expect(cambios).toBeGreaterThan(40);
  });
});

describe('tabla de disputa con riesgo CERA', () => {
  const resultado = () => calcularCircunscripcion(circ('01', 2), escrutinioCompleto('01', { A: 600, B: 380, C: 20 }));

  it('sin estimación no hay campo CERA relleno', () => {
    expect(disputaCircunscripcion(resultado())!.cera).toBeNull();
  });

  it('con estimación indica votos necesarios, esperados y si podría decidir', () => {
    const poco = disputaCircunscripcion(resultado(), 100)!;
    expect(poco.cera).toEqual({ votosNecesarios: expect.closeTo(160, 9), votosEsperados: 100, puedeDecidir: false });
    const mucho = disputaCircunscripcion(resultado(), 160)!;
    expect(mucho.cera?.puedeDecidir).toBe(true);
  });

  it('si el CERA ya está incluido no hay riesgo pendiente', () => {
    const r = calcularCircunscripcion(circ('01', 2), escrutinioCompleto('01', { A: 600, B: 380, C: 20 }), {
      blancos: 0,
      candidaturas: [{ siglas: 'B', votos: 5 }],
    });
    expect(disputaCircunscripcion(r, 1000)!.cera).toBeNull();
  });

  it('rankingDisputa usa la estimación de cada circunscripción por su código', () => {
    const tabla = rankingDisputa([resultado()], 10, { '01': 500 });
    expect(tabla[0]!.cera?.votosEsperados).toBe(500);
    expect(rankingDisputa([resultado()], 10, { '99': 500 })[0]!.cera).toBeNull();
  });
});

describe('estimarVotosCera: validación', () => {
  const conf = { circunscripciones: { '01': { censoCera: 100, votantesCera: 10, votosValidosCera: 9 } } };
  it('rechaza censos o márgenes inválidos', () => {
    expect(() => estimarVotosCera(conf, 0)).toThrow(ErrorDatos);
    expect(() => estimarVotosCera(conf, 100, 0.5)).toThrow(ErrorDatos);
    expect(() => estimarVotosCera({ circunscripciones: {} }, 100)).toThrow(ErrorDatos);
  });
});
