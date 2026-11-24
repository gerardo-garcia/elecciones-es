import type { Agrupador } from './agrupacion';
import { construirTablaDisputa, type FilaDisputa, type TablaDisputa } from './disputa';
import { calcularNacional, type TotalGrupo } from './nacional';
import type { EstadoEscrutinio, ResultadoCircunscripcion } from './proyeccion';

/**
 * Lo que la web necesita para pintar el recuento, ya calculado y en datos planos (se puede guardar como JSON).
 * La web no calcula nada: solo dibuja una `VistaRecuento`, venga de la fuente en vivo o de la simulación.
 */

export interface VistaEscanos {
  siglas: string;
  /** Agrupación a la que pertenece (da el color: dos siglas del mismo partido comparten grupo). */
  grupoId: string;
  escanos: number;
}

export interface VistaGanador {
  grupoId: string;
  nombre: string;
  /** Votos proyectados del grupo / votos válidos proyectados de la circunscripción, de 0 a 1. */
  porcentajeVotos: number;
}

export interface VistaCircunscripcion {
  codigo: string;
  nombre: string;
  escanosTotales: number;
  estado: EstadoEscrutinio;
  /** Censo escrutado de la circunscripción, de 0 a 1. */
  porcentajeCenso: number;
  /** Solo candidaturas con escaño, de más a menos. */
  escanos: VistaEscanos[];
  /** Grupo más votado (no el de más escaños: con pocos escaños los empates son habituales). null sin datos. */
  ganador: VistaGanador | null;
}

/** Fila de la tabla de disputa con el grupo de cada candidatura, que es lo que da el color. */
export interface VistaFilaDisputa extends FilaDisputa {
  /** Agrupación de `actual` (null si no hay una candidatura concreta que pierda el escaño). */
  actualGrupoId: string | null;
  /** Agrupación de `aspirante`. */
  aspiranteGrupoId: string;
}

export interface VistaTablaDisputa extends Omit<TablaDisputa, 'filas'> {
  filas: VistaFilaDisputa[];
}

export interface VistaRecuento {
  /** Censo escrutado en toda España, de 0 a 1. */
  porcentajeCensoNacional: number;
  /** Escaños de las circunscripciones que ya dan datos (proyectados, provisionales hasta el final). */
  escanosAsignados: number;
  /** Escaños de las circunscripciones que aún no dan ningún dato. */
  escanosPendientes: number;
  escanosTotales: number;
  /** Escaños por candidatura, sin agrupar, de más a menos. */
  formaciones: VistaEscanos[];
  /** Escaños por grupo (formaciones territoriales de un mismo partido sumadas), de más a menos. */
  grupos: TotalGrupo[];
  circunscripciones: VistaCircunscripcion[];
  tabla: VistaTablaDisputa;
}

export interface OpcionesVista {
  agrupador: Agrupador;
  /** Censo escrutado en toda España, de 0 a 1 (ver `porcentajeCensoNacional`). */
  porcentajeCensoNacional: number;
  /** Votos válidos CERA esperados por circunscripción, mientras el voto exterior no esté escrutado. */
  ceraEsperados?: Record<string, number>;
  /** Filas de la tabla de disputa (por defecto, 10). */
  filasTabla?: number;
}

function ganador(r: ResultadoCircunscripcion, agrupador: Agrupador): VistaGanador | null {
  const p = r.proyeccion;
  if (!p || !(p.validos > 0)) return null;
  const votos = new Map<string, { nombre: string; votos: number }>();
  for (const c of p.candidaturas) {
    const g = agrupador(c.siglas);
    const previo = votos.get(g.id);
    votos.set(g.id, { nombre: g.nombre, votos: (previo?.votos ?? 0) + c.votos });
  }
  let mejor: [string, { nombre: string; votos: number }] | null = null;
  for (const entrada of votos) {
    if (!mejor || entrada[1].votos > mejor[1].votos || (entrada[1].votos === mejor[1].votos && entrada[0] < mejor[0])) {
      mejor = entrada;
    }
  }
  if (!mejor || !(mejor[1].votos > 0)) return null;
  return { grupoId: mejor[0], nombre: mejor[1].nombre, porcentajeVotos: mejor[1].votos / p.validos };
}

export function construirVista(resultados: ResultadoCircunscripcion[], opciones: OpcionesVista): VistaRecuento {
  const { agrupador, porcentajeCensoNacional, ceraEsperados, filasTabla } = opciones;
  const nacional = calcularNacional(resultados, agrupador);
  const tabla = construirTablaDisputa(resultados, {
    porcentajeEscrutadoGlobal: porcentajeCensoNacional,
    ...(filasTabla === undefined ? {} : { n: filasTabla }),
    ...(ceraEsperados === undefined ? {} : { ceraEsperados }),
  });

  return {
    porcentajeCensoNacional,
    escanosAsignados: nacional.escanosAsignados,
    escanosPendientes: nacional.escanosPendientes,
    escanosTotales: nacional.escanosTotales,
    formaciones: nacional.porCandidatura.map((c) => ({
      siglas: c.siglas,
      grupoId: agrupador(c.siglas).id,
      escanos: c.escanos,
    })),
    grupos: nacional.porGrupo,
    circunscripciones: resultados.map((r) => ({
      codigo: r.circunscripcion.codigo,
      nombre: r.circunscripcion.nombre,
      escanosTotales: r.circunscripcion.escanos,
      estado: r.estado,
      porcentajeCenso: r.porcentajeCenso,
      escanos: r.escanos.map((e) => ({ siglas: e.siglas, grupoId: agrupador(e.siglas).id, escanos: e.escanos })),
      ganador: ganador(r, agrupador),
    })),
    tabla: {
      ...tabla,
      filas: tabla.filas.map((f) => ({
        ...f,
        actualGrupoId: f.actual === null ? null : agrupador(f.actual).id,
        aspiranteGrupoId: agrupador(f.aspirante).id,
      })),
    },
  };
}
