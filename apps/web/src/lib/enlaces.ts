export type TipoEnlace = 'encuesta' | 'noticia' | 'oficial';

export interface Enlace {
  tipo: TipoEnlace;
  titulo: string;
  /** Periódico, instituto o web que lo publica. */
  medio: string;
  url: string;
  /** Fecha de publicación (AAAA-MM-DD). Opcional en los enlaces oficiales. */
  fecha?: string;
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
