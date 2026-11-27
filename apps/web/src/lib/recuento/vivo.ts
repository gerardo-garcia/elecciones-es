import {
  construirVista,
  proyectarInstantanea,
  validarEscrutinio,
  type Agrupador,
  type Circunscripcion,
  type Escrutinio,
  type VistaRecuento,
} from '@elecciones/engine';

/**
 * Del fichero `escrutinio.json` que publica scripts/infoelectoral/publicar.py (Infoelectoral) a la vista del recuento.
 * Puro: lo usan el navegador (cada minuto) y el build (vista inicial vacía).
 */

export interface CircunscripcionVivo {
  codigo: string;
  actualizadoEn?: string;
  /** Censo total de la circunscripción, CERA incluido, tal como lo da Infoelectoral. */
  censo: number;
  /** Censo de las mesas (sin voto exterior), deducido por el conversor de la participación al cierre. */
  censoMesas?: number | null;
  /** Votantes al cierre de los colegios en esta elección (avance de participación). */
  votantesCierre?: number | null;
  /** Censo de las mesas escrutadas, si la fuente lo da (null si no). */
  censoEscrutado: number | null;
  votantes: number;
  blancos: number;
  candidaturas: { siglas: string; votos: number }[];
}

export interface DatosVivo {
  version: number;
  /** Convocatoria de Infoelectoral: tipo 2 = Congreso; id AAAAMM. */
  convocatoria: { tipo: number; id: string };
  capturadoEn: string;
  definitivo: boolean;
  completa: boolean;
  fuente?: string;
  circunscripciones: CircunscripcionVivo[];
}

export interface ReferenciasVivo {
  circunscripciones: Circunscripcion[];
  agrupador: Agrupador;
  ceraEsperados?: Record<string, number>;
}

export interface ResultadoVivo {
  vista: VistaRecuento;
  /** true si el censo escrutado de alguna circunscripción se ha estimado (la fuente no lo da) con la participación al cierre. */
  estimado: boolean;
  /** Circunscripciones cuyos datos no se han podido usar, con el motivo. */
  descartadas: Record<string, string>;
}

export class ErrorFormato extends Error {}

/** Comprueba lo mínimo del JSON recibido; lo que falte se avisa en vez de pintar algo inventado. */
export function leerDatosVivo(bruto: unknown): DatosVivo {
  const d = bruto as Partial<DatosVivo> | null;
  if (!d || typeof d !== 'object') throw new ErrorFormato('El fichero no es un objeto');
  if (d.version !== 1) throw new ErrorFormato(`Versión de formato no soportada: ${String(d.version)}`);
  if (typeof d.capturadoEn !== 'string' || Number.isNaN(Date.parse(d.capturadoEn))) throw new ErrorFormato('Falta la hora de captura');
  if (!Array.isArray(d.circunscripciones)) throw new ErrorFormato('Faltan las circunscripciones');
  const conv = d.convocatoria;
  if (!conv || typeof conv.id !== 'string' || typeof conv.tipo !== 'number') throw new ErrorFormato('Falta la convocatoria');
  return { ...(d as DatosVivo), definitivo: Boolean(d.definitivo), completa: Boolean(d.completa) };
}

export function vistaDesdeVivo(datos: DatosVivo | null, ref: ReferenciasVivo): ResultadoVivo {
  const escrutinios: Escrutinio[] = [];
  const descartadas: Record<string, string> = {};
  let estimado = false;
  const censoMesas: Record<string, number> = {};
  const conocidas = new Set(ref.circunscripciones.map((c) => c.codigo));

  // Solo se usan datos de esta elección. Lo que falte se descarta y se dice: nunca se rellena con otra elección.
  for (const c of datos?.circunscripciones ?? []) {
    if (!conocidas.has(c.codigo)) {
      descartadas[c.codigo] = 'circunscripción desconocida';
      continue;
    }
    if (!(c.votantes > 0)) continue; // todavía sin votos escrutados
    const censo = c.censoMesas;
    if (!(censo && censo > 0)) {
      descartadas[c.codigo] = 'la fuente aún no da el censo de las mesas (sin voto exterior)';
      continue;
    }
    censoMesas[c.codigo] = censo;
    let escrutado = c.censoEscrutado;
    if (escrutado === null || escrutado === undefined) {
      const cierre = c.votantesCierre;
      if (!(cierre && cierre > 0)) {
        descartadas[c.codigo] = 'la fuente aún no da ni el censo escrutado ni la participación al cierre';
        continue;
      }
      escrutado = (c.votantes * censo) / cierre; // votantes escrutados ÷ participación al cierre de esta elección
      estimado = true;
    }
    escrutado = Math.min(escrutado, censo);
    const e: Escrutinio = {
      codigo: c.codigo,
      censo,
      censoEscrutado: escrutado,
      blancos: c.blancos,
      candidaturas: c.candidaturas.filter((x) => x.votos > 0).map((x) => ({ siglas: x.siglas, votos: x.votos })),
    };
    try {
      validarEscrutinio(e);
    } catch (err) {
      descartadas[c.codigo] = (err as Error).message;
      continue;
    }
    escrutinios.push(e);
  }

  // Porcentaje del censo escrutado: solo sobre las circunscripciones de las que hay censo de las mesas.
  const total = Object.values(censoMesas).reduce((s, n) => s + n, 0);
  const hechos = escrutinios.reduce((s, e) => s + e.censoEscrutado, 0);
  const resultados = proyectarInstantanea(ref.circunscripciones, { minutos: 0, porcentajeCenso: 0, escrutinios });
  const vista = construirVista(resultados, {
    agrupador: ref.agrupador,
    porcentajeCensoNacional: total > 0 ? hechos / total : 0,
    ...(ref.ceraEsperados ? { ceraEsperados: ref.ceraEsperados } : {}),
  });
  return { vista, estimado, descartadas };
}

/**
 * Solo se muestran datos de las generales de 2026 (Congreso, convocatoria de 2026). Los ensayos con otras elecciones
 * (2023) nunca deben aparecer como escrutinio de 2026, aunque se hayan publicado en la misma rama.
 */
export function esDe2026(datos: DatosVivo): boolean {
  return datos.convocatoria.tipo === 2 && datos.convocatoria.id.startsWith('2026');
}

/** Minutos que hace del dato respecto a `ahora`, para avisar de que está desactualizado. */
export function antiguedadMinutos(datos: DatosVivo, ahora: number): number {
  return Math.max(0, (ahora - Date.parse(datos.capturadoEn)) / 60_000);
}
