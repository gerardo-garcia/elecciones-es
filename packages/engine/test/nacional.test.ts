import { describe, expect, it } from 'vitest';
import circunscripcionesJson from '../../../data/config/circunscripciones.json';
import agrupacionesJson from '../../../data/config/agrupaciones.json';
import {
  calcularCircunscripcion,
  calcularNacional,
  crearAgrupador,
  type Circunscripcion,
  type Escrutinio,
  type GrupoConfig,
} from '../src';
import { crearAzar, entero } from './helpers';

const circunscripciones = circunscripcionesJson.circunscripciones as Circunscripcion[];
const agrupar = crearAgrupador(agrupacionesJson.grupos as GrupoConfig[]);

/** Escrutinio sintético y reproducible para las 52 circunscripciones. */
function escrutinioSintetico(c: Circunscripcion, azar: () => number, porcentajeCenso = 1): Escrutinio {
  const censo = entero(azar, 50_000, 5_000_000);
  const siglas = ['PSOE', 'PP', 'VOX', 'FA', 'PODEMOS', 'SALF', 'PSC', 'UPN-PP'];
  return {
    codigo: c.codigo,
    censo,
    censoEscrutado: Math.max(1, Math.round(censo * porcentajeCenso)),
    blancos: entero(azar, 100, 2_000),
    candidaturas: siglas.map((s) => ({ siglas: s, votos: entero(azar, 500, 40_000) })),
  };
}

describe('calcularNacional', () => {
  it('con las 52 circunscripciones escrutadas reparte exactamente 350 escaños', () => {
    const azar = crearAzar(2026);
    const resultados = circunscripciones.map((c) => calcularCircunscripcion(c, escrutinioSintetico(c, azar)));
    const nacional = calcularNacional(resultados, agrupar);

    expect(nacional.escanosAsignados).toBe(350);
    expect(nacional.escanosPendientes).toBe(0);
    expect(nacional.escanosTotales).toBe(350);
    expect(nacional.porCandidatura.reduce((s, c) => s + c.escanos, 0)).toBe(350);
    expect(nacional.porGrupo.reduce((s, g) => s + g.escanos, 0)).toBe(350);
  });

  it('cada circunscripción reparte exactamente sus escaños', () => {
    const azar = crearAzar(11);
    for (const c of circunscripciones) {
      const r = calcularCircunscripcion(c, escrutinioSintetico(c, azar, 0.4));
      expect(r.escanos.reduce((s, e) => s + e.escanos, 0), c.nombre).toBe(c.escanos);
    }
  });

  it('las circunscripciones sin datos cuentan como escaños pendientes', () => {
    const azar = crearAzar(5);
    const resultados = circunscripciones.map((c, i) =>
      calcularCircunscripcion(c, i % 2 === 0 ? escrutinioSintetico(c, azar) : null),
    );
    const pendientes = circunscripciones.filter((_, i) => i % 2 === 1).reduce((s, c) => s + c.escanos, 0);
    const nacional = calcularNacional(resultados, agrupar);

    expect(nacional.escanosPendientes).toBe(pendientes);
    expect(nacional.escanosAsignados + nacional.escanosPendientes).toBe(350);
  });

  it('suma por grupo las marcas territoriales del mismo partido', () => {
    // Barcelona la gana el PSC; Madrid, el PSOE; Sevilla, el PP. El grupo psoe suma PSC + PSOE.
    const mk = (codigo: string, votos: Record<string, number>): Escrutinio => ({
      codigo,
      censo: 1_000_000,
      censoEscrutado: 1_000_000,
      blancos: 0,
      candidaturas: Object.entries(votos).map(([siglas, v]) => ({ siglas, votos: v })),
    });
    const por = (codigo: string) => circunscripciones.find((c) => c.codigo === codigo) as Circunscripcion;
    const resultados = [
      calcularCircunscripcion(por('08'), mk('08', { PSC: 100_000, PP: 1_000 })),
      calcularCircunscripcion(por('28'), mk('28', { PSOE: 100_000, PP: 1_000 })),
      calcularCircunscripcion(por('41'), mk('41', { PP: 100_000, PSOE: 1_000 })),
    ];
    const nacional = calcularNacional(resultados, agrupar);

    const psoeCandidaturas = nacional.porCandidatura.filter((c) => c.siglas === 'PSC' || c.siglas === 'PSOE');
    expect(psoeCandidaturas.map((c) => c.siglas).sort()).toEqual(['PSC', 'PSOE']);

    const psoe = nacional.porGrupo.find((g) => g.id === 'psoe');
    const pp = nacional.porGrupo.find((g) => g.id === 'pp');
    // Con un solo gran partido por circunscripción y casi nada para el otro, el reparto es casi total.
    expect(psoe?.escanos).toBeGreaterThan(60);
    expect((psoe?.escanos ?? 0) + (pp?.escanos ?? 0)).toBe(32 + 38 + 12);
  });

  it('las siglas sin grupo aparecen por separado y marcadas como no agrupadas', () => {
    const c = circunscripciones.find((x) => x.codigo === '42') as Circunscripcion; // Soria (2)
    const r = calcularCircunscripcion(c, {
      codigo: '42',
      censo: 100_000,
      censoEscrutado: 100_000,
      blancos: 0,
      candidaturas: [
        { siglas: 'SY', votos: 30_000 },
        { siglas: 'PP', votos: 29_000 },
      ],
    });
    const nacional = calcularNacional([r], agrupar);
    expect(nacional.porGrupo.find((g) => g.id === 'sin-agrupar:SY')).toMatchObject({
      escanos: 1,
      agrupada: false,
    });
  });
});
