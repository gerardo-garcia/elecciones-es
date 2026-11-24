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
  /**
   * ¿Pueden los votos aún sin contar cambiar el reparto? Lo rellena `disputaCircunscripcion`; null en las
   * funciones de más bajo nivel (`disputaPorEscano`, `disputaPorUmbral`).
   */
  vuelco: PosibilidadVuelco | null;
}

/**
 * Vuelco posible en una circunscripción: ¿pueden los votos que aún no se han contado cambiar su reparto?
 * Ver `posibilidadVuelco`.
 */
export interface PosibilidadVuelco {
  /**
   * Votos reales mínimos que tendrían que llegar para cambiar el reparto, en el mejor caso para quien aspira
   * (todos a una sola candidatura). null si no se puede acotar (no se descarta el vuelco).
   */
  votosNecesarios: number | null;
  /**
   * Máximo de votos que aún pueden llegar: los electores de las mesas sin escrutar (si todos votaran) más el voto
   * exterior esperado, mientras no esté escrutado.
   */
  votosPendientes: number;
  /** votosNecesarios <= votosPendientes (o no acotado): el reparto todavía puede cambiar. */
  puedeHaberVuelco: boolean;
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
    vuelco: null,
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
      vuelco: null,
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

const TOLERANCIA_RELATIVA = 1e-9;

/**
 * ¿Pueden los votos que aún no se han contado cambiar el reparto de la circunscripción?
 *
 * Compara los votos reales que harían falta con los que como mucho pueden llegar:
 *
 *  - Necesarios: los de `votosCeraNecesarios` (todos a una sola candidatura, la hipótesis más favorable al
 *    cambio), que está en votos proyectados; dividido por el factor de extrapolación son votos reales.
 *  - Pendientes: los electores de las mesas sin escrutar (`censo − censo escrutado`, como si todos votaran) más,
 *    mientras no esté escrutado, el voto exterior esperado (`votosCeraEsperados`: una estimación, ver
 *    `estimarVotosCera`, no una cota; sin él no se cuenta el CERA).
 *
 * Si los pendientes no llegan a los necesarios, el reparto actual ya no puede cambiar: la cota es rigurosa para el
 * voto residente (se contrasta en los tests con la simulación de 2023 y con escenarios aleatorios adversos). Con
 * los pendientes justos para el cambio, se considera que puede haberlo. Si no se puede acotar, tampoco se descarta.
 * Devuelve null si la circunscripción aún no tiene datos.
 *
 * Con el CERA ya sumado a una proyección incompleta es una aproximación (el CERA se escruta cuando el recuento
 * ya ha terminado, así que no ocurre en la práctica).
 */
export function posibilidadVuelco(r: ResultadoCircunscripcion, votosCeraEsperados = 0): PosibilidadVuelco | null {
  if (!(votosCeraEsperados >= 0)) throw new ErrorDatos(`Votos CERA esperados inválidos: ${votosCeraEsperados}`);
  if (r.estado === 'sin-datos' || r.censo === null || r.factor === null) return null;
  const enProyeccion = votosCeraNecesarios(r);
  const votosNecesarios = enProyeccion === null ? null : enProyeccion / r.factor;
  const votosPendientes = r.censo - r.censoEscrutado + (r.ceraIncluido ? 0 : votosCeraEsperados);
  const puedeHaberVuelco =
    votosNecesarios === null || votosNecesarios <= votosPendientes * (1 + TOLERANCIA_RELATIVA) + TOLERANCIA_RELATIVA;
  return { votosNecesarios, votosPendientes, puedeHaberVuelco };
}

/**
 * La fila más cercana a cambiar en esa circunscripción, o null si no hay disputa posible.
 * Con `votosCeraEsperados` (votos válidos CERA que se esperan en esta circunscripción) añade el riesgo CERA y los
 * cuenta entre los votos pendientes de `vuelco`.
 */
export function disputaCircunscripcion(
  r: ResultadoCircunscripcion,
  votosCeraEsperados?: number,
): FilaDisputa | null {
  if (r.estado === 'sin-datos') return null;
  const filas = [disputaPorEscano(r), disputaPorUmbral(r)].filter((f): f is FilaDisputa => f !== null);
  filas.sort((a, b) => a.porcentajeVotosAMover - b.porcentajeVotosAMover);
  const primera = filas[0];
  if (!primera) return null;
  const fila: FilaDisputa = { ...primera, vuelco: posibilidadVuelco(r, votosCeraEsperados) };
  if (r.ceraIncluido || votosCeraEsperados === undefined) return fila;
  const necesarios = votosCeraNecesarios(r);
  if (necesarios === null) return fila;
  return {
    ...fila,
    cera: { votosNecesarios: necesarios, votosEsperados: votosCeraEsperados, puedeDecidir: necesarios <= votosCeraEsperados },
  };
}

const porMenosVotosAMover = (a: FilaDisputa, b: FilaDisputa) =>
  a.porcentajeVotosAMover - b.porcentajeVotosAMover || (a.codigo < b.codigo ? -1 : 1);

/**
 * Las `n` circunscripciones con menor porcentaje de votos a mover (por defecto, 10), SIN descartar las que ya no
 * pueden cambiar. La tabla que se muestra es `construirTablaDisputa`.
 * `ceraEsperados` (código de circunscripción → votos válidos CERA esperados) activa el riesgo CERA de cada fila.
 */
export function rankingDisputa(
  resultados: ResultadoCircunscripcion[],
  n = 10,
  ceraEsperados?: Record<string, number>,
): FilaDisputa[] {
  return resultados
    .map((r) => disputaCircunscripcion(r, ceraEsperados?.[r.circunscripcion.codigo]))
    .filter((f): f is FilaDisputa => f !== null)
    .sort(porMenosVotosAMover)
    .slice(0, n);
}

/**
 * - `normal`: tabla de hasta `n` filas.
 * - `reducida`: ya hay circunscripciones donde no puede haber vuelco y quedan menos de `n` con opción (con 52
 *   circunscripciones y n = 10, más de 42 descartadas): la tabla tiene menos filas y hay que avisarlo.
 * - `sin-vuelco`: ninguna circunscripción puede ya cambiar de reparto: no se muestra la tabla, se avisa.
 */
export type EstadoTablaDisputa = 'normal' | 'reducida' | 'sin-vuelco';

export interface OpcionesTablaDisputa {
  /** Censo escrutado en toda España, de 0 a 1 (ver `porcentajeCensoNacional`): la tabla es «para el x % escrutado». */
  porcentajeEscrutadoGlobal: number;
  /** Filas como máximo (por defecto, 10). */
  n?: number;
  /** Votos válidos CERA esperados por circunscripción, mientras el voto exterior no esté escrutado. */
  ceraEsperados?: Record<string, number>;
}

export interface TablaDisputa {
  estado: EstadoTablaDisputa;
  /** Hasta `n` filas, de menos a más porcentaje de votos a mover. Vacía en `sin-vuelco` y mientras no haya datos. */
  filas: FilaDisputa[];
  /** Censo escrutado en toda España al que corresponde la tabla, de 0 a 1. */
  porcentajeEscrutadoGlobal: number;
  /** Filas máximas pedidas. */
  n: number;
  /** Total de circunscripciones evaluadas. */
  total: number;
  /** Códigos de las circunscripciones con datos donde los votos pendientes ya no bastan para cambiar el reparto. */
  sinOpcionDeVuelco: string[];
  /** Circunscripciones donde aún puede haber vuelco, o que todavía no dan datos para saberlo (total − descartadas). */
  conOpcionDeVuelco: number;
}

/**
 * Tabla de las circunscripciones donde un escaño puede cambiar de manos: las `n` con menos porcentaje de votos a
 * mover entre las que aún pueden tener vuelco (`posibilidadVuelco`). Las que ya no pueden se descartan, así que la
 * tabla se encoge y puede quedar vacía a medida que avanza el recuento.
 *
 * Una circunscripción que aún no da datos NO se descarta (no se sabe), así que al principio de la noche la tabla
 * tiene pocas filas pero no está `reducida`: ese estado solo lo provocan circunscripciones descartadas.
 */
export function construirTablaDisputa(resultados: ResultadoCircunscripcion[], opciones: OpcionesTablaDisputa): TablaDisputa {
  const { porcentajeEscrutadoGlobal, n = 10, ceraEsperados } = opciones;
  if (!(Number.isFinite(porcentajeEscrutadoGlobal) && porcentajeEscrutadoGlobal >= 0 && porcentajeEscrutadoGlobal <= 1)) {
    throw new ErrorDatos(`Porcentaje escrutado global inválido: ${porcentajeEscrutadoGlobal}`);
  }
  if (!Number.isInteger(n) || n < 1) throw new ErrorDatos(`Número de filas inválido: ${n}`);

  const sinOpcionDeVuelco: string[] = [];
  const candidatas: FilaDisputa[] = [];
  for (const r of resultados) {
    const codigo = r.circunscripcion.codigo;
    const esperados = ceraEsperados?.[codigo];
    const vuelco = posibilidadVuelco(r, esperados);
    if (vuelco && !vuelco.puedeHaberVuelco) {
      sinOpcionDeVuelco.push(codigo);
      continue;
    }
    const fila = disputaCircunscripcion(r, esperados);
    if (fila) candidatas.push(fila);
  }

  const total = resultados.length;
  const conOpcionDeVuelco = total - sinOpcionDeVuelco.length;
  const estado: EstadoTablaDisputa =
    total > 0 && conOpcionDeVuelco === 0
      ? 'sin-vuelco'
      : sinOpcionDeVuelco.length > 0 && conOpcionDeVuelco < n
        ? 'reducida'
        : 'normal';

  return {
    estado,
    filas: candidatas.sort(porMenosVotosAMover).slice(0, n),
    porcentajeEscrutadoGlobal,
    n,
    total,
    sinOpcionDeVuelco: sinOpcionDeVuelco.sort(),
    conOpcionDeVuelco,
  };
}

/**
 * Censo escrutado en toda España, de 0 a 1.
 *
 * Es el «x % escrutado global» que acompaña a la tabla de disputa. Si la fuente no lista las circunscripciones que
 * aún no dan datos hay que pasar `censoNacional` (suma del censo de las 52): sin él, el porcentaje saldría por exceso.
 * Sin escrutinios ni censo nacional no hay nada que medir y devuelve 0.
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
