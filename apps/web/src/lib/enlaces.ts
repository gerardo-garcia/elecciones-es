import { formatoFechaCorta, formatoMesYAnio } from './formato';

export type TipoEnlace = 'encuesta' | 'noticia' | 'oficial';

export interface Enlace {
  tipo: TipoEnlace;
  titulo: string;
  /** Periódico, instituto o web que lo publica. */
  medio: string;
  url: string;
  /**
   * Fecha de publicación: AAAA-MM-DD, o AAAA-MM si la fuente solo da el mes. Obligatoria en las encuestas y opcional
   * en el resto. Una fecha con solo el mes cuenta como el día 1 al ordenar y al comprobar que no es futura.
   */
  fecha?: string;
  /** Datos que ayudan a leerlo, p. ej. "Campo: 2–4 de noviembre · 2.000 entrevistas online". */
  detalle?: string;
}

const FECHA_COMPLETA = /^\d{4}-\d{2}-\d{2}$/;
const FECHA_MES = /^\d{4}-\d{2}$/;

/** "9 de noviembre" (AAAA-MM-DD) u "octubre de 2026" (AAAA-MM). Lanza si el formato no es válido. */
export function formatoFechaEnlace(fecha: string): string {
  if (FECHA_COMPLETA.test(fecha)) return formatoFechaCorta(`${fecha}T12:00:00+01:00`);
  if (FECHA_MES.test(fecha)) return formatoMesYAnio(`${fecha}-15T12:00:00+01:00`);
  throw new Error(`Fecha de enlace con formato inválido: ${fecha}`);
}

/** Línea de contexto de un enlace: "El País · 9 de noviembre · Campo: …". */
export function metaEnlace(e: Enlace): string {
  return [e.medio, e.fecha ? formatoFechaEnlace(e.fecha) : null, e.detalle].filter(Boolean).join(' · ');
}

/**
 * Enlaces que se pueden mostrar en un instante dado.
 *  - Durante la veda (LOREG art. 69.7) no se muestra ninguna encuesta.
 *  - No se muestra nada con fecha futura.
 *  - Orden: más recientes primero; los que no tienen fecha, al final.
 */
export function enlacesVisibles(enlaces: Enlace[], ahora: Date, veda: boolean, tipo?: TipoEnlace): Enlace[] {
  const hoy = ahora.toISOString().slice(0, 10);
  return enlaces
    .filter((e) => (tipo ? e.tipo === tipo : true))
    .filter((e) => !(veda && e.tipo === 'encuesta'))
    .filter((e) => !e.fecha || e.fecha <= hoy)
    .sort((a, b) => (b.fecha ?? '').localeCompare(a.fecha ?? ''));
}
