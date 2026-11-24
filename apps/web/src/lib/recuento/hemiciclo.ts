import { esc, numero, r1 } from './html';

/**
 * Hemiciclo: los escaños dispuestos en arcos concéntricos, como en el Congreso. Función pura que devuelve el SVG;
 * sin grupos dibuja todos los escaños vacíos (gris), con grupos los colorea de izquierda a derecha.
 */

export interface GrupoHemiciclo {
  nombre: string;
  color: string;
  escanos: number;
}

export interface OpcionesHemiciclo {
  /** Escaños en total (350 en el Congreso). */
  total: number;
  /** Grupos, de izquierda a derecha. Lo que no cubran queda vacío. */
  grupos?: GrupoHemiciclo[];
  /** Número de arcos; por defecto, el que da una separación pareja entre escaños. */
  filas?: number;
  /** Escaños de la mayoría absoluta: si se indica se dibuja la línea central. */
  mayoria?: number;
  /** Texto para lectores de pantalla. Sin él, el dibujo es decorativo y los lectores lo ignoran. */
  etiqueta?: string;
}

export interface Escano {
  x: number;
  y: number;
}

/** Medidas del dibujo (unidades del viewBox). */
const RADIO = 200;
const RADIO_INTERIOR = 0.42 * RADIO;
const MARGEN = 7;
const CENTRO_X = RADIO + MARGEN;
const BASE_Y = RADIO + MARGEN;
/** Hueco por encima de los escaños para que arranque la línea de la mayoría. */
const HUECO_MAYORIA = 20;
export const ANCHO = 2 * CENTRO_X;
/** Alto de los escaños; con la línea de la mayoría el dibujo añade `HUECO_MAYORIA` por arriba. */
export const ALTO = BASE_Y + MARGEN;

/** Cuántos arcos hacen falta para que la separación entre filas y entre escaños de una fila sea parecida. */
export function filasPorDefecto(total: number): number {
  return Math.max(1, Math.round(Math.sqrt(total / 3.5)));
}

/**
 * Posición de cada escaño, ordenados de izquierda a derecha (y de fuera adentro a igual ángulo): así un grupo ocupa
 * una cuña continua. Cada arco tiene escaños en proporción a su radio.
 */
export function posicionesHemiciclo(total: number, filas = filasPorDefecto(total)): Escano[] {
  const radios = Array.from({ length: filas }, (_, j) =>
    filas === 1 ? RADIO : RADIO_INTERIOR + ((RADIO - RADIO_INTERIOR) * j) / (filas - 1),
  );
  const suma = radios.reduce((s, r) => s + r, 0);
  const porFila = radios.map((r) => Math.floor((total * r) / suma));
  // El reparto por defecto deja escaños sin colocar: se dan, de fuera adentro, a los arcos con más hueco.
  let faltan = total - porFila.reduce((s, n) => s + n, 0);
  for (let j = filas - 1; faltan > 0; j = j === 0 ? filas - 1 : j - 1, faltan--) porFila[j] = (porFila[j] as number) + 1;

  const escanos: (Escano & { angulo: number; radio: number })[] = [];
  radios.forEach((radio, j) => {
    const n = porFila[j] as number;
    for (let k = 0; k < n; k++) {
      const angulo = n === 1 ? Math.PI / 2 : (Math.PI * k) / (n - 1);
      escanos.push({ x: CENTRO_X - radio * Math.cos(angulo), y: BASE_Y - radio * Math.sin(angulo), angulo, radio });
    }
  });
  escanos.sort((a, b) => a.angulo - b.angulo || b.radio - a.radio);
  return escanos.map(({ x, y }) => ({ x, y }));
}

/** Un trazo con un punto redondo por escaño: una sola figura por color, no un círculo por escaño. */
function puntos(escanos: Escano[], color: string, diametro: number): string {
  if (escanos.length === 0) return '';
  const d = escanos.map((e) => `M${r1(e.x)} ${r1(e.y)}h0`).join('');
  return `<path d="${d}" stroke="${esc(color)}" stroke-width="${diametro}" stroke-linecap="round" fill="none"/>`;
}

export function renderHemiciclo({ total, grupos = [], filas, mayoria, etiqueta }: OpcionesHemiciclo): string {
  const posiciones = posicionesHemiciclo(total, filas);
  const n = filas ?? filasPorDefecto(total);
  const diametro = Math.round(((RADIO - RADIO_INTERIOR) / Math.max(n - 1, 1)) * 0.78 * 10) / 10;

  let desde = 0;
  const trazos: string[] = [];
  for (const g of grupos) {
    const hasta = Math.min(total, desde + g.escanos);
    trazos.push(puntos(posiciones.slice(desde, hasta), g.color, diametro));
    desde = hasta;
  }
  trazos.push(puntos(posiciones.slice(desde), 'var(--escano)', diametro));

  const arriba = mayoria === undefined ? 0 : HUECO_MAYORIA;
  const linea =
    mayoria === undefined
      ? ''
      : `<line x1="${CENTRO_X}" x2="${CENTRO_X}" y1="2" y2="${r1(arriba + BASE_Y - RADIO_INTERIOR + 8)}" stroke="currentColor" stroke-opacity=".5" stroke-width="1.2" stroke-dasharray="3 4"><title>Mayoría absoluta: ${esc(numero(mayoria))} escaños</title></line>`;
  const acceso = etiqueta === undefined ? 'aria-hidden="true"' : `role="img" aria-label="${esc(etiqueta)}"`;
  const escanos = arriba === 0 ? trazos.join('') : `<g transform="translate(0 ${arriba})">${trazos.join('')}</g>`;

  return `<svg class="hemiciclo" viewBox="0 0 ${ANCHO} ${ALTO + arriba}" ${acceso}>${linea}${escanos}</svg>`;
}
