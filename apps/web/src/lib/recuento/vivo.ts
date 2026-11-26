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
  /** Censo de las mesas escrutadas, si la fuente lo da (null si no). */
  censoEscrutado: number | null;
  votantes: number;
  blancos: number;
  candidaturas: { siglas: string; votos: number }[];
}

export interface DatosVivo {
  version: number;
  capturadoEn: string;
  definitivo: boolean;
  completa: boolean;
  fuente?: string;
  circunscripciones: CircunscripcionVivo[];
}

export interface ReferenciasVivo {
  circunscripciones: Circunscripcion[];
  /** Censo del voto exterior (CERA) por circunscripción: se resta del censo total para tener el de las mesas. */
  censoCera: Record<string, number>;
  /** Participación de la elección anterior por circunscripción (votantes / electores): estima el censo escrutado. */
  participacionReferencia: Record<string, number>;
  agrupador: Agrupador;
  ceraEsperados?: Record<string, number>;
}

export interface ResultadoVivo {
  vista: VistaRecuento;
  /** true si el censo escrutado de alguna circunscripción se ha estimado (la fuente no lo da). */
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
  return { ...(d as DatosVivo), definitivo: Boolean(d.definitivo), completa: Boolean(d.completa) };
}

export function vistaDesdeVivo(datos: DatosVivo | null, ref: ReferenciasVivo): ResultadoVivo {
  const escrutinios: Escrutinio[] = [];
  const descartadas: Record<string, string> = {};
  let estimado = false;
  const censoMesas: Record<string, number> = {};
  for (const c of ref.circunscripciones) censoMesas[c.codigo] = Number.NaN;

  for (const c of datos?.circunscripciones ?? []) {
    const cera = ref.censoCera[c.codigo];
    if (cera === undefined) {
      descartadas[c.codigo] = 'circunscripción desconocida';
      continue;
    }
    const censo = c.censo - cera;
    censoMesas[c.codigo] = censo;
    if (!(c.votantes > 0)) continue; // todavía sin votos escrutados
    let escrutado = c.censoEscrutado;
    if (escrutado === null || escrutado === undefined) {
      const p = ref.participacionReferencia[c.codigo];
      if (!(p && p > 0)) {
        descartadas[c.codigo] = 'no hay censo escrutado ni participación de referencia para estimarlo';
        continue;
      }
      escrutado = c.votantes / p;
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

  const total = ref.circunscripciones.reduce((s, c) => s + (Number.isNaN(censoMesas[c.codigo]) ? 0 : (censoMesas[c.codigo] as number)), 0);
  const hechos = escrutinios.reduce((s, e) => s + e.censoEscrutado, 0);
  const resultados = proyectarInstantanea(ref.circunscripciones, { minutos: 0, porcentajeCenso: 0, escrutinios });
  const vista = construirVista(resultados, {
    agrupador: ref.agrupador,
    porcentajeCensoNacional: total > 0 ? hechos / total : 0,
    ...(ref.ceraEsperados ? { ceraEsperados: ref.ceraEsperados } : {}),
  });
  return { vista, estimado, descartadas };
}

/** Minutos que hace del dato respecto a `ahora`, para avisar de que está desactualizado. */
export function antiguedadMinutos(datos: DatosVivo, ahora: number): number {
  return Math.max(0, (ahora - Date.parse(datos.capturadoEn)) / 60_000);
}
