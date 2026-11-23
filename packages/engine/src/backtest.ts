import { tablaDisputa } from './disputa';
import { calcularCircunscripcion, type ResultadoCircunscripcion } from './proyeccion';
import {
  instantanea,
  instantaneaFinal,
  minutosHastaCompleto,
  type Escenario,
  type Instantanea,
} from './simulacion';
import { ErrorDatos, type Circunscripcion } from './tipos';

/**
 * Backtest: cuánto se equivoca la proyección en cada momento de una noche simulada respecto del resultado
 * final de ESA MISMA simulación (con el 100 % del censo residente escrutado).
 *
 * El "final" no incluye el voto exterior (CERA), que no se cuenta la noche electoral: se mide el error de la
 * extrapolación, no el de lo que llegará después. Las cifras dependen de las hipótesis de la simulación (orden
 * de llegada, curva de escrutinio, reparto uniforme entre las mesas de un municipio): son una referencia
 * para comparar, no una predicción de lo que ocurrirá el 29N.
 */

export interface MetricasInstante {
  minutos: number;
  /** Censo escrutado en toda España, de 0 a 1. */
  porcentajeCenso: number;
  circunscripcionesConDatos: number;
  /** Escaños de circunscripciones que aún no dan ningún dato (la web los muestra como pendientes). */
  escanosPendientes: number;
  /** Circunscripciones con datos cuyo reparto ya difiere del final. */
  circunscripcionesDistintas: number;
  /**
   * Escaños mal asignados en las circunscripciones con datos: ½ · Σ |proyectados − finales| por candidatura.
   * Un escaño que cambia de partido cuenta 1.
   */
  escanosErroneos: number;
  /** Filas de la tabla de disputa en ese momento. */
  filasTabla: number;
  /** Circunscripciones que acabarán con otro reparto y ya están entre las filas de la tabla. */
  distintasEnTabla: number;
  /** Filas de la tabla cuya circunscripción acaba con otro reparto (las demás son falsas alarmas). */
  filasQueCambian: number;
}

export interface ResultadoBacktest {
  puntos: MetricasInstante[];
  /**
   * Primer minuto desde el cual y hasta el final todas las circunscripciones dan datos y su reparto ya es el
   * definitivo; null si no llega a darse en los puntos medidos.
   */
  minutoEstable: number | null;
  /** Minuto en que el escrutinio está completo en todas las circunscripciones. */
  minutosCompleto: number;
}

export interface OpcionesBacktest {
  /** Separación entre puntos medidos, en minutos (por defecto, 5). */
  pasoMin?: number;
  /** Filas de la tabla de disputa (por defecto, 10). */
  filasTabla?: number;
}

/** Proyecta cada circunscripción con el escrutinio de la instantánea (sin CERA). */
export function proyectarInstantanea(circunscripciones: Circunscripcion[], inst: Instantanea): ResultadoCircunscripcion[] {
  const conocidas = new Set(circunscripciones.map((c) => c.codigo));
  for (const e of inst.escrutinios) {
    if (!conocidas.has(e.codigo)) throw new ErrorDatos(`La simulación tiene datos de una circunscripción desconocida: ${e.codigo}`);
  }
  const porCodigo = new Map(inst.escrutinios.map((e) => [e.codigo, e] as const));
  return circunscripciones.map((c) => calcularCircunscripcion(c, porCodigo.get(c.codigo) ?? null));
}

const escanosPorSiglas = (r: ResultadoCircunscripcion): Map<string, number> =>
  new Map(r.escanos.map((e) => [e.siglas, e.escanos] as const));

/** Escaños que cambiarían de candidatura entre dos repartos de la misma circunscripción. */
function escanosDistintos(a: ResultadoCircunscripcion, b: ResultadoCircunscripcion): number {
  const ea = escanosPorSiglas(a);
  const eb = escanosPorSiglas(b);
  let suma = 0;
  for (const s of new Set([...ea.keys(), ...eb.keys()])) suma += Math.abs((ea.get(s) ?? 0) - (eb.get(s) ?? 0));
  return suma / 2;
}

/** Compara una proyección parcial con la final (misma lista de circunscripciones y mismo orden). */
export function evaluar(
  inst: Instantanea,
  proyectadas: ResultadoCircunscripcion[],
  finales: ResultadoCircunscripcion[],
  filasTabla = 10,
): MetricasInstante {
  if (proyectadas.length !== finales.length) throw new ErrorDatos('Las proyecciones y las finales no coinciden en número');

  const tabla = new Set(tablaDisputa(proyectadas, filasTabla).map((f) => f.codigo));
  const cambian = new Set<string>();
  let conDatos = 0;
  let pendientes = 0;
  let escanosErroneos = 0;
  proyectadas.forEach((p, i) => {
    const f = finales[i] as ResultadoCircunscripcion;
    if (p.circunscripcion.codigo !== f.circunscripcion.codigo) throw new ErrorDatos('Las circunscripciones no están en el mismo orden');
    if (p.estado === 'sin-datos') {
      pendientes += p.circunscripcion.escanos;
      return;
    }
    conDatos++;
    const d = escanosDistintos(p, f);
    escanosErroneos += d;
    if (d > 0) cambian.add(p.circunscripcion.codigo);
  });

  return {
    minutos: inst.minutos,
    porcentajeCenso: inst.porcentajeCenso,
    circunscripcionesConDatos: conDatos,
    escanosPendientes: pendientes,
    circunscripcionesDistintas: cambian.size,
    escanosErroneos,
    filasTabla: tabla.size,
    distintasEnTabla: [...cambian].filter((c) => tabla.has(c)).length,
    filasQueCambian: [...tabla].filter((c) => cambian.has(c)).length,
  };
}

export function backtest(
  circunscripciones: Circunscripcion[],
  escenario: Escenario,
  opciones: OpcionesBacktest = {},
): ResultadoBacktest {
  const { pasoMin = 5, filasTabla = 10 } = opciones;
  if (!(pasoMin > 0)) throw new ErrorDatos(`Paso inválido: ${pasoMin}`);

  const completo = minutosHastaCompleto(escenario);
  const finales = proyectarInstantanea(circunscripciones, instantaneaFinal(escenario));

  const instantaneas: Instantanea[] = [];
  for (let t = 0; t < completo; t += pasoMin) instantaneas.push(instantanea(escenario, t));
  instantaneas.push({ ...instantaneaFinal(escenario), minutos: completo });

  const puntos = instantaneas.map((inst) => evaluar(inst, proyectarInstantanea(circunscripciones, inst), finales, filasTabla));

  let minutoEstable: number | null = null;
  for (let i = puntos.length - 1; i >= 0; i--) {
    const p = puntos[i] as MetricasInstante;
    if (p.escanosPendientes === 0 && p.circunscripcionesDistintas === 0) minutoEstable = p.minutos;
    else break;
  }
  return { puntos, minutoEstable, minutosCompleto: completo };
}
