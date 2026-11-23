import { validarCalendario, type Calendario } from './fase';

/**
 * Calendario de las elecciones generales del 29N de 2026.
 * Fuentes: RD 806/2026 (BOE-A-2026-20742) y guía de La Moncloa del 06/11/2026.
 * Noviembre en España peninsular es CET (+01:00).
 */
export const CALENDARIO: Calendario = {
  votacion: '2026-11-29',
  // Día de reflexión (sábado 28). Decisión pendiente de confirmar: ver docs/metodologia.md.
  inicioRecuento: '2026-11-28T00:00:00+01:00',
  cierreColegios: '2026-11-29T20:00:00+01:00',
  // Se rellena a mano (p. ej. '2026-12-07T23:59:59+01:00') cuando el recuento sea efectivo.
  inicioAnalisis: null,
  // Cinco días antes de la votación; al ser domingo, empieza el martes 24. Termina al cierre de colegios.
  vedaEncuestas: {
    desde: '2026-11-24T00:00:00+01:00',
    hasta: '2026-11-29T20:00:00+01:00',
  },
};

validarCalendario(CALENDARIO);
