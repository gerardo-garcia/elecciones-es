import { repartirDHondt } from './dhondt';
import { validarEscrutinio, type ResultadoCircunscripcion } from './proyeccion';
import { ErrorDatos, type Escrutinio } from './tipos';
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
export interface RiesgoCera {
  /**
   * Votos CERA mínimos con los que podría cambiar el reparto, en el mejor caso para quien aspira
   * (todos a una sola candidatura y ninguno a las demás). Es una cota inferior: que haya tantos
   * votos CERA no implica que el reparto cambie, pero con menos es imposible.
   */
  votosNecesarios: number;
  /** Votos válidos CERA que se esperan (ver `estimarVotosCera`). */
  votosEsperados: number;
  /** votosNecesarios <= votosEsperados: el voto exterior podría decidirlo. */
  puedeDecidir: boolean;
}

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
  /**
   * Papel del voto CERA, que aún no está escrutado. null si ya está incluido en la proyección
   * o si no se ha pedido la estimación.
   */
  cera: RiesgoCera | null;
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
    cera: null,
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
      cera: null,
    };
  }
  return mejor;
}

/**
 * Votos CERA mínimos con los que el reparto de la circunscripción podría cambiar, o null si no hay
 * contendientes. Cota inferior rigurosa (se contrasta en los tests con datos reales de 2023 y con
 * escenarios aleatorios): supone que todos los votos CERA van a una sola candidatura.
 *
 *  - El último escaño lo tiene A (cociente c = vA/sA). Una candidatura k ≠ A solo se lo quita si
 *    (vk + N)/(sk+1) > c, es decir, N > vA·(sk+1)/sA − vk. Si k está bajo el 3 %, además necesita
 *    llegar a la barrera: vk + N ≥ 3 % · (V + N), es decir, N ≥ (3 % V − vk) / 0,97.
 *  - Una candidatura con escaños pierde todos si los votos CERA de otras la dejan bajo el 3 %:
 *    N > vk / 3 % − V.
 *
 * (V = votos válidos proyectados, sin CERA.) Ceuta y Melilla no tienen barrera.
 */
export function votosCeraNecesarios(r: ResultadoCircunscripcion): number | null {
  const { reparto, proyeccion, circunscripcion } = r;
  if (!reparto || !proyeccion || !(proyeccion.validos > 0)) return null;
  const n = circunscripcion.escanos;
  const proporcional = circunscripcion.tipo === 'proporcional';
  const V = proyeccion.validos;
  const umbral = UMBRAL_CONGRESO_PORCIENTO / 100;
  let minimo: number | null = null;
  const probar = (x: number) => {
    const v = Math.max(0, x);
    if (minimo === null || v < minimo) minimo = v;
  };

  const ultimo = reparto.clasificacion[n - 1];
  if (ultimo && reparto.adjudicados >= n) {
    const sA = reparto.escanos[ultimo.id] ?? 0;
    for (const k of proyeccion.candidaturas) {
      if (k.siglas === ultimo.id) continue;
      const sK = reparto.escanos[k.siglas] ?? 0;
      let necesarios = (ultimo.votos * (sK + 1)) / sA - k.votos;
      if (proporcional && !r.elegibles.includes(k.siglas)) {
        necesarios = Math.max(necesarios, (umbral * V - k.votos) / (1 - umbral));
      }
      probar(necesarios);
    }
  }
  if (proporcional) {
    for (const k of proyeccion.candidaturas) {
      if ((reparto.escanos[k.siglas] ?? 0) > 0) probar(k.votos / umbral - V);
    }
  }
  return minimo;
}

/**
 * La fila más cercana a cambiar en esa circunscripción, o null si no hay disputa posible.
 * Con `votosCeraEsperados` (votos válidos CERA que se esperan en esta circunscripción) añade el riesgo CERA.
 */
export function disputaCircunscripcion(
  r: ResultadoCircunscripcion,
  votosCeraEsperados?: number,
): FilaDisputa | null {
  if (r.estado === 'sin-datos') return null;
  const filas = [disputaPorEscano(r), disputaPorUmbral(r)].filter((f): f is FilaDisputa => f !== null);
  filas.sort((a, b) => a.porcentajeVotosAMover - b.porcentajeVotosAMover);
  const fila = filas[0];
  if (!fila) return null;
  if (r.ceraIncluido || votosCeraEsperados === undefined) return fila;
  const necesarios = votosCeraNecesarios(r);
  if (necesarios === null) return fila;
  return {
    ...fila,
    cera: { votosNecesarios: necesarios, votosEsperados: votosCeraEsperados, puedeDecidir: necesarios <= votosCeraEsperados },
  };
}

/**
 * Las `n` circunscripciones con menor porcentaje de votos a mover (por defecto, 10).
 * `ceraEsperados` (código de circunscripción → votos válidos CERA esperados) activa el riesgo CERA de cada fila.
 */
export function tablaDisputa(
  resultados: ResultadoCircunscripcion[],
  n = 10,
  ceraEsperados?: Record<string, number>,
): FilaDisputa[] {
  return resultados
    .map((r) => disputaCircunscripcion(r, ceraEsperados?.[r.circunscripcion.codigo]))
    .filter((f): f is FilaDisputa => f !== null)
    .sort((a, b) => a.porcentajeVotosAMover - b.porcentajeVotosAMover || (a.codigo < b.codigo ? -1 : 1))
    .slice(0, n);
}

/**
 * Por debajo de este porcentaje del censo NACIONAL escrutado (0,9 = 90 %), la tabla de disputa es provisional.
 *
 * La tabla no pretende recoger todos los cambios posibles, sino los más probables, para seguir la noche con
 * tensión (decisión del 24-nov-2026). Con poco escrutinio puede dejar fuera circunscripciones que acabarán cambiando,
 * y la web debe avisarlo mientras no se llegue a este umbral. Ver docs/metodologia.md.
 */
export const UMBRAL_TABLA_PROVISIONAL = 0.9;

/**
 * Censo escrutado en toda España, de 0 a 1.
 *
 * Si la fuente no lista las circunscripciones que aún no dan datos hay que pasar `censoNacional` (suma del censo
 * de las 52): sin él, el porcentaje saldría por exceso. Sin escrutinios ni censo nacional no hay nada que medir y
 * devuelve 0 (la tabla se considera provisional, que es el lado seguro).
 */
export function porcentajeCensoNacional(escrutinios: Escrutinio[], censoNacional?: number): number {
  let escrutado = 0;
  let censo = 0;
  for (const e of escrutinios) {
    validarEscrutinio(e);
    escrutado += e.censoEscrutado;
    censo += e.censo;
  }
  if (censoNacional === undefined && censo === 0) return 0;
  const total = censoNacional ?? censo;
  if (!(Number.isFinite(total) && total > 0)) throw new ErrorDatos(`Censo nacional inválido: ${total}`);
  if (total < censo) {
    throw new ErrorDatos(`El censo nacional (${total}) es menor que la suma del de las circunscripciones (${censo})`);
  }
  return escrutado / total;
}

/** true mientras el censo nacional escrutado (de 0 a 1) no llegue a `UMBRAL_TABLA_PROVISIONAL`. */
export function tablaProvisional(porcentajeCensoNacional: number): boolean {
  if (!(Number.isFinite(porcentajeCensoNacional) && porcentajeCensoNacional >= 0 && porcentajeCensoNacional <= 1)) {
    throw new ErrorDatos(`Porcentaje de censo nacional inválido: ${porcentajeCensoNacional}`);
  }
  return porcentajeCensoNacional < UMBRAL_TABLA_PROVISIONAL;
}
