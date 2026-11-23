import { CALENDARIO } from './calendario';
import { enVeda, faseEn, type Fase } from './fase';

export interface Contexto {
  ahora: Date;
  fase: Fase;
  veda: boolean;
}

/**
 * Momento con el que se construye la página.
 * AHORA_FORZADA (ISO 8601) permite previsualizar cualquier instante: AHORA_FORZADA=2026-11-29T21:00:00+01:00 pnpm build
 */
export function contexto(): Contexto {
  const forzada = process.env.AHORA_FORZADA;
  const ahora = forzada ? new Date(forzada) : new Date();
  if (Number.isNaN(ahora.getTime())) throw new Error(`AHORA_FORZADA no es una fecha válida: ${forzada}`);
  return { ahora, fase: faseEn(ahora, CALENDARIO), veda: enVeda(ahora, CALENDARIO) };
}
