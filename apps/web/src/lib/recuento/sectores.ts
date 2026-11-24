import type { VistaRecuento } from '@elecciones/engine';
import { COLOR_SIN_DATOS, colorFormacion, colorGrupo } from './colores';
import { esc, numero, r1 } from './html';

/** Un sector del diagrama: una formación (o un grupo) con sus escaños. */
export interface Trozo {
  clave: string;
  nombre: string;
  escanos: number;
  color: string;
  /** Qué partidos suma, si agrupa partidos distintos (ver `incluye` en data/config/agrupaciones.json). */
  nota?: string;
  /** true para los escaños de circunscripciones que aún no dan datos. */
  pendiente?: boolean;
}

function conPendientes(trozos: Trozo[], pendientes: number): Trozo[] {
  return pendientes > 0
    ? [...trozos, { clave: 'pendiente', nombre: 'Sin datos todavía', escanos: pendientes, color: COLOR_SIN_DATOS, pendiente: true }]
    : trozos;
}

/** Escaños por candidatura, sin agrupar. Si dos comparten grupo, la segunda se pinta más clara. */
export function trozosFormaciones(vista: VistaRecuento): Trozo[] {
  const vistas = new Map<string, number>();
  const trozos = vista.formaciones.map((f) => {
    const indice = vistas.get(f.grupoId) ?? 0;
    vistas.set(f.grupoId, indice + 1);
    return { clave: f.siglas, nombre: f.siglas, escanos: f.escanos, color: colorFormacion(f.grupoId, indice) };
  });
  return conPendientes(trozos, vista.escanosPendientes);
}

/** Escaños por grupo: las formaciones territoriales de un mismo partido, sumadas. */
export function trozosGrupos(vista: VistaRecuento): Trozo[] {
  const trozos = vista.grupos.map((g) => ({
    clave: g.id,
    nombre: g.nombre,
    escanos: g.escanos,
    color: colorGrupo(g.id),
    ...(g.incluye === undefined ? {} : { nota: g.incluye }),
  }));
  return conPendientes(trozos, vista.escanosPendientes);
}

const CX = 100;
const CY = 100;
const R = 92;
const r = 58;

const punto = (radio: number, angulo: number) => `${r1(CX + radio * Math.cos(angulo))} ${r1(CY + radio * Math.sin(angulo))}`;

/** Trazo de un sector de corona entre dos ángulos (en radianes, desde las 12 en punto y en sentido horario). */
function sector(desde: number, hasta: number): string {
  const grande = hasta - desde > Math.PI ? 1 : 0;
  return `M${punto(R, desde)}A${R} ${R} 0 ${grande} 1 ${punto(R, hasta)}L${punto(r, hasta)}A${r} ${r} 0 ${grande} 0 ${punto(r, desde)}Z`;
}

/** Corona completa (un solo sector con todo): un arco de 360° no se puede trazar, se hacen dos mitades. */
function corona(): string {
  const aro = (radio: number, barrido: number) =>
    `M${r1(CX - radio)} ${CY}A${radio} ${radio} 0 1 ${barrido} ${r1(CX + radio)} ${CY}A${radio} ${radio} 0 1 ${barrido} ${r1(CX - radio)} ${CY}Z`;
  return aro(R, 1) + aro(r, 0);
}

export interface OpcionesSectores {
  titulo: string;
  /** Total de escaños en juego (350): se muestra en el centro. */
  escanosTotales: number;
}

/** Diagrama de sectores (en corona) con su leyenda. Los escaños sin datos aparecen en gris. */
export function renderSectores(trozos: Trozo[], { titulo, escanosTotales }: OpcionesSectores): string {
  const visibles = trozos.filter((t) => t.escanos > 0);
  const suma = visibles.reduce((s, t) => s + t.escanos, 0);
  const asignados = visibles.filter((t) => !t.pendiente).reduce((s, t) => s + t.escanos, 0);

  let acumulado = 0;
  const trazos = visibles.map((t) => {
    const desde = -Math.PI / 2 + (acumulado / suma) * 2 * Math.PI;
    acumulado += t.escanos;
    const hasta = -Math.PI / 2 + (acumulado / suma) * 2 * Math.PI;
    const d = visibles.length === 1 ? corona() : sector(desde, hasta);
    const rotulo = `${t.nombre}: ${numero(t.escanos)} ${t.escanos === 1 ? 'escaño' : 'escaños'}`;
    return `<path d="${d}" fill="${t.color}" fill-rule="evenodd" stroke="var(--fondo)" stroke-width="1.5"><title>${esc(rotulo)}</title></path>`;
  });
  if (visibles.length === 0) {
    trazos.push(`<path d="${corona()}" fill="${COLOR_SIN_DATOS}" fill-rule="evenodd"/>`);
  }

  const resumen = visibles.map((t) => `${t.nombre} ${t.escanos}`).join(', ');
  const etiqueta = `${titulo}. ${asignados} de ${escanosTotales} escaños asignados${resumen ? `: ${resumen}` : ''}`;
  const leyenda = visibles
    .map(
      (t) =>
        `<li><span class="muestra" style="background:${t.color}" aria-hidden="true"></span>` +
        `<span class="nombre">${esc(t.nombre)}${t.nota ? `<small>Incluye ${esc(t.nota)}</small>` : ''}</span>` +
        `<strong>${numero(t.escanos)}</strong></li>`,
    )
    .join('');

  return (
    `<figure class="sectores">` +
    `<svg viewBox="0 0 200 200" role="img" aria-label="${esc(etiqueta)}">${trazos.join('')}` +
    `<text x="100" y="98" text-anchor="middle" class="sectores-valor">${numero(asignados)}</text>` +
    `<text x="100" y="118" text-anchor="middle" class="sectores-texto">de ${numero(escanosTotales)} escaños</text></svg>` +
    `<ul class="leyenda">${leyenda}</ul></figure>`
  );
}

/** Los dos diagramas coinciden si agrupar no junta nada: mismo número de sectores. */
export function coinciden(a: Trozo[], b: Trozo[]): boolean {
  const sectores = (ts: Trozo[]) => ts.filter((t) => t.escanos > 0).length;
  return sectores(a) === sectores(b);
}

/** Color de cada formación (por siglas), el mismo que en el diagrama: sirve para el mapa de escaños. */
export function coloresFormaciones(vista: VistaRecuento): Map<string, string> {
  return new Map(trozosFormaciones(vista).filter((t) => !t.pendiente).map((t) => [t.clave, t.color] as const));
}
