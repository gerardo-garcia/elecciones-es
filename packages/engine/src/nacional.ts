import { normalizarSiglas, type Agrupador } from './agrupacion';
import type { ResultadoCircunscripcion } from './proyeccion';

export interface TotalCandidatura {
  /** Siglas normalizadas, para sumar entre circunscripciones. */
  clave: string;
  siglas: string;
  escanos: number;
}

export interface TotalGrupo {
  id: string;
  nombre: string;
  /** Qué partidos suma el grupo, si hay que decirlo en la leyenda. */
  incluye?: string;
  escanos: number;
  /** false: siglas sin grupo asignado (cuentan por separado). */
  agrupada: boolean;
}

export interface ResultadoNacional {
  /** Escaños ya repartidos (circunscripciones con algún dato). */
  escanosAsignados: number;
  /** Escaños de circunscripciones sin ningún dato todavía. */
  escanosPendientes: number;
  escanosTotales: number;
  /** Suma por candidatura, sin agrupar. */
  porCandidatura: TotalCandidatura[];
  /** Suma por grupo según el agrupador. */
  porGrupo: TotalGrupo[];
}

function ordenar<T extends { escanos: number }>(filas: T[], nombre: (f: T) => string): T[] {
  return filas.sort((a, b) => b.escanos - a.escanos || (nombre(a) < nombre(b) ? -1 : 1));
}

/** Suma los escaños de cada circunscripción: el resultado general sale de aquí. */
export function calcularNacional(
  resultados: ResultadoCircunscripcion[],
  agrupador: Agrupador,
): ResultadoNacional {
  const candidaturas = new Map<string, TotalCandidatura>();
  const grupos = new Map<string, TotalGrupo>();
  let escanosAsignados = 0;
  let escanosPendientes = 0;

  for (const r of resultados) {
    if (r.estado === 'sin-datos') {
      escanosPendientes += r.circunscripcion.escanos;
      continue;
    }
    for (const e of r.escanos) {
      escanosAsignados += e.escanos;

      const clave = normalizarSiglas(e.siglas);
      const c = candidaturas.get(clave) ?? { clave, siglas: e.siglas, escanos: 0 };
      c.escanos += e.escanos;
      candidaturas.set(clave, c);

      const a = agrupador(e.siglas);
      const g =
        grupos.get(a.id) ??
        (a.incluye === undefined
          ? { id: a.id, nombre: a.nombre, escanos: 0, agrupada: a.agrupada }
          : { id: a.id, nombre: a.nombre, incluye: a.incluye, escanos: 0, agrupada: a.agrupada });
      g.escanos += e.escanos;
      grupos.set(a.id, g);
    }
  }

  return {
    escanosAsignados,
    escanosPendientes,
    escanosTotales: escanosAsignados + escanosPendientes,
    porCandidatura: ordenar([...candidaturas.values()], (c) => c.siglas),
    porGrupo: ordenar([...grupos.values()], (g) => g.nombre),
  };
}
