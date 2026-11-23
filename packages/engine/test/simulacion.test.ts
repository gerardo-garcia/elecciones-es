import { describe, expect, it } from 'vitest';
import { circ2023, circunscripciones2023, municipios2023 } from './datos2023';
import {
  calcularCircunscripcion,
  crearEscenario,
  ErrorDatos,
  instantanea,
  instantaneaFinal,
  leerMunicipios,
  minutosHastaCompleto,
  type Circunscripcion,
  type Escrutinio,
  type Municipio,
} from '../src';

const TIEMPO = 30_000;

/** Curva exponencial sin retraso: F(t) = 1 − exp(−t/100), para poder pedir una fracción exacta. */
const CURVA_EXPONENCIAL = { lambdaMin: 100, kappa: 1, retrasoMin: [0, 0] as [number, number], velocidad: [1, 1] as [number, number] };
const minutosPara = (fraccion: number) => -100 * Math.log(1 - fraccion);

const muni = (circunscripcion: string, mesas: number, censo: number, votos: Record<string, number>, blancos = 0): Municipio => ({
  circunscripcion,
  mesas,
  censo,
  blancos,
  votos,
});
const votosDe = (e: Escrutinio) => Object.fromEntries(e.candidaturas.map((c) => [c.siglas, c.votos]));

describe('leerMunicipios', () => {
  const base = { partidos: ['PP', 'PSOE'], municipios: [[28, 3, 1000, 20, 0, 400, 1, 350]] };

  it('lee el formato compacto', () => {
    expect(leerMunicipios(base)).toEqual([
      { circunscripcion: '28', mesas: 3, censo: 1000, blancos: 20, votos: { PP: 400, PSOE: 350 } },
    ]);
  });

  it('rellena con un cero el código de provincia de una cifra', () => {
    expect(leerMunicipios({ ...base, municipios: [[4, 1, 10, 0]] })[0]?.circunscripcion).toBe('04');
  });

  it.each([
    ['longitud impar', [[28, 3, 1000, 20, 0]]],
    ['demasiado corta', [[28, 3, 1000]]],
    ['partido fuera de la lista', [[28, 3, 1000, 20, 5, 10]]],
    ['partido repetido', [[28, 3, 1000, 20, 0, 10, 0, 5]]],
    ['votos negativos', [[28, 3, 1000, 20, 0, -1]]],
    ['sin mesas', [[28, 0, 1000, 20]]],
    ['censo con decimales', [[28, 3, 10.5, 20]]],
  ])('rechaza datos corruptos: %s', (_nombre, municipios) => {
    expect(() => leerMunicipios({ ...base, municipios })).toThrow(ErrorDatos);
  });
});

describe('la simulación de 2023 es fiel a los datos oficiales', () => {
  it('hay 8.131 municipios y 52 circunscripciones', () => {
    expect(municipios2023).toHaveLength(8131);
    expect(new Set(municipios2023.map((m) => m.circunscripcion)).size).toBe(52);
  });

  it('al acabar el escrutinio, cada circunscripción tiene exactamente sus votos oficiales (voto residente)', () => {
    const final = instantaneaFinal(crearEscenario(municipios2023, { semilla: 7 }));
    expect(final.escrutinios).toHaveLength(52);
    expect(final.porcentajeCenso).toBe(1);
    for (const c of circ2023) {
      const e = final.escrutinios.find((x) => x.codigo === c.codigo);
      expect(e, c.nombre).toBeDefined();
      if (!e) continue;
      expect(e.censo, c.nombre).toBe(c.censoCER);
      expect(e.censoEscrutado, c.nombre).toBe(c.censoCER);
      expect(e.blancos, c.nombre).toBe(c.cer.blancos);
      expect(votosDe(e), c.nombre).toEqual(c.cer.votos);
    }
  });

  it('el resultado final no depende de la semilla ni del orden de llegada', () => {
    const a = instantaneaFinal(crearEscenario(municipios2023, { semilla: 1, orden: 'aleatorio' }));
    const b = instantaneaFinal(crearEscenario(municipios2023, { semilla: 99, orden: 'urbanos-primero' }));
    expect(b.escrutinios).toEqual(a.escrutinios);
  });

  it('con el voto exterior sumado, el escrutinio final reproduce los 350 escaños oficiales', () => {
    const final = instantaneaFinal(crearEscenario(municipios2023, { semilla: 3 }));
    const distintas: string[] = [];
    let total = 0;
    for (const c of circunscripciones2023) {
      const oficial = circ2023.find((x) => x.codigo === c.codigo);
      const e = final.escrutinios.find((x) => x.codigo === c.codigo) ?? null;
      const r = calcularCircunscripcion(c, e, {
        blancos: oficial?.cera.blancos ?? 0,
        candidaturas: Object.entries(oficial?.cera.votos ?? {}).map(([siglas, votos]) => ({ siglas, votos })),
      });
      total += r.escanos.reduce((s, x) => s + x.escanos, 0);
      const motor = Object.fromEntries(r.escanos.map((x) => [x.siglas, x.escanos] as const).sort(([p], [q]) => (p < q ? -1 : 1)));
      const ofi = Object.fromEntries(Object.entries(oficial?.escanosOficiales ?? {}).sort(([p], [q]) => (p < q ? -1 : 1)));
      if (JSON.stringify(motor) !== JSON.stringify(ofi)) distintas.push(c.nombre);
    }
    expect(total).toBe(350);
    expect(distintas).toEqual([]);
  }, TIEMPO);
});

