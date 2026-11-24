import { describe, expect, it } from 'vitest';
import agrupacionesJson from '../../../data/config/agrupaciones.json';
import ceraJson from '../../../data/config/cera-2023.json';
import { circunscripciones2023, municipios2023 } from './datos2023';
import { circ } from './helpers';
import {
  calcularCircunscripcion,
  calcularNacional,
  construirTablaDisputa,
  construirVista,
  crearAgrupador,
  crearEscenario,
  estimarVotosCera,
  instantanea,
  instantaneaFinal,
  proyectarInstantanea,
  type ConfigCera,
  type Escrutinio,
  type GrupoConfig,
} from '../src';

const agrupador = crearAgrupador(agrupacionesJson.grupos as GrupoConfig[]);

const escrutinio = (codigo: string, censo: number, censoEscrutado: number, votos: Record<string, number>, blancos = 0): Escrutinio => ({
  codigo,
  censo,
  censoEscrutado,
  blancos,
  candidaturas: Object.entries(votos).map(([siglas, v]) => ({ siglas, votos: v })),
});

describe('construirVista (a mano)', () => {
  // 01: 3 escaños, recuento a medias; 02: 2 escaños, completo; 03: 5 escaños, sin datos.
  const c1 = circ('01', 3);
  const c2 = circ('02', 2);
  const c3 = circ('03', 5);
  const resultados = [
    calcularCircunscripcion(c1, escrutinio('01', 1_000, 500, { PP: 300, PSOE: 150, VOX: 40 }, 10)),
    calcularCircunscripcion(c2, escrutinio('02', 400, 400, { PSOE: 120, PSC: 110, PP: 150, VOX: 20 })),
    calcularCircunscripcion(c3, null),
  ];
  const vista = construirVista(resultados, { agrupador, porcentajeCensoNacional: 0.4 });

  it('resume los escaños asignados y los pendientes', () => {
    expect(vista).toMatchObject({ porcentajeCensoNacional: 0.4, escanosAsignados: 5, escanosPendientes: 5, escanosTotales: 10 });
  });

  it('coincide con el cálculo nacional y con la tabla de disputa', () => {
    const nacional = calcularNacional(resultados, agrupador);
    expect(vista.grupos).toEqual(nacional.porGrupo);
    expect(vista.formaciones.map((f) => [f.siglas, f.escanos])).toEqual(nacional.porCandidatura.map((c) => [c.siglas, c.escanos]));
    expect(vista.tabla).toEqual(construirTablaDisputa(resultados, { porcentajeEscrutadoGlobal: 0.4 }));
  });

  it('cada formación lleva el grupo que le da el color (PSC y PSOE comparten grupo)', () => {
    // 4 escaños: PP 2, PSOE 1 y PSC 1.
    const r = calcularCircunscripcion(circ('04', 4), escrutinio('04', 400, 400, { PP: 150, PSOE: 120, PSC: 110, VOX: 20 }));
    const v = construirVista([r], { agrupador, porcentajeCensoNacional: 1 });
    const grupo = (siglas: string) => v.formaciones.find((f) => f.siglas === siglas)?.grupoId;
    expect(v.formaciones.map((f) => [f.siglas, f.escanos])).toEqual([['PP', 2], ['PSC', 1], ['PSOE', 1]]);
    expect(grupo('PSC')).toBe('psoe');
    expect(grupo('PSOE')).toBe('psoe');
    expect(grupo('PP')).toBe('pp');
    expect(v.circunscripciones[0]?.escanos.map((e) => e.grupoId)).toEqual(['pp', 'psoe', 'psoe']);
  });

  it('describe cada circunscripción, también las que aún no dan datos', () => {
    expect(vista.circunscripciones.map((c) => [c.codigo, c.estado, c.porcentajeCenso, c.escanosTotales])).toEqual([
      ['01', 'parcial', 0.5, 3],
      ['02', 'completo', 1, 2],
      ['03', 'sin-datos', 0, 5],
    ]);
    const sinDatos = vista.circunscripciones[2];
    expect(sinDatos).toMatchObject({ escanos: [], ganador: null });
  });

  it('el ganador es el grupo más votado, no la candidatura más votada ni la de más escaños', () => {
    // En 02 (2 escaños) PP es la candidatura más votada (150) y reparte un escaño con PSOE (120), pero PSOE y PSC son el
    // mismo grupo y suman 230: el grupo socialista gana la circunscripción.
    const g = vista.circunscripciones[1]?.ganador;
    expect(g?.grupoId).toBe(agrupador('PSOE').id);
    expect(g?.porcentajeVotos).toBeCloseTo(230 / 400, 9);
    expect(vista.circunscripciones[0]?.ganador).toMatchObject({ grupoId: agrupador('PP').id });
  });

  it('es un objeto plano: sobrevive a JSON sin perder nada', () => {
    expect(JSON.parse(JSON.stringify(vista))).toEqual(vista);
  });

  it('respeta el número de filas de la tabla y pasa el voto exterior esperado', () => {
    expect(construirVista(resultados, { agrupador, porcentajeCensoNacional: 0.4, filasTabla: 1 }).tabla.filas).toHaveLength(1);
    const conCera = construirVista(resultados, { agrupador, porcentajeCensoNacional: 0.4, ceraEsperados: { '02': 1_000_000 } });
    expect(conCera.tabla.filas.find((f) => f.codigo === '02')?.vuelco?.votosPendientes).toBe(1_000_000);
  });
});

