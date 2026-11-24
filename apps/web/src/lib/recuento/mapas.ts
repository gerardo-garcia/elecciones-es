import type { VistaCircunscripcion, VistaRecuento } from '@elecciones/engine';
import mapaJson from '../../data/mapa-circunscripciones.json';
import { COLOR_SIN_DATOS, colorGrupo } from './colores';
import { esc, numero, porcentaje, r1 } from './html';
import { coloresFormaciones } from './sectores';

export interface MapaCircunscripcion {
  /** Trazo SVG de la circunscripción (una o varias figuras). */
  d: string;
  /** Punto interior donde colocar símbolos. */
  centro: [number, number];
  /** [x0, y0, x1, y1] */
  caja: [number, number, number, number];
}

export interface Mapa {
  ancho: number;
  alto: number;
  /** [x, y, ancho, alto] del recuadro de Canarias. */
  canarias: [number, number, number, number];
  circunscripciones: Record<string, MapaCircunscripcion>;
}

export const MAPA = mapaJson as unknown as Mapa;

/** Ceuta y Melilla miden unos pocos píxeles: se dibuja además un círculo para que se vean y se puedan señalar. */
const TAMANO_MINIMO = 14;
const RADIO_CIUDAD = 6;

const esMinuscula = (m: MapaCircunscripcion) => m.caja[2] - m.caja[0] < TAMANO_MINIMO && m.caja[3] - m.caja[1] < TAMANO_MINIMO;

function marco(mapa: Mapa): string {
  const [x, y, w, h] = mapa.canarias;
  return (
    `<rect x="${r1(x)}" y="${r1(y)}" width="${r1(w)}" height="${r1(h)}" fill="none" stroke="var(--borde)" stroke-width="1"/>` +
    `<text x="${r1(x + 8)}" y="${r1(y + 15)}" class="mapa-rotulo">Canarias</text>`
  );
}

const ROTULOS: Record<string, string> = { '51': 'Ceuta', '52': 'Melilla' };

function rotulosCiudades(vista: VistaRecuento, mapa: Mapa): string {
  return vista.circunscripciones
    .filter((c) => ROTULOS[c.codigo] && mapa.circunscripciones[c.codigo])
    .map((c) => {
      const [cx, cy] = (mapa.circunscripciones[c.codigo] as MapaCircunscripcion).centro;
      return `<text x="${r1(cx + RADIO_CIUDAD + 4)}" y="${r1(cy + 4)}" class="mapa-rotulo">${ROTULOS[c.codigo]}</text>`;
    })
    .join('');
}

function lienzo(mapa: Mapa, etiqueta: string, contenido: string): string {
  return `<svg class="mapa" viewBox="0 0 ${r1(mapa.ancho)} ${r1(mapa.alto)}" role="img" aria-label="${esc(etiqueta)}">${contenido}</svg>`;
}

const sinDatos = (c: VistaCircunscripcion) => c.estado === 'sin-datos';

/** Mapa coloreado según el grupo más votado de cada circunscripción. */
export function renderMapaGanador(vista: VistaRecuento, mapa: Mapa = MAPA): string {
  const trazos = vista.circunscripciones.flatMap((c) => {
    const m = mapa.circunscripciones[c.codigo];
    if (!m) return [];
    const color = c.ganador ? colorGrupo(c.ganador.grupoId) : COLOR_SIN_DATOS;
    const rotulo = c.ganador
      ? `${c.nombre}: gana ${c.ganador.nombre} (${porcentaje(c.ganador.porcentajeVotos)} de los votos). Escrutado: ${porcentaje(c.porcentajeCenso)}.`
      : `${c.nombre}: sin datos todavía.`;
    const titulo = `<title>${esc(rotulo)}</title>`;
    const figura = `<path d="${m.d}" fill="${color}" stroke="var(--fondo)" stroke-width="0.8" stroke-linejoin="round">${titulo}</path>`;
    if (!esMinuscula(m)) return [figura];
    const [cx, cy] = m.centro;
    return [
      figura,
      `<circle cx="${r1(cx)}" cy="${r1(cy)}" r="${RADIO_CIUDAD}" fill="${color}" stroke="var(--fondo)" stroke-width="1.2">${titulo}</circle>`,
    ];
  });
  const con = vista.circunscripciones.filter((c) => !sinDatos(c)).length;
  return lienzo(
    mapa,
    `Mapa de España por circunscripciones con el grupo más votado en cada una. ${con} de ${vista.circunscripciones.length} circunscripciones con datos.`,
    trazos.join('') + rotulosCiudades(vista, mapa) + marco(mapa),
  );
}

const RADIO_ESCANO = 3.6;
const RADIO_MINIMO = 5;

