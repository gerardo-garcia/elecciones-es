import { describe, expect, it } from 'vitest';
import {
  ELECCIONES_HISTORICAS,
  agrupadorDe,
  eleccionHistorica,
  fichaDe,
  resultadosDe,
  verificarEscanos,
  vistaDe,
  votosPorGrupo,
} from './historico';

/** Escaños por grupo que dio el escrutinio oficial (Congreso de los Diputados), con las agrupaciones de agrupaciones.json. */
const OFICIAL: Record<string, Record<string, number>> = {
  'generales-2023-07': { pp: 137, psoe: 121, vox: 33, sumar: 31, erc: 7, junts: 7, 'eh-bildu': 6, pnv: 5, bng: 1, cc: 1, 'sin-agrupar:UPN': 1 },
  'generales-2019-11': {
    psoe: 120,
    pp: 89,
    vox: 52,
    'unidas-podemos': 35,
    erc: 13,
    cs: 10,
    junts: 8,
    pnv: 6,
    'eh-bildu': 5,
    'mas-pais': 2,
    'sin-agrupar:CUPPR': 2,
    'navarra-suma': 2,
    'cc-nc': 2,
    compromis: 1,
    bng: 1,
    'sin-agrupar:PRC': 1,
    'sin-agrupar:TERUELEXISTE': 1,
  },
  'generales-2019-04': {
    psoe: 123,
    pp: 66,
    cs: 57,
    'unidas-podemos': 42,
    vox: 24,
    erc: 15,
    junts: 7,
    pnv: 6,
    'eh-bildu': 4,
    'navarra-suma': 2,
    cc: 2,
    compromis: 1,
    'sin-agrupar:PRC': 1,
  },
};
/** Participación oficial (votantes / censo electoral, con el voto exterior), en %. */
const PARTICIPACION: Record<string, number> = { 'generales-2023-07': 66.59, 'generales-2019-11': 66.23, 'generales-2019-04': 71.76 };

