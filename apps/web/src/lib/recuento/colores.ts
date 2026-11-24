import coloresJson from '../../data/colores.json';

const GRUPOS = coloresJson.grupos as Record<string, string>;
const OTROS = coloresJson.otros;

/** Color de las circunscripciones (o escaños) que aún no dan datos. */
export const COLOR_SIN_DATOS = coloresJson.sinDatos;

function hash(texto: string): number {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i++) h = Math.imul(h ^ texto.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Color de una agrupación. Si no está en la paleta se elige uno de `otros` según el id: siempre el mismo. */
export function colorGrupo(grupoId: string): string {
  return GRUPOS[grupoId] ?? (OTROS[hash(grupoId) % OTROS.length] as string);
}

/** Mezcla un color #rrggbb con blanco: 0 = el mismo, 1 = blanco. */
export function aclarar(color: string, cantidad: number): string {
  const n = Number.parseInt(color.slice(1), 16);
  const canal = (desplazamiento: number) => {
    const c = (n >> desplazamiento) & 255;
    return Math.round(c + (255 - c) * cantidad)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${canal(16)}${canal(8)}${canal(0)}`;
}

/**
 * Color de una formación: el de su grupo; si varias formaciones comparten grupo (PSOE y PSC, por ejemplo) la segunda y
 * siguientes se aclaran para distinguirlas en el mismo gráfico.
 */
export function colorFormacion(grupoId: string, indiceEnGrupo: number): string {
  return aclarar(colorGrupo(grupoId), Math.min(0.55, indiceEnGrupo * 0.28));
}
