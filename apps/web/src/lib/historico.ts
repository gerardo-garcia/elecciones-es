import {
  calcularCircunscripcion,
  construirVista,
  crearAgrupador,
  normalizarSiglas,
  type Agrupador,
  type Circunscripcion,
  type GrupoConfig,
  type ResultadoCircunscripcion,
  type VistaRecuento,
} from '@elecciones/engine';
import circunscripcionesJson from '../../../../data/config/circunscripciones.json';
import agrupacionesJson from '../../../../data/historico/agrupaciones.json';
import generales201904 from '../../../../data/historico/generales-2019-04.json';
import generales201911 from '../../../../data/historico/generales-2019-11.json';
import generales202307 from '../../../../data/historico/generales-2023-07.json';
import { formatoDiaMesAnio } from './formato';

/**
 * Elecciones pasadas del histórico: resultados oficiales definitivos (con el voto exterior) por circunscripción. El
 * motor vuelve a repartir los escaños con D'Hondt y la barrera del 3 % y se comprueba que coinciden con los oficiales:
 * si no, el build se detiene en lugar de publicar un reparto distinto del real.
 */

/** Una circunscripción tal como la guarda `data/historico/generales-*.json`. */
export interface DatosCircunscripcion {
  codigo: string;
  nombre: string;
  /** Escaños que elegía esa circunscripción en esas elecciones. */
  escanos: number;
  electores: number;
  votantes: number;
  nulos: number;
  blancos: number;
  /** [siglas, votos, escaños], de más a menos votos; solo las candidaturas con votos. */
  candidaturas: [string, number, number][];
}

export interface DatosEleccion {
  /** AAAA-MM-DD */
  fecha: string;
  nombres: Record<string, string>;
  circunscripciones: DatosCircunscripcion[];
}

export interface EleccionHistorica {
  /** Va en la dirección: /historico/<id>/ */
  id: string;
  fecha: string;
  /** «23 de julio de 2023» */
  fechaLarga: string;
  /** «Elecciones generales del 23 de julio de 2023» */
  titulo: string;
  datos: DatosEleccion;
}

function eleccion(id: string, datos: unknown): EleccionHistorica {
  const d = datos as DatosEleccion;
  const fechaLarga = formatoDiaMesAnio(d.fecha);
  return { id, fecha: d.fecha, fechaLarga, titulo: `Elecciones generales del ${fechaLarga}`, datos: d };
}

/** De la más reciente a la más antigua. */
export const ELECCIONES_HISTORICAS: readonly EleccionHistorica[] = [
  eleccion('generales-2023-07', generales202307),
  eleccion('generales-2019-11', generales201911),
  eleccion('generales-2019-04', generales201904),
];

export function eleccionHistorica(id: string): EleccionHistorica {
  const e = ELECCIONES_HISTORICAS.find((x) => x.id === id);
  if (!e) throw new Error(`No hay unas elecciones con id ${id} en el histórico`);
  return e;
}

/** Un grupo de `data/historico/agrupaciones.json`: el texto `incluye` solo vale en las elecciones en que salió alguna de esas siglas. */
interface GrupoHistorico extends GrupoConfig {
  incluyeSiEstan?: string[];
}

const agrupadores = new WeakMap<DatosEleccion, Agrupador>();

/**
 * Agrupador de siglas de unas elecciones. Es el mismo para todas, salvo que quita el texto «incluye» de un grupo cuando
 * ninguna de las siglas que lo justifican se presentó en esas elecciones (PP-FORO no existía en 2023: sin esto, la
 * etiqueta del PP diría que incluye una coalición que no hubo).
 */
export function agrupadorDe(datos: DatosEleccion): Agrupador {
  const hecho = agrupadores.get(datos);
  if (hecho) return hecho;
  const presentes = new Set(datos.circunscripciones.flatMap((c) => c.candidaturas.map(([siglas]) => normalizarSiglas(siglas))));
  const grupos = (agrupacionesJson.grupos as GrupoHistorico[]).map(({ incluyeSiEstan, ...grupo }) => {
    const justificado = incluyeSiEstan === undefined || incluyeSiEstan.some((s) => presentes.has(normalizarSiglas(s)));
    if (justificado) return grupo;
    const { incluye: _quitado, ...sinNota } = grupo;
    return sinNota;
  });
  const agrupador = crearAgrupador(grupos);
  agrupadores.set(datos, agrupador);
  return agrupador;
}

/** Circunscripciones con el nombre y el tipo actuales y los escaños que tenían en esas elecciones. */
export function circunscripcionesDe(datos: DatosEleccion): Circunscripcion[] {
  const config = new Map((circunscripcionesJson.circunscripciones as Circunscripcion[]).map((c) => [c.codigo, c]));
  return datos.circunscripciones.map((d) => {
    const c = config.get(d.codigo);
    if (!c) throw new Error(`Circunscripción desconocida en los datos: ${d.codigo}`);
    return { ...c, escanos: d.escanos };
  });
}

/**
 * Reparto de cada circunscripción a partir de los votos oficiales. Son los votos definitivos, voto exterior incluido:
 * todo el censo está escrutado, así que no hay extrapolación (factor 1).
 */
export function resultadosDe(datos: DatosEleccion): ResultadoCircunscripcion[] {
  const circunscripciones = circunscripcionesDe(datos);
  return datos.circunscripciones.map((d, i) =>
    calcularCircunscripcion(circunscripciones[i] as Circunscripcion, {
      codigo: d.codigo,
      censo: d.electores,
      censoEscrutado: d.electores,
      blancos: d.blancos,
      candidaturas: d.candidaturas.map(([siglas, votos]) => ({ siglas, votos })),
    }),
  );
}