/** Círculo proporcional a los escaños de la circunscripción, partido por formaciones. */
function simbolo(c: VistaCircunscripcion, centro: [number, number], colores: Map<string, string>): string {
  const [cx, cy] = centro;
  const radio = Math.max(RADIO_MINIMO, RADIO_ESCANO * Math.sqrt(c.escanosTotales));
  const detalle = c.escanos.map((e) => `${e.siglas} ${e.escanos}`).join(', ');
  const rotulo = sinDatos(c)
    ? `${c.nombre}: ${c.escanosTotales} ${c.escanosTotales === 1 ? 'escaño' : 'escaños'}, sin datos todavía.`
    : `${c.nombre}: ${detalle}. Escrutado: ${porcentaje(c.porcentajeCenso)}.`;
  const titulo = `<title>${esc(rotulo)}</title>`;
  const contorno = `stroke="var(--fondo)" stroke-width="1"`;
  if (sinDatos(c)) {
    return `<g>${titulo}<circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(radio)}" fill="var(--fondo)" fill-opacity="0.6" stroke="var(--texto-suave)" stroke-width="1" stroke-dasharray="2.5 2"/></g>`;
  }
  const total = c.escanos.reduce((s, e) => s + e.escanos, 0);
  if (c.escanos.length === 1) {
    const unico = c.escanos[0] as VistaCircunscripcion['escanos'][number];
    return `<g>${titulo}<circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(radio)}" fill="${colores.get(unico.siglas) ?? COLOR_SIN_DATOS}" ${contorno}/></g>`;
  }
  let acumulado = 0;
  const trozos = c.escanos.map((e) => {
    const desde = -Math.PI / 2 + (acumulado / total) * 2 * Math.PI;
    acumulado += e.escanos;
    const hasta = -Math.PI / 2 + (acumulado / total) * 2 * Math.PI;
    const grande = hasta - desde > Math.PI ? 1 : 0;
    const a = `${r1(cx + radio * Math.cos(desde))} ${r1(cy + radio * Math.sin(desde))}`;
    const b = `${r1(cx + radio * Math.cos(hasta))} ${r1(cy + radio * Math.sin(hasta))}`;
    return `<path d="M${r1(cx)} ${r1(cy)}L${a}A${r1(radio)} ${r1(radio)} 0 ${grande} 1 ${b}Z" fill="${colores.get(e.siglas) ?? COLOR_SIN_DATOS}" ${contorno}/>`;
  });
  return `<g>${titulo}${trozos.join('')}</g>`;
}

/** Mapa base con un círculo por circunscripción, proporcional a sus escaños y partido por formaciones. */
export function renderMapaEscanos(vista: VistaRecuento, mapa: Mapa = MAPA): string {
  const colores = coloresFormaciones(vista);
  const base = vista.circunscripciones.flatMap((c) => {
    const m = mapa.circunscripciones[c.codigo];
    return m ? [`<path d="${m.d}" fill="var(--superficie)" stroke="var(--borde)" stroke-width="0.8" stroke-linejoin="round"/>`] : [];
  });
  // Los grandes primero, para que los pequeños que se les acerquen queden por encima.
  const simbolos = vista.circunscripciones
    .filter((c) => mapa.circunscripciones[c.codigo])
    .sort((a, b) => b.escanosTotales - a.escanosTotales)
    .map((c) => simbolo(c, (mapa.circunscripciones[c.codigo] as MapaCircunscripcion).centro, colores));
  return lienzo(
    mapa,
    `Mapa de España con los escaños de cada formación en cada circunscripción. Cada círculo es proporcional a los escaños en juego.`,
    base.join('') + simbolos.join('') + rotulosCiudades(vista, mapa) + marco(mapa),
  );
}

export interface ElementoLeyenda {
  nombre: string;
  color: string;
}

/** Leyenda en línea para un mapa. */
export function renderLeyenda(elementos: ElementoLeyenda[]): string {
  const items = elementos
    .map((e) => `<li><span class="muestra" style="background:${e.color}" aria-hidden="true"></span><span class="nombre">${esc(e.nombre)}</span></li>`)
    .join('');
  return `<ul class="leyenda leyenda--linea">${items}</ul>`;
}

/** Grupos que ganan alguna circunscripción (de más a menos circunscripciones) y, al final, «Sin datos». */
export function leyendaGanador(vista: VistaRecuento): ElementoLeyenda[] {
  const cuenta = new Map<string, { nombre: string; n: number }>();
  for (const c of vista.circunscripciones) {
    if (!c.ganador) continue;
    const previo = cuenta.get(c.ganador.grupoId);
    cuenta.set(c.ganador.grupoId, { nombre: c.ganador.nombre, n: (previo?.n ?? 0) + 1 });
  }
  const grupos = [...cuenta.entries()]
    .sort((a, b) => b[1].n - a[1].n || (a[1].nombre < b[1].nombre ? -1 : 1))
    .map(([id, g]) => ({ nombre: `${g.nombre} (${numero(g.n)})`, color: colorGrupo(id) }));
  return vista.circunscripciones.some(sinDatos) ? [...grupos, { nombre: 'Sin datos todavía', color: COLOR_SIN_DATOS }] : grupos;
}

/** Formaciones con escaños, con el color que tienen en el mapa. */
export function leyendaEscanos(vista: VistaRecuento): ElementoLeyenda[] {
  const colores = coloresFormaciones(vista);
  return vista.formaciones.map((f) => ({ nombre: f.siglas, color: colores.get(f.siglas) ?? COLOR_SIN_DATOS }));
}
