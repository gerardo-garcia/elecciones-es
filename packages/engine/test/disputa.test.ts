import { describe, expect, it } from 'vitest';
import {
  calcularCircunscripcion,
  construirTablaDisputa,
  disputaCircunscripcion,
  disputaPorEscano,
  disputaPorUmbral,
  ErrorDatos,
  porcentajeCensoNacional,
  posibilidadVuelco,
  rankingDisputa,
  repartirDHondt,
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

describe('rankingDisputa', () => {
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
    const tabla = rankingDisputa(resultados);
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
    const tabla = rankingDisputa([calcularCircunscripcion(circ('01', 4), null)]);
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

// --- Vuelco posible y tabla ----------------------------------------------------------------------------------

/** Escrutinio con `censoEscrutado` de `censo` electores contados y los votos dados (blancos aparte). */
const parcial = (codigo: string, censo: number, censoEscrutado: number, votos: Record<string, number>, blancos = 0): Escrutinio => ({
  codigo,
  censo,
  censoEscrutado,
  blancos,
  candidaturas: Object.entries(votos).map(([siglas, v]) => ({ siglas, votos: v })),
});
const reparto = (r: ResultadoCircunscripcion) =>
  JSON.stringify(r.escanos.map((e) => [e.siglas, e.escanos] as const).sort(([a], [b]) => (a < b ? -1 : 1)));

describe('posibilidadVuelco', () => {
  // 2 escaños, A 600 / B 380 / C 20: A y B se llevan uno. Para cambiarlo, A necesitaría 160 votos más (380·2 − 600).
  const votos = { A: 600, B: 380, C: 20 };
  const con = (censoEscrutado: number, censo = 2_000) => calcularCircunscripcion(circ('01', 2), parcial('01', censo, censoEscrutado, votos));

  it('compara los votos reales necesarios con los electores sin escrutar', () => {
    const v = posibilidadVuelco(con(1_000));
    expect(v?.votosNecesarios).toBeCloseTo(160, 6); // son votos reales, no proyectados (factor 2)
    expect(v).toMatchObject({ votosPendientes: 1_000, puedeHaberVuelco: true });
  });

  it('con los pendientes justos aún puede haber vuelco; con uno menos, no', () => {
    // 2.000 − 1.840 = 160 pendientes = los necesarios.
    expect(posibilidadVuelco(con(1_840))).toMatchObject({ votosPendientes: 160, puedeHaberVuelco: true });
    expect(posibilidadVuelco(con(1_841))).toMatchObject({ votosPendientes: 159, puedeHaberVuelco: false });
  });

  it('los votos necesarios no dependen del factor de extrapolación', () => {
    expect(posibilidadVuelco(con(1_100))?.votosNecesarios).toBeCloseTo(posibilidadVuelco(con(1_900))?.votosNecesarios ?? Number.NaN, 6);
  });

  it('con el recuento completo solo el voto exterior esperado puede decidir', () => {
    const completo = con(2_000);
    expect(posibilidadVuelco(completo)).toMatchObject({ votosPendientes: 0, puedeHaberVuelco: false });
    expect(posibilidadVuelco(completo, 159)?.puedeHaberVuelco).toBe(false);
    expect(posibilidadVuelco(completo, 160)).toMatchObject({ votosPendientes: 160, puedeHaberVuelco: true });
  });

  it('el voto exterior ya escrutado no se cuenta otra vez como pendiente', () => {
    const conCera = calcularCircunscripcion(circ('01', 2), parcial('01', 2_000, 2_000, votos), { blancos: 0, candidaturas: [{ siglas: 'A', votos: 10 }] });
    expect(conCera.ceraIncluido).toBe(true);
    expect(posibilidadVuelco(conCera, 5_000)).toMatchObject({ votosPendientes: 0, puedeHaberVuelco: false });
  });

  it('no hay análisis sin datos; y si no se puede acotar no se descarta el vuelco', () => {
    expect(posibilidadVuelco(calcularCircunscripcion(circ('01', 2), null))).toBeNull();
    expect(posibilidadVuelco(calcularCircunscripcion(circ('01', 2), parcial('01', 2_000, 0, {})))).toBeNull();
    // Ceuta con una sola candidatura con votos: no hay rival contra el que medir.
    const sola = calcularCircunscripcion(circ('51', 1, 'mayoritaria'), parcial('51', 100, 100, { A: 50 }));
    expect(posibilidadVuelco(sola)).toMatchObject({ votosNecesarios: null, puedeHaberVuelco: true });
  });

  it('rechaza un voto exterior esperado negativo', () => {
    expect(() => posibilidadVuelco(con(1_000), -1)).toThrow(ErrorDatos);
  });

  it('nunca descarta un cambio real: ninguna llegada de votos pendientes lo cambia si no bastan (600 escenarios adversos)', () => {
    const azar = crearAzar(2026);
    let cambios = 0;
    let descartadas = 0;
    for (let i = 0; i < 600; i++) {
      const mayoritaria = azar() < 0.15;
      const circunscripcion = circ('99', mayoritaria ? 1 : entero(azar, 2, 12), mayoritaria ? 'mayoritaria' : 'proporcional');
      const siglas = Array.from({ length: entero(azar, 2, 6) }, (_, k) => `P${k}`);
      const contados = Object.fromEntries(siglas.map((s) => [s, entero(azar, 100, 5_000)]));
      const blancos = entero(azar, 0, 200);
      const validos = Object.values(contados).reduce((s, v) => s + v, blancos);
      const escrutado = Math.ceil(validos * (1 + azar() * 0.6));
      // Mitad de los escenarios casi terminados (pocos pendientes) y mitad con mucho por contar.
      const censo = escrutado + entero(azar, 0, Math.round(escrutado * (azar() < 0.5 ? 0.04 : 0.8)));
      const ceraEsperados = azar() < 0.3 ? entero(azar, 0, 300) : 0;

      const actual = calcularCircunscripcion(circunscripcion, parcial('99', censo, escrutado, contados, blancos));
      const posibilidad = posibilidadVuelco(actual, ceraEsperados);
      expect(posibilidad).not.toBeNull();

      // Llegan, como mucho, tantos votos como pendientes: o todos a una candidatura (lo más favorable al cambio)
      // o repartidos al azar; a veces a blancos, que solo suben el total para la barrera.
      const presupuesto = censo - escrutado + ceraEsperados;
      const destinos = [...siglas, 'blancos'];
      const llegada: Record<string, number> = Object.fromEntries(destinos.map((d) => [d, 0]));
      if (azar() < 0.6) {
        llegada[destinos[entero(azar, 0, destinos.length - 1)] as string] = presupuesto;
      } else {
        const paquete = Math.max(1, Math.floor(presupuesto / 400));
        for (let dado = 0; dado + paquete <= presupuesto; dado += paquete) {
          const d = destinos[entero(azar, 0, destinos.length - 1)] as string;
          llegada[d] = (llegada[d] as number) + paquete;
        }
      }
      const final = calcularCircunscripcion(
        circunscripcion,
        parcial(
          '99',
          censo,
          censo,
          Object.fromEntries(siglas.map((s) => [s, (contados[s] as number) + (llegada[s] as number)])),
          blancos + (llegada['blancos'] as number),
        ),
      );
      if (reparto(final) !== reparto(actual)) {
        cambios++;
        expect(posibilidad?.puedeHaberVuelco, `escenario ${i}`).toBe(true);
      }
      if (posibilidad && !posibilidad.puedeHaberVuelco) descartadas++;
    }
    // Que el test no sea vacío: hay cambios reales y hay circunscripciones descartadas.
    expect(cambios).toBeGreaterThan(40);
    expect(descartadas).toBeGreaterThan(40);
  });
});

describe('construirTablaDisputa', () => {
  const resultado = (codigo: string, censoEscrutado: number, votos: Record<string, number>, censo = 100_000) =>
    calcularCircunscripcion(circ(codigo, 5), parcial(codigo, censo, censoEscrutado, votos));
  /** A la mitad del recuento: quedan 50.000 electores, de sobra para cambiar el reparto. */
  const conOpcion = (codigo: string, ventaja = 2_000) => resultado(codigo, 50_000, { A: 20_000 + ventaja, B: 15_000, C: 5_000 });
  /** Recuento completo y sin empates: ya no puede cambiar nada. */
  const sinOpcion = (codigo: string, ventaja = 10_000) => resultado(codigo, 100_000, { A: 30_000 + ventaja, B: 30_000, C: 10_000 });
  const codigos = (desde: number, cuantas: number) => Array.from({ length: cuantas }, (_, i) => String(desde + i).padStart(2, '0'));
  const tabla = (rs: ResultadoCircunscripcion[], extra = {}) => construirTablaDisputa(rs, { porcentajeEscrutadoGlobal: 0.5, ...extra });

  it('normal: hasta 10 filas, ordenadas, con el % global y el % escrutado de cada circunscripción', () => {
    const rs = codigos(1, 12).map((c, i) => conOpcion(c, 500 + 400 * i));
    const t = tabla(rs, { porcentajeEscrutadoGlobal: 0.62 });
    expect(t).toMatchObject({ estado: 'normal', porcentajeEscrutadoGlobal: 0.62, n: 10, total: 12, conOpcionDeVuelco: 12, sinOpcionDeVuelco: [] });
    expect(t.filas).toHaveLength(10);
    for (let i = 1; i < t.filas.length; i++) {
      expect(t.filas[i]?.porcentajeVotosAMover).toBeGreaterThanOrEqual(t.filas[i - 1]?.porcentajeVotosAMover ?? 0);
    }
    for (const f of t.filas) {
      expect(f.porcentajeCenso).toBe(0.5);
      expect(f.vuelco?.puedeHaberVuelco).toBe(true);
    }
  });

  it('descarta las circunscripciones que ya no pueden cambiar, aunque estén muy ajustadas', () => {
    const ajustada = sinOpcion('01', 1); // casi empate, pero con el recuento completo
    const holgada = conOpcion('02', 8_000); // mucha ventaja, pero con la mitad por contar
    expect(rankingDisputa([ajustada, holgada])[0]?.codigo).toBe('01'); // sin filtrar, la primera sería la ajustada
    const t = tabla([ajustada, holgada, ...codigos(3, 10).map((c) => conOpcion(c))]);
    expect(t.sinOpcionDeVuelco).toEqual(['01']);
    expect(t.filas.map((f) => f.codigo)).not.toContain('01');
    expect(t.filas.map((f) => f.codigo)).toContain('02');
  });

  it('reducida: cuando quedan menos de 10 circunscripciones con opción de vuelco', () => {
    // 12 circunscripciones: con 2 descartadas quedan 10 (tabla completa); con 3, quedan 9.
    const rs = (descartadas: number) => [
      ...codigos(1, descartadas).map((c) => sinOpcion(c)),
      ...codigos(20, 12 - descartadas).map((c) => conOpcion(c)),
    ];
    expect(tabla(rs(2))).toMatchObject({ estado: 'normal', conOpcionDeVuelco: 10 });
    expect(tabla(rs(2)).filas).toHaveLength(10);
    const t = tabla(rs(3));
    expect(t).toMatchObject({ estado: 'reducida', conOpcionDeVuelco: 9, total: 12, sinOpcionDeVuelco: ['01', '02', '03'] });
    expect(t.filas).toHaveLength(9);
  });

  it('con 52 circunscripciones, la tabla se reduce al descartar más de 42', () => {
    const rs = (descartadas: number) => [
      ...codigos(1, descartadas).map((c) => sinOpcion(c)),
      ...codigos(1 + descartadas, 52 - descartadas).map((c) => conOpcion(c)),
    ];
    expect(tabla(rs(42)).estado).toBe('normal');
    expect(tabla(rs(43))).toMatchObject({ estado: 'reducida', conOpcionDeVuelco: 9 });
    expect(tabla(rs(51))).toMatchObject({ estado: 'reducida', conOpcionDeVuelco: 1 });
    expect(tabla(rs(51)).filas).toHaveLength(1);
  });

  it('sin-vuelco: si ninguna circunscripción puede cambiar no hay tabla', () => {
    const t = tabla(codigos(1, 12).map((c) => sinOpcion(c)));
    expect(t).toMatchObject({ estado: 'sin-vuelco', filas: [], conOpcionDeVuelco: 0, total: 12 });
    expect(t.sinOpcionDeVuelco).toHaveLength(12);
  });

  it('una circunscripción sin datos no se descarta: faltan datos, no opciones', () => {
    const sinDatos = (c: string) => calcularCircunscripcion(circ(c, 5), null);
    const t = tabla([...codigos(1, 45).map(sinDatos), ...codigos(46, 7).map((c) => conOpcion(c))]);
    expect(t).toMatchObject({ estado: 'normal', total: 52, conOpcionDeVuelco: 52, sinOpcionDeVuelco: [] });
    expect(t.filas).toHaveLength(7);
    // Y al principio de todo, sin ningún dato: tabla vacía pero no "sin vuelco".
    expect(tabla(codigos(1, 52).map(sinDatos))).toMatchObject({ estado: 'normal', filas: [], conOpcionDeVuelco: 52 });
  });

  it('el voto exterior esperado mantiene en la tabla una circunscripción con el recuento completo', () => {
    const rs = [sinOpcion('01', 100)]; // A 30.100 / B 30.000: solo 100 votos de ventaja
    expect(tabla(rs).estado).toBe('sin-vuelco');
    const grande = tabla(rs, { ceraEsperados: { '01': 5_000 } });
    expect(grande.estado).toBe('normal'); // ninguna descartada
    expect(grande.filas.map((f) => f.codigo)).toEqual(['01']);
    expect(grande.filas[0]?.vuelco?.votosPendientes).toBe(5_000);
    expect(grande.filas[0]?.cera?.puedeDecidir).toBe(true);
    // Si el exterior esperado no basta para cambiar nada, se descarta igual que sin él.
    expect(tabla(rs, { ceraEsperados: { '01': 10 } }).estado).toBe('sin-vuelco');
  });

  it('sin circunscripciones no hay tabla "sin vuelco", y n se respeta', () => {
    expect(tabla([])).toMatchObject({ estado: 'normal', filas: [], total: 0 });
    expect(tabla(codigos(1, 12).map((c) => conOpcion(c)), { n: 3 }).filas).toHaveLength(3);
  });

  it('rechaza un porcentaje global fuera de rango y un n inválido', () => {
    expect(() => tabla([], { porcentajeEscrutadoGlobal: 1.2 })).toThrow(ErrorDatos);
    expect(() => tabla([], { porcentajeEscrutadoGlobal: Number.NaN })).toThrow(ErrorDatos);
    expect(() => tabla([], { n: 0 })).toThrow(ErrorDatos);
    expect(() => tabla([], { n: 2.5 })).toThrow(ErrorDatos);
  });
});
