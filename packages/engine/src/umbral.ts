/** Barrera del Congreso: 3 % de los votos válidos de la circunscripción (blancos incluidos). */
export const UMBRAL_CONGRESO_PORCIENTO = 3;

/**
 * ¿Alcanza la candidatura "al menos" el umbral de votos válidos?
 * `validos` incluye los votos en blanco. Se compara `votos * 100 >= validos * porCiento`
 * para no depender de decimales (exacto con enteros).
 */
export function superaBarrera(
  votos: number,
  validos: number,
  porCiento: number = UMBRAL_CONGRESO_PORCIENTO,
): boolean {
  if (!(validos > 0)) return false;
  return votos * 100 >= validos * porCiento;
}
