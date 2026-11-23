import { repartirDHondt, type ResultadoReparto } from './dhondt';
import { superaBarrera } from './umbral';
import {
  ErrorDatos,
  type Circunscripcion,
  type Escrutinio,
  type VotosCandidatura,
  type VotosCera,
} from './tipos';

export type EstadoEscrutinio = 'sin-datos' | 'parcial' | 'completo';

export interface Proyeccion {
  candidaturas: VotosCandidatura[];
  blancos: number;
  /** Votos a candidaturas + blancos, ya extrapolados. Base de la barrera del 3 %. */
  validos: number;
}

export interface EscanosCandidatura {
  siglas: string;
  escanos: number;
  /** Votos proyectados. */
  votos: number;
}

export interface ResultadoCircunscripcion {
  circunscripcion: Circunscripcion;
  estado: EstadoEscrutinio;
  /** Censo escrutado / censo, de 0 a 1. */
  porcentajeCenso: number;
  /** Factor de extrapolación lineal: censo / censo escrutado. */
  factor: number | null;
  proyeccion: Proyeccion | null;
  /** Siglas que superan la barrera (en Ceuta y Melilla, todas: no hay barrera). */
  elegibles: string[];
  /** Solo candidaturas con al menos un escaño, de más a menos. */
  escanos: EscanosCandidatura[];
  reparto: ResultadoReparto | null;
  empateSorteo: boolean;
  /** true si la proyección ya suma el voto CERA real (no una estimación). */
  ceraIncluido: boolean;
}

function esNumeroValido(n: number): boolean {
  return Number.isFinite(n) && n >= 0;
}

export function validarEscrutinio(e: Escrutinio): void {
  if (!(Number.isFinite(e.censo) && e.censo > 0)) throw new ErrorDatos(`Censo inválido en ${e.codigo}: ${e.censo}`);
  if (!esNumeroValido(e.censoEscrutado)) throw new ErrorDatos(`Censo escrutado inválido en ${e.codigo}: ${e.censoEscrutado}`);
  if (e.censoEscrutado > e.censo) {
    throw new ErrorDatos(`Censo escrutado (${e.censoEscrutado}) mayor que el censo (${e.censo}) en ${e.codigo}`);
  }
  if (!esNumeroValido(e.blancos)) throw new ErrorDatos(`Votos en blanco inválidos en ${e.codigo}: ${e.blancos}`);
  const vistas = new Set<string>();
  for (const c of e.candidaturas) {
    if (!esNumeroValido(c.votos)) throw new ErrorDatos(`Votos inválidos para ${c.siglas} en ${e.codigo}: ${c.votos}`);
    if (vistas.has(c.siglas)) throw new ErrorDatos(`Candidatura duplicada en ${e.codigo}: ${c.siglas}`);
    vistas.add(c.siglas);
  }
}

export function validarCera(c: VotosCera, codigo: string): void {
  if (!esNumeroValido(c.blancos)) throw new ErrorDatos(`Blancos CERA inválidos en ${codigo}: ${c.blancos}`);
  const vistas = new Set<string>();
  for (const v of c.candidaturas) {
    if (!esNumeroValido(v.votos)) throw new ErrorDatos(`Votos CERA inválidos para ${v.siglas} en ${codigo}: ${v.votos}`);
    if (vistas.has(v.siglas)) throw new ErrorDatos(`Candidatura CERA duplicada en ${codigo}: ${v.siglas}`);
    vistas.add(v.siglas);
  }
}

function sinDatos(circunscripcion: Circunscripcion): ResultadoCircunscripcion {
  return {
    circunscripcion,
    estado: 'sin-datos',
    porcentajeCenso: 0,
    factor: null,
    proyeccion: null,
    elegibles: [],
    escanos: [],
    reparto: null,
    empateSorteo: false,
    ceraIncluido: false,
  };
}

/**
 * Proyecta una circunscripción y reparte sus escaños.
 *
 * 1. Extrapolación lineal: todos los votos (candidaturas y blancos) se multiplican por
 *    censo / censo escrutado.
 * 2. Proporcional: barrera del 3 % sobre votos válidos y reparto D'Hondt.
 *    Ceuta y Melilla: gana el más votado (D'Hondt de un escaño, sin barrera).
 *
 * D'Hondt y el 3 % son invariantes a multiplicar todos los votos por la misma constante,
 * así que, sin CERA, el reparto coincide con el de los votos escrutados; el factor solo cambia
 * los votos absolutos que se muestran.
 *
 * 3. Voto CERA (opcional): cuando ya se ha escrutado, se suma sin extrapolar a los votos proyectados
 *    antes de la barrera y el reparto. Con CERA la invariancia de escala deja de valer, porque se
 *    mezclan votos extrapolados con votos reales.
 */
export function calcularCircunscripcion(
  circunscripcion: Circunscripcion,
  escrutinio: Escrutinio | null,
  cera: VotosCera | null = null,
): ResultadoCircunscripcion {
  if (!escrutinio) return sinDatos(circunscripcion);
  if (escrutinio.codigo !== circunscripcion.codigo) {
    throw new ErrorDatos(`El escrutinio ${escrutinio.codigo} no corresponde a la circunscripción ${circunscripcion.codigo}`);
  }
  validarEscrutinio(escrutinio);
  if (escrutinio.censoEscrutado === 0) return sinDatos(circunscripcion);

  if (cera) validarCera(cera, escrutinio.codigo);

  const factor = escrutinio.censo / escrutinio.censoEscrutado;
  const votos = new Map<string, number>();
  for (const c of escrutinio.candidaturas) votos.set(c.siglas, c.votos * factor);
  for (const c of cera?.candidaturas ?? []) votos.set(c.siglas, (votos.get(c.siglas) ?? 0) + c.votos);
  const candidaturas = [...votos].map(([siglas, v]) => ({ siglas, votos: v }));
  const blancos = escrutinio.blancos * factor + (cera?.blancos ?? 0);
  const validos = candidaturas.reduce((suma, c) => suma + c.votos, blancos);
  const proyeccion: Proyeccion = { candidaturas, blancos, validos };

  const elegibles =
    circunscripcion.tipo === 'mayoritaria'
      ? candidaturas
      : candidaturas.filter((c) => superaBarrera(c.votos, validos));

  const reparto = repartirDHondt(
    elegibles.map((c) => ({ id: c.siglas, votos: c.votos })),
    circunscripcion.escanos,
  );

  const escanos: EscanosCandidatura[] = candidaturas
    .map((c) => ({ siglas: c.siglas, votos: c.votos, escanos: reparto.escanos[c.siglas] ?? 0 }))
    .filter((c) => c.escanos > 0)
    .sort((a, b) => b.escanos - a.escanos || b.votos - a.votos || (a.siglas < b.siglas ? -1 : 1));

  return {
    circunscripcion,
    estado: escrutinio.censoEscrutado === escrutinio.censo ? 'completo' : 'parcial',
    porcentajeCenso: escrutinio.censoEscrutado / escrutinio.censo,
    factor,
    proyeccion,
    elegibles: elegibles.map((c) => c.siglas),
    escanos,
    reparto,
    empateSorteo: reparto.empateSorteo,
    ceraIncluido: cera !== null,
  };
}