describe('evolución de la noche', () => {
  const escenario = crearEscenario(municipios2023, { semilla: 5 });
  const minutos = [0, 20, 40, 60, 90, 120, 180, 240, 400];

  it('a las 20:00 no hay datos y poco después empiezan a llegar provincia a provincia', () => {
    expect(instantanea(escenario, 0)).toEqual({ minutos: 0, porcentajeCenso: 0, escrutinios: [] });
    const conDatos = minutos.map((t) => instantanea(escenario, t).escrutinios.length);
    expect(conDatos).toEqual([...conDatos].sort((a, b) => a - b)); // nunca baja
    expect(conDatos[2]).toBeGreaterThan(0);
    expect(conDatos[2]).toBeLessThan(52); // escalonadas: a los 40 min aún no todas
    expect(conDatos.at(-1)).toBe(52);
  });

  it('el escrutinio solo crece: ni el censo ni ningún recuento de votos bajan', () => {
    let anterior = new Map<string, Escrutinio>();
    for (const t of minutos) {
      const actual = new Map(instantanea(escenario, t).escrutinios.map((e) => [e.codigo, e] as const));
      for (const [codigo, antes] of anterior) {
        const ahora = actual.get(codigo);
        expect(ahora, `${codigo} a los ${t} min`).toBeDefined();
        if (!ahora) continue;
        expect(ahora.censoEscrutado).toBeGreaterThanOrEqual(antes.censoEscrutado);
        expect(ahora.blancos).toBeGreaterThanOrEqual(antes.blancos);
        const v = votosDe(ahora);
        for (const [siglas, votos] of Object.entries(votosDe(antes))) expect(v[siglas] ?? 0).toBeGreaterThanOrEqual(votos);
      }
      anterior = actual;
    }
  }, TIEMPO);

  it('nunca supera el resultado final y siempre es un escrutinio válido para el motor', () => {
    const final = new Map(instantaneaFinal(escenario).escrutinios.map((e) => [e.codigo, e] as const));
    for (const t of [30, 75, 130, 200]) {
      const inst = instantanea(escenario, t);
      for (const e of inst.escrutinios) {
        const c = circunscripciones2023.find((x) => x.codigo === e.codigo);
        expect(c, e.codigo).toBeDefined();
        expect(() => calcularCircunscripcion(c as Circunscripcion, e), e.codigo).not.toThrow();
        const f = final.get(e.codigo) as Escrutinio;
        expect(e.censo).toBe(f.censo);
        expect(e.censoEscrutado).toBeLessThanOrEqual(f.censoEscrutado);
        expect(e.blancos).toBeLessThanOrEqual(f.blancos);
        const vf = votosDe(f);
        for (const [siglas, votos] of Object.entries(votosDe(e))) expect(votos).toBeLessThanOrEqual(vf[siglas] ?? 0);
      }
    }
  });

  it('pasado el minuto de escrutinio completo, la instantánea es la final', () => {
    const fin = minutosHastaCompleto(escenario);
    expect(instantanea(escenario, fin + 1).escrutinios).toEqual(instantaneaFinal(escenario).escrutinios);
    expect(instantanea(escenario, fin + 1).porcentajeCenso).toBe(1);
  });

  it('con la curva por defecto, el escrutinio llega al 90 % en la primera mitad de la noche', () => {
    // Referencia de la curva inventada: ~94 % a las 23:00 (minuto 180) y completo antes de las 02:00.
    expect(instantanea(escenario, 180).porcentajeCenso).toBeGreaterThan(0.85);
    expect(instantanea(escenario, 180).porcentajeCenso).toBeLessThan(0.99);
    expect(minutosHastaCompleto(escenario)).toBeLessThan(420);
  });
});