describe('histórico: las tres últimas elecciones generales', () => {
  it('están de la más reciente a la más antigua, con su fecha en español', () => {
    expect(ELECCIONES_HISTORICAS.map((e) => e.id)).toEqual(['generales-2023-07', 'generales-2019-11', 'generales-2019-04']);
    expect(ELECCIONES_HISTORICAS.map((e) => e.fechaLarga)).toEqual(['23 de julio de 2023', '10 de noviembre de 2019', '28 de abril de 2019']);
    expect(eleccionHistorica('generales-2023-07').titulo).toBe('Elecciones generales del 23 de julio de 2023');
    expect(() => eleccionHistorica('no-existe')).toThrow(/no-existe/);
  });

  for (const e of ELECCIONES_HISTORICAS) {
    describe(e.titulo, () => {
      it('el motor reparte los escaños de las 52 circunscripciones exactamente como el escrutinio oficial', () => {
        expect(e.datos.circunscripciones).toHaveLength(52);
        const resultados = resultadosDe(e.datos);
        expect(() => verificarEscanos(e.datos, resultados)).not.toThrow();
        expect(resultados.reduce((s, r) => s + r.circunscripcion.escanos, 0)).toBe(350);
        // Todo el censo está escrutado (los datos son definitivos): no hay extrapolación.
        for (const r of resultados) expect(r).toMatchObject({ estado: 'completo', porcentajeCenso: 1, factor: 1 });
      });

      it('los escaños por grupo son los oficiales', () => {
        const vista = vistaDe(e);
        const porGrupo = Object.fromEntries(vista.grupos.filter((g) => g.escanos > 0).map((g) => [g.id, g.escanos]));
        expect(porGrupo).toEqual(OFICIAL[e.id]);
        expect(vista).toMatchObject({ escanosTotales: 350, escanosAsignados: 350, escanosPendientes: 0, porcentajeCensoNacional: 1 });
      });

      it('la participación es la oficial', () => {
        expect(fichaDe(e.datos).participacion * 100).toBeCloseTo(PARTICIPACION[e.id] as number, 1);
      });

      it('la tabla muestra las 10 circunscripciones más ajustadas, de menos a más votos, aunque el recuento esté cerrado', () => {
        const { tabla } = vistaDe(e);
        expect(tabla).toMatchObject({ estado: 'normal', total: 52, sinOpcionDeVuelco: [] });
        expect(tabla.filas).toHaveLength(10);
        for (let i = 1; i < tabla.filas.length; i++) {
          expect(tabla.filas[i]?.porcentajeVotosAMover).toBeGreaterThanOrEqual(tabla.filas[i - 1]?.porcentajeVotosAMover ?? 0);
        }
      });

      it('la tabla de votos suma los votos válidos y los 350 escaños, con los blancos al final', () => {
        const filas = votosPorGrupo(e.datos);
        const ficha = fichaDe(e.datos);
        expect(filas.reduce((s, f) => s + f.votos, 0)).toBe(ficha.validos);
        expect(filas.reduce((s, f) => s + f.escanos, 0)).toBe(350);
        expect(filas.reduce((s, f) => s + f.porcentaje, 0)).toBeCloseTo(1, 9);
        expect(filas.at(-1)).toMatchObject({ id: 'blanco', votos: ficha.blancos, escanos: 0 });
        // De más a menos escaños (las dos filas finales, «otras» y «blanco», no entran en el orden).
        const grupos = filas.filter((f) => f.id !== 'otras' && f.id !== 'blanco');
        for (let i = 1; i < grupos.length; i++) {
          expect(grupos[i]?.escanos).toBeLessThanOrEqual(grupos[i - 1]?.escanos ?? 0);
        }
      });
    });
  }

  it('verificarEscanos detecta un reparto que no coincide con el oficial', () => {
    const e = eleccionHistorica('generales-2023-07');
    const copia = structuredClone(e.datos);
    // Se le quita un escaño oficial a la primera candidatura con escaños de Madrid.
    const madrid = copia.circunscripciones.find((c) => c.codigo === '28');
    const fila = madrid?.candidaturas.find(([, , esc]) => esc > 0);
    if (!fila) throw new Error('Los datos de prueba no tienen escaños en Madrid');
    fila[2] -= 1;
    expect(() => verificarEscanos(copia)).toThrow(/Madrid/);
  });

  it('el agrupador del histórico suma las federaciones del PSOE y los territoriales de Unidas Podemos y Sumar', () => {
    const g = agrupadorDe(eleccionHistorica('generales-2019-11').datos);
    for (const s of ['PSOE', 'PSC', 'PSC-PSOE', 'PSE-EE (PSOE)', 'PSdeG-PSOE', 'PSIB-PSOE', 'PSN-PSOE']) expect(g(s).id).toBe('psoe');
    expect(g('ECP-GUANYEM').id).toBe('unidas-podemos');
    expect(g('PODEMOS-EUPV').id).toBe('unidas-podemos');
    expect(g('SUMAR - ECP').id).toBe('sumar');
    expect(g('SUMAR - COMPROMÍS').id).toBe('sumar');
    expect(g('PP-FORO')).toMatchObject({ id: 'pp', incluye: expect.stringContaining('FORO') });
    // Lo que no está en ningún grupo cuenta aparte.
    expect(g('PACMA')).toMatchObject({ id: 'sin-agrupar:PACMA', agrupada: false });
  });

  it('la nota «incluye» del PP (PP-FORO) solo sale en las elecciones en que se presentó esa coalición', () => {
    const nota = (id: string) => agrupadorDe(eleccionHistorica(id).datos)('PP').incluye;
    expect(nota('generales-2019-04')).toContain('PP-FORO');
    expect(nota('generales-2019-11')).toContain('PP-FORO');
    expect(nota('generales-2023-07')).toBeUndefined(); // en 2023 no hubo PP-FORO
    // Y la vista y la tabla de votos de 2023 no la llevan.
    const grupoPP = vistaDe(eleccionHistorica('generales-2023-07')).grupos.find((g) => g.id === 'pp');
    expect(grupoPP?.incluye).toBeUndefined();
    expect(votosPorGrupo(eleccionHistorica('generales-2023-07').datos).find((f) => f.id === 'pp')?.incluye).toBeUndefined();
    // Las notas de Unidas Podemos (2019) y de Sumar (2023) no dependen de esto.
    expect(vistaDe(eleccionHistorica('generales-2019-04')).grupos.find((g) => g.id === 'unidas-podemos')?.incluye).toBeDefined();
    expect(vistaDe(eleccionHistorica('generales-2023-07')).grupos.find((g) => g.id === 'sumar')?.incluye).toBeDefined();
  });
});
