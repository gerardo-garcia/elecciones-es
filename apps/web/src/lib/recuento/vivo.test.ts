import { describe, expect, it } from 'vitest';
import definitivo from './fixtures/escrutinio-2023-definitivo.json';
import { antiguedadMinutos, ErrorFormato, esDe2026, leerDatosVivo, vistaDesdeVivo, type DatosVivo } from './vivo';
import { circunscripcionesDe2023 } from '../simulacion';
import { referenciasVivo } from './vivo-config';

const ref = referenciasVivo();
// Los escaños de 2026 no son los de 2023 (p. ej. Cádiz pierde uno): para comparar con el resultado oficial de 2023 se usan los de 2023.
const ref2023 = { ...ref, circunscripciones: circunscripcionesDe2023() };
const datos = (): DatosVivo => structuredClone(leerDatosVivo(definitivo));

describe('vistaDesdeVivo', () => {
  it('con el escrutinio completo de 2023 reproduce el reparto oficial', () => {
    const r = vistaDesdeVivo(datos(), ref2023);
    expect(r.descartadas).toEqual({});
    expect(r.estimado).toBe(false);
    expect(r.vista.escanosAsignados).toBe(350);
    expect(r.vista.porcentajeCensoNacional).toBeCloseTo(1, 6);
    // En cada circunscripción el reparto coincide con los escaños oficiales que publica la propia fuente.
    type ConEscanos = { codigo: string; candidaturas: { siglas: string; escanos: number }[] };
    for (const c of definitivo.circunscripciones as unknown as ConEscanos[]) {
      const oficial = Object.fromEntries(c.candidaturas.filter((x) => x.escanos > 0).map((x) => [x.siglas, x.escanos]));
      const propio = Object.fromEntries(r.vista.circunscripciones.find((v) => v.codigo === c.codigo)!.escanos.map((e) => [e.siglas, e.escanos]));
      expect(propio, c.codigo).toEqual(oficial);
    }
  });

  it('sin datos todas las circunscripciones quedan «sin datos» y el recuento a cero', () => {
    const r = vistaDesdeVivo(null, ref);
    expect(r.vista.escanosAsignados).toBe(0);
    expect(r.vista.porcentajeCensoNacional).toBe(0);
    expect(r.vista.circunscripciones.every((c) => c.estado === 'sin-datos')).toBe(true);
  });

  it('si la fuente no da el censo escrutado lo estima con la participación al cierre de esta elección y lo avisa', () => {
    const d = datos();
    for (const c of d.circunscripciones) {
      c.censoEscrutado = null;
      c.votantes = Math.round(c.votantes / 2);
      c.blancos = Math.round(c.blancos / 2);
      c.candidaturas = c.candidaturas.map((x) => ({ ...x, votos: Math.round(x.votos / 2) }));
    }
    const r = vistaDesdeVivo(d, ref);
    expect(r.estimado).toBe(true);
    // Con la mitad de los votos y la participación al cierre de la propia elección se estima en torno a la mitad del censo.
    expect(r.vista.porcentajeCensoNacional).toBeGreaterThan(0.4);
    expect(r.vista.porcentajeCensoNacional).toBeLessThan(0.6);
    expect(r.vista.escanosAsignados).toBe(350);
  });

  it('una circunscripción sin votos escrutados aún no cuenta; una desconocida o inválida se descarta con motivo', () => {
    const d = datos();
    d.circunscripciones[0]!.votantes = 0;
    d.circunscripciones[1]!.codigo = '99';
    d.circunscripciones[2]!.candidaturas = [{ siglas: 'PP', votos: 5 }, { siglas: 'PP', votos: 6 }]; // duplicada
    const r = vistaDesdeVivo(d, ref);
    expect(r.vista.circunscripciones.find((c) => c.codigo === d.circunscripciones[0]!.codigo)?.estado).toBe('sin-datos');
    expect(r.descartadas['99']).toMatch(/desconocida/);
    expect(Object.keys(r.descartadas)).toHaveLength(2);
    expect(r.vista.circunscripciones).toHaveLength(52);
  });

  it('sin censo de las mesas o sin participación al cierre dice que no hay datos y no usa otra elección', () => {
    const sinMesas = datos();
    for (const c of sinMesas.circunscripciones) c.censoMesas = null;
    const a = vistaDesdeVivo(sinMesas, ref);
    expect(Object.keys(a.descartadas)).toHaveLength(52);
    expect(a.vista.escanosAsignados).toBe(0);
    expect(a.vista.porcentajeCensoNacional).toBe(0);

    const sinCierre = datos();
    for (const c of sinCierre.circunscripciones) {
      c.censoEscrutado = null;
      c.votantesCierre = null;
    }
    const b = vistaDesdeVivo(sinCierre, ref);
    expect(Object.values(b.descartadas).every((m) => /participación al cierre/.test(m))).toBe(true);
    expect(b.vista.escanosAsignados).toBe(0);
    expect(b.estimado).toBe(false);
  });

  it('el censo escrutado no puede superar el de las mesas (se recorta)', () => {
    const d = datos();
    d.circunscripciones[0]!.censoEscrutado = d.circunscripciones[0]!.censo * 3;
    const r = vistaDesdeVivo(d, ref);
    expect(r.descartadas).toEqual({});
  });
});

describe('leerDatosVivo', () => {
  it('rechaza lo que no es el formato esperado', () => {
    expect(() => leerDatosVivo(null)).toThrow(ErrorFormato);
    expect(() => leerDatosVivo({ version: 2 })).toThrow(/Versión/);
    expect(() => leerDatosVivo({ version: 1, capturadoEn: 'ayer', circunscripciones: [] })).toThrow(/hora/);
    expect(() => leerDatosVivo({ version: 1, capturadoEn: '2026-11-29T20:00:00Z' })).toThrow(/circunscripciones/);
    expect(() => leerDatosVivo({ version: 1, capturadoEn: '2026-11-29T20:00:00Z', circunscripciones: [] })).toThrow(/convocatoria/);
  });
  it('mide la antigüedad del dato', () => {
    const d = leerDatosVivo({ version: 1, capturadoEn: '2026-11-29T20:00:00Z', convocatoria: { tipo: 2, id: '202611' }, circunscripciones: [] });
    expect(antiguedadMinutos(d, Date.parse('2026-11-29T20:12:00Z'))).toBe(12);
    expect(antiguedadMinutos(d, Date.parse('2026-11-29T19:00:00Z'))).toBe(0);
  });
});

describe('esDe2026', () => {
  const con = (tipo: number, id: string) => leerDatosVivo({ version: 1, capturadoEn: '2026-11-29T20:00:00Z', convocatoria: { tipo, id }, circunscripciones: [] });
  it('solo acepta el Congreso de 2026: un ensayo con 2023 nunca pasa por escrutinio de 2026', () => {
    expect(esDe2026(con(2, '202611'))).toBe(true);
    expect(esDe2026(con(2, '202307'))).toBe(false);
    expect(esDe2026(con(3, '202611'))).toBe(false);
    expect(esDe2026(leerDatosVivo(definitivo))).toBe(false); // el fixture es el ensayo de 2023
  });
});
