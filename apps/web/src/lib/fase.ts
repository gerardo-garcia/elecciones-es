/**
 * Lógica de fases de la portada. Pura: recibe la fecha, no la lee.
 * Se usa igual en el build (Astro) y en el navegador (script de cliente).
 */

export type Fase = 'previa' | 'recuento' | 'analisis';

export interface Calendario {
  /** Domingo de votación (informativo). */
  votacion: string;
  /** Desde cuándo la portada muestra el recuento: el cierre de colegios. */
  inicioRecuento: string;
  /** Cierre de colegios (20:00 hora peninsular). */
  cierreColegios: string;
  /**
   * Desde cuándo la portada muestra el análisis (recuento ya efectivo).
   * null = todavía no: se fija a mano cuando termine el recuento.
   */
  inicioAnalisis: string | null;
  /** Veda de encuestas (LOREG art. 69.7): [desde, hasta). */
  vedaEncuestas: { desde: string; hasta: string };
}

export const FASES: readonly Fase[] = ['previa', 'recuento', 'analisis'];

function instante(iso: string): number {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) throw new Error(`Fecha inválida en el calendario: ${iso}`);
  return t;
}

export function faseEn(ahora: Date, cal: Calendario): Fase {
  const t = ahora.getTime();
  if (cal.inicioAnalisis !== null && t >= instante(cal.inicioAnalisis)) return 'analisis';
  if (t >= instante(cal.inicioRecuento)) return 'recuento';
  return 'previa';
}

/** ¿Está prohibido publicar o enlazar encuestas en este instante? */
export function enVeda(ahora: Date, cal: Calendario): boolean {
  const t = ahora.getTime();
  return t >= instante(cal.vedaEncuestas.desde) && t < instante(cal.vedaEncuestas.hasta);
}

/** Valida el calendario: fechas legibles y en orden lógico. Lanza si algo no cuadra. */
export function validarCalendario(cal: Calendario): void {
  const inicio = instante(cal.inicioRecuento);
  const cierre = instante(cal.cierreColegios);
  const vedaDesde = instante(cal.vedaEncuestas.desde);
  const vedaHasta = instante(cal.vedaEncuestas.hasta);
  if (!(vedaDesde < vedaHasta)) throw new Error('La veda de encuestas termina antes de empezar');
  if (!(inicio <= cierre)) throw new Error('El recuento empieza después del cierre de colegios');
  if (cal.inicioAnalisis !== null && !(instante(cal.inicioAnalisis) > cierre)) {
    throw new Error('El análisis no puede empezar antes del cierre de colegios');
  }
}