describe('construirVista sobre la simulación de 2023', () => {
  const escenario = crearEscenario(municipios2023, { semilla: 7 });
  const cera = estimarVotosCera(ceraJson as unknown as ConfigCera, Object.values((ceraJson as unknown as ConfigCera).circunscripciones).reduce((s, c) => s + c.censoCera, 0));
  const vistaEn = (minutos: number | 'final') => {
    const inst = minutos === 'final' ? instantaneaFinal(escenario) : instantanea(escenario, minutos);
    return construirVista(proyectarInstantanea(circunscripciones2023, inst), {
      agrupador,
      porcentajeCensoNacional: inst.porcentajeCenso,
      ceraEsperados: cera,
    });
  };

  it('al cerrar los colegios no hay datos: todo pendiente y tabla vacía (sin avisos)', () => {
    const v = vistaEn(0);
    expect(v).toMatchObject({ porcentajeCensoNacional: 0, escanosAsignados: 0, escanosPendientes: 350 });
    expect(v.tabla).toMatchObject({ estado: 'normal', filas: [] });
    expect(v.circunscripciones).toHaveLength(52);
  });

  it('en cualquier momento asignados + pendientes = 350 y los sectores suman lo asignado', () => {
    for (const minutos of [20, 60, 90, 120, 180, 240]) {
      const v = vistaEn(minutos);
      expect(v.escanosAsignados + v.escanosPendientes, `minuto ${minutos}`).toBe(350);
      expect(v.formaciones.reduce((s, f) => s + f.escanos, 0)).toBe(v.escanosAsignados);
      expect(v.grupos.reduce((s, g) => s + g.escanos, 0)).toBe(v.escanosAsignados);
      expect(v.circunscripciones.reduce((s, c) => s + c.escanos.reduce((a, e) => a + e.escanos, 0), 0)).toBe(v.escanosAsignados);
    }
  });

  it('con el recuento residente completo hay 350 escaños y el ganador de cada circunscripción es el más votado', () => {
    const v = vistaEn('final');
    expect(v).toMatchObject({ porcentajeCensoNacional: 1, escanosAsignados: 350, escanosPendientes: 0 });
    for (const c of v.circunscripciones) {
      expect(c.estado).toBe('completo');
      expect(c.ganador, c.nombre).not.toBeNull();
      // El grupo más votado nunca tiene menos escaños que otro (D'Hondt es monótono): sin empates a perder.
      const escanosDe = (id: string) => c.escanos.filter((e) => e.grupoId === id).reduce((s, e) => s + e.escanos, 0);
      const maximo = Math.max(...c.escanos.map((e) => escanosDe(e.grupoId)));
      expect(escanosDe(c.ganador?.grupoId ?? ''), c.nombre).toBe(maximo);
    }
  });
});