/** Lanza un error si el reparto del motor no es el oficial en alguna circunscripción. */
export function verificarEscanos(datos: DatosEleccion, resultados: ResultadoCircunscripcion[] = resultadosDe(datos)): void {
  const diferencias: string[] = [];
  datos.circunscripciones.forEach((d, i) => {
    const calculado = new Map((resultados[i]?.escanos ?? []).map((e) => [e.siglas, e.escanos]));
    const oficial = new Map(d.candidaturas.filter(([, , e]) => e > 0).map(([s, , e]) => [s, e]));
    for (const siglas of new Set([...calculado.keys(), ...oficial.keys()])) {
      if ((calculado.get(siglas) ?? 0) !== (oficial.get(siglas) ?? 0)) {
        diferencias.push(`${d.nombre} ${siglas}: motor ${calculado.get(siglas) ?? 0}, oficial ${oficial.get(siglas) ?? 0}`);
      }
    }
  });
  if (diferencias.length > 0) {
    throw new Error(`El reparto del motor no coincide con el oficial (${datos.fecha}): ${diferencias.join('; ')}`);
  }
}

const vistas = new Map<string, VistaRecuento>();

/** El recuento final en el mismo formato que el del recuento en directo, con la tabla de los escaños más ajustados. */
export function vistaDe(e: EleccionHistorica): VistaRecuento {
  const hecha = vistas.get(e.id);
  if (hecha) return hecha;
  const resultados = resultadosDe(e.datos);
  verificarEscanos(e.datos, resultados);
  const vista = construirVista(resultados, {
    agrupador: agrupadorDe(e.datos),
    porcentajeCensoNacional: 1,
    resultadoDefinitivo: true,
  });
  vistas.set(e.id, vista);
  return vista;
}

export interface Ficha {
  electores: number;
  votantes: number;
  /** votantes / electores, de 0 a 1 (la participación oficial). */
  participacion: number;
  nulos: number;
  blancos: number;
  /** Votos a candidaturas (sin blancos). */
  votosACandidaturas: number;
  /** Votos a candidaturas + blancos: la base de los porcentajes oficiales. */
  validos: number;
  escanos: number;
  /** Escaños de la mayoría absoluta. */
  mayoria: number;
}

export function fichaDe(datos: DatosEleccion): Ficha {
  const suma = (f: (c: DatosCircunscripcion) => number) => datos.circunscripciones.reduce((s, c) => s + f(c), 0);
  const electores = suma((c) => c.electores);
  const votantes = suma((c) => c.votantes);
  const blancos = suma((c) => c.blancos);
  const votosACandidaturas = suma((c) => c.candidaturas.reduce((s, [, v]) => s + v, 0));
  const escanos = suma((c) => c.escanos);
  return {
    electores,
    votantes,
    participacion: votantes / electores,
    nulos: suma((c) => c.nulos),
    blancos,
    votosACandidaturas,
    validos: votosACandidaturas + blancos,
    escanos,
    mayoria: Math.floor(escanos / 2) + 1,
  };
}

export interface FilaVotos {
  /** Id del grupo, o 'otras' / 'blanco' en las dos filas finales. */
  id: string;
  nombre: string;
  incluye?: string;
  votos: number;
  /** Votos / votos válidos, de 0 a 1. */
  porcentaje: number;
  escanos: number;
}

/** Porcentaje de votos válidos a partir del cual un grupo sin escaños tiene fila propia en la tabla. */
export const MINIMO_FILA_PROPIA = 0.01;

/**
 * Votos y escaños por grupo, de más a menos escaños (y, a igualdad, de más a menos votos). Los grupos sin escaños y con
 * menos del 1 % de los votos válidos se suman en «Otras candidaturas». Al final, los votos en blanco: así las filas
 * suman exactamente los votos válidos.
 */
export function votosPorGrupo(datos: DatosEleccion): FilaVotos[] {
  const agrupar = agrupadorDe(datos);
  const { validos, blancos } = fichaDe(datos);
  const grupos = new Map<string, FilaVotos>();
  for (const c of datos.circunscripciones) {
    for (const [siglas, votos, escanos] of c.candidaturas) {
      const g = agrupar(siglas);
      const previo = grupos.get(g.id) ?? {
        id: g.id,
        nombre: g.nombre,
        ...(g.incluye === undefined ? {} : { incluye: g.incluye }),
        votos: 0,
        porcentaje: 0,
        escanos: 0,
      };
      previo.votos += votos;
      previo.escanos += escanos;
      grupos.set(g.id, previo);
    }
  }
  const propias: FilaVotos[] = [];
  const otras: FilaVotos = { id: 'otras', nombre: 'Otras candidaturas', votos: 0, porcentaje: 0, escanos: 0 };
  for (const g of grupos.values()) {
    g.porcentaje = g.votos / validos;
    if (g.escanos > 0 || g.porcentaje >= MINIMO_FILA_PROPIA) propias.push(g);
    else otras.votos += g.votos;
  }
  otras.porcentaje = otras.votos / validos;
  propias.sort((a, b) => b.escanos - a.escanos || b.votos - a.votos || (a.id < b.id ? -1 : 1));
  const filas = otras.votos > 0 ? [...propias, otras] : propias;
  return [...filas, { id: 'blanco', nombre: 'Votos en blanco', votos: blancos, porcentaje: blancos / validos, escanos: 0 }];
}
