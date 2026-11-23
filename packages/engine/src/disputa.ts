import { repartirDHondt } from './dhondt';
import type { ResultadoCircunscripcion } from './proyeccion';
import { UMBRAL_CONGRESO_PORCIENTO } from './umbral';

/**
 * Circunscripciones donde un escaño puede cambiar de manos.
 *
 * Métrica: porcentaje de votos válidos que tendrían que cambiar de bando para que el reparto cambie.
 *
 *  - 'escano': A tiene el último escaño asignado (menor cociente adjudicado) y B es la mejor candidatura
 *    sin escaño distinta de A. Votos que deben pasar de A a B:
 *        x = [vA·(sB+1) − vB·sA] / (sA + sB + 1)
 *    (se obtiene de igualar vB+x / sB+1 con vA−x / sA). En Ceuta y Melilla (1 escaño) sale (vA−vB)/2.
 *  - 'umbral': candidatura P por debajo del 3 % que, al alcanzarlo, obtendría escaño. Votos que deben
 *    pasar a P desde las demás para llegar al 3 %. Se ignora cómo afecta ese trasvase al resto.
 *
 * Como se mide sobre votos válidos, el resultado no depende del factor de extrapolación.
 */
export interface FilaDisputa {
  codigo: string;
  nombre: string;
  tipo: 'escano' | 'umbral';
  /** Candidatura que perdería el escaño (null en 'umbral' si no hay un único perjudicado). */
  actual: string | null;
  aspirante: string;
  /** Votos (proyectados) que deben cambiar de bando. */
  votosAMover: number;
  /** votosAMover / votos válidos, de 0 a 1. */
  porcentajeVotosAMover: number;
  /** Censo escrutado de la circunscripción, de 0 a 1. */
  porcentajeCenso: number;
  /** El reparto actual ya depende de un sorteo. */
  empateSorteo: boolean;
}

/** Disputa por el último escaño entre A (lo tiene) y B (primero que se queda fuera). */
export function disputaPorEscano(r: ResultadoCircunscripcion): FilaDisputa | null {
  const { reparto, proyeccion, circunscripcion } = r;
  if (!reparto || !proyeccion || !(proyeccion.validos > 0)) return null;
  const n = circunscripcion.escanos;
  const ultimo = reparto.clasificacion[n - 1];
  if (!ultimo || reparto.adjudicados < n) return null;
  const aspirante = reparto.clasificacion.slice(n).find((c) => c.id !== ultimo.id);
  if (!aspirante) return null;

  const sA = reparto.escanos[ultimo.id] ?? 0;
  const sB = reparto.escanos[aspirante.id] ?? 0;
  const x = (ultimo.votos * (sB + 1) - aspirante.votos * sA) / (sA + sB + 1);

  return {
    codigo: circunscripcion.codigo,
    nombre: circunscripcion.nombre,
    tipo: 'escano',
    actual: ultimo.id,
    aspirante: aspirante.id,
    votosAMover: x,
    porcentajeVotosAMover: x / proyeccion.validos,
    porcentajeCenso: r.porcentajeCenso,
    empateSorteo: r.empateSorteo,
  };
}

/** Disputa por la barrera: la candidatura bajo el 3 % más cercana a alcanzarlo y que con ello tendría escaño. */
export function disputaPorUmbral(r: ResultadoCircunscripcion): FilaDisputa | null {
  const { reparto, proyeccion, circunscripcion } = r;
  if (circunscripcion.tipo !== 'proporcional' || !reparto || !proyeccion || !(proyeccion.validos > 0)) return null;
  const objetivo = (proyeccion.validos * UMBRAL_CONGRESO_PORCIENTO) / 100;
  const base = proyeccion.candidaturas.filter((c) => r.elegibles.includes(c.siglas));

  let mejor: FilaDisputa | null = null;
  for (const p of proyeccion.candidaturas) {
    if (r.elegibles.includes(p.siglas) || !(p.votos > 0)) continue;
    const x = objetivo - p.votos;
    if (mejor && x >= mejor.votosAMover) continue;

    const conP = repartirDHondt(
      [...base.map((c) => ({ id: c.siglas, votos: c.votos })), { id: p.siglas, votos: objetivo }],
      circunscripcion.escanos,
    );
    if ((conP.escanos[p.siglas] ?? 0) < 1) continue; // llegar al 3 % no le daría escaño

    const perjudicados = base.filter((c) => (conP.escanos[c.siglas] ?? 0) < (reparto.escanos[c.siglas] ?? 0));
    mejor = {
      codigo: circunscripcion.codigo,
      nombre: circunscripcion.nombre,
      tipo: 'umbral',
      actual: perjudicados.length === 1 ? (perjudicados[0]?.siglas ?? null) : null,
      aspirante: p.siglas,
      votosAMover: x,
      porcentajeVotosAMover: x / proyeccion.validos,
      porcentajeCenso: r.porcentajeCenso,
      empateSorteo: r.empateSorteo,
    };
  }
  return mejor;
}

/** La fila más cercana a cambiar en esa circunscripción, o null si no hay disputa posible. */
export function disputaCircunscripcion(r: ResultadoCircunscripcion): FilaDisputa | null {
  if (r.estado === 'sin-datos') return null;
  const filas = [disputaPorEscano(r), disputaPorUmbral(r)].filter((f): f is FilaDisputa => f !== null);
  filas.sort((a, b) => a.porcentajeVotosAMover - b.porcentajeVotosAMover);
  return filas[0] ?? null;
}

/** Las `n` circunscripciones con menor porcentaje de votos a mover (por defecto, 10). */
export function tablaDisputa(resultados: ResultadoCircunscripcion[], n = 10): FilaDisputa[] {
  return resultados
    .map(disputaCircunscripcion)
    .filter((f): f is FilaDisputa => f !== null)
    .sort((a, b) => a.porcentajeVotosAMover - b.porcentajeVotosAMover || (a.codigo < b.codigo ? -1 : 1))
    .slice(0, n);
}