describe('semilla y orden de llegada', () => {
  const huella = (semilla: number, orden: 'aleatorio' | 'rurales-primero' | 'urbanos-primero') =>
    instantanea(crearEscenario(municipios2023, { semilla, orden }), 90);

  it('misma semilla, misma noche', () => {
    expect(huella(11, 'aleatorio')).toEqual(huella(11, 'aleatorio'));
  });

  it('otra semilla, otra noche', () => {
    expect(huella(11, 'aleatorio')).not.toEqual(huella(12, 'aleatorio'));
  });

  it('el orden cambia lo que se ve a mitad de la noche', () => {
    expect(huella(11, 'rurales-primero')).not.toEqual(huella(11, 'urbanos-primero'));
  });

  it('rurales-primero cuenta primero los municipios pequeños; urbanos-primero, los grandes', () => {
    // Una provincia con un municipio grande y cuatro pequeños, 10 mesas el grande.
    const lista = [
      muni('28', 10, 1000, { A: 600, B: 300 }, 10),
      muni('28', 1, 10, { A: 5, B: 3 }),
      muni('28', 1, 20, { A: 8, B: 8 }),
      muni('28', 1, 30, { A: 12, B: 10 }),
      muni('28', 1, 40, { A: 20, B: 10 }),
    ];
    const comun = { curva: CURVA_EXPONENCIAL, ruidoOrden: 0 };
    const t = minutosPara(0.15); // 15 % de 1.100 = 165 electores

    const rurales = instantanea(crearEscenario(lista, { ...comun, orden: 'rurales-primero' }), t).escrutinios[0];
    // Los cuatro pequeños suman 100 electores; los 65 que faltan hasta 165 no completan ninguna mesa del grande (100 cada una).
    expect(rurales?.censoEscrutado).toBe(100);
    expect(votosDe(rurales as Escrutinio)).toEqual({ A: 45, B: 31 });

    const urbanos = instantanea(crearEscenario(lista, { ...comun, orden: 'urbanos-primero' }), t).escrutinios[0];
    // El grande va primero: 165 electores completan 1 de sus 10 mesas (100 electores, 60 votos a A, 30 a B, 1 blanco).
    expect(urbanos?.censoEscrutado).toBe(100);
    expect(votosDe(urbanos as Escrutinio)).toEqual({ A: 60, B: 30 });
    expect(urbanos?.blancos).toBe(1);
  });

  it('un municipio se cuenta mesa a mesa, sin perder ni inventar votos', () => {
    const una = [muni('01', 3, 10, { A: 7, B: 2 }, 1)];
    const escenario = crearEscenario(una, { curva: CURVA_EXPONENCIAL });
    // 3 mesas: tras 1 mesa, floor(10/3)=3 electores y floor(7/3)=2 votos; tras 2, 6 y 4; al acabar, todo.
    const censo = (f: number) => instantanea(escenario, minutosPara(f)).escrutinios[0]?.censoEscrutado;
    expect(censo(0.1)).toBeUndefined(); // 10 % de 10 = 1 elector: aún ninguna mesa completa
    expect(censo(0.4)).toBe(3);
    expect(censo(0.7)).toBe(6);
    const fin = instantaneaFinal(escenario).escrutinios[0] as Escrutinio;
    expect(fin.censoEscrutado).toBe(10);
    expect(votosDe(fin)).toEqual({ A: 7, B: 2 });
    expect(fin.blancos).toBe(1);
  });
});

describe('validación de entradas', () => {
  it('sin municipios no hay noche que simular', () => {
    expect(() => crearEscenario([])).toThrow(ErrorDatos);
  });

  it.each([
    ['lambda cero', { lambdaMin: 0 }],
    ['kappa negativa', { kappa: -1 }],
    ['rango de retraso invertido', { retrasoMin: [10, 5] as [number, number] }],
    ['velocidad nula', { velocidad: [0, 1] as [number, number] }],
  ])('rechaza una curva inválida: %s', (_nombre, curva) => {
    expect(() => crearEscenario([muni('01', 1, 10, { A: 5 })], { curva })).toThrow(ErrorDatos);
  });

  it('rechaza minutos inválidos', () => {
    const e = crearEscenario([muni('01', 1, 10, { A: 5 })]);
    expect(() => instantanea(e, -1)).toThrow(ErrorDatos);
    expect(() => instantanea(e, Number.NaN)).toThrow(ErrorDatos);
  });
});
