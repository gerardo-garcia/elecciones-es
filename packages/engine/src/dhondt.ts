import { ErrorDatos } from './tipos';

export interface EntradaReparto {
  id: string;
  votos: number;
}

export interface Cociente {
  id: string;
  votos: number;
  divisor: number;
  /** votos / divisor, solo informativo: las comparaciones usan multiplicación cruzada. */
  valor: number;
}

export interface ResultadoReparto {
  /** Escaños por id, con un 0 explícito para toda candidatura de entrada sin escaño. */
  escanos: Record<string, number>;
  /** Todos los cocientes de mayor a menor. Los primeros `adjudicados` tienen escaño. */
  clasificacion: Cociente[];
  adjudicados: number;
  /**
   * El último escaño y el primero sin adjudicar empatan en cociente Y en número de votos:
   * la ley lo resuelve por sorteo. Aquí se ordena por id solo para ser determinista.
   */
  empateSorteo: boolean;
}

/**
 * Orden de cocientes de mayor a menor (LOREG, art. 163).
 * Comparamos a.votos/a.divisor con b.votos/b.divisor por multiplicación cruzada: exacto con enteros.
 * Si dos cocientes coinciden, el escaño es para la candidatura con más votos.
 */
function compararCocientes(a: Cociente, b: Cociente): number {
  const izq = a.votos * b.divisor;
  const der = b.votos * a.divisor;
  if (izq !== der) return izq > der ? -1 : 1;
  if (a.votos !== b.votos) return a.votos > b.votos ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Reparto D'Hondt de `escanos` entre las candidaturas dadas.
 * La barrera electoral NO se aplica aquí: quien llama pasa solo las candidaturas que la superan.
 */
export function repartirDHondt(entradas: EntradaReparto[], escanos: number): ResultadoReparto {
  if (!Number.isInteger(escanos) || escanos < 0) {
    throw new ErrorDatos(`Número de escaños inválido: ${escanos}`);
  }

  const vistos = new Set<string>();
  const cocientes: Cociente[] = [];
  const resultado: Record<string, number> = {};

  for (const { id, votos } of entradas) {
    if (!Number.isFinite(votos) || votos < 0) {
      throw new ErrorDatos(`Votos inválidos para ${id}: ${votos}`);
    }
    if (vistos.has(id)) throw new ErrorDatos(`Candidatura duplicada: ${id}`);
    vistos.add(id);
    resultado[id] = 0;
    if (votos === 0) continue;
    // Con escanos+1 divisores sabemos también cuál sería el siguiente cociente de cada candidatura.
    for (let divisor = 1; divisor <= escanos + 1; divisor++) {
      cocientes.push({ id, votos, divisor, valor: votos / divisor });
    }
  }

  cocientes.sort(compararCocientes);

  const adjudicados = Math.min(escanos, cocientes.length);
  for (let i = 0; i < adjudicados; i++) {
    const c = cocientes[i];
    if (c) resultado[c.id] = (resultado[c.id] ?? 0) + 1;
  }

  let empateSorteo = false;
  const ultimo = cocientes[adjudicados - 1];
  const siguiente = cocientes[adjudicados];
  if (ultimo && siguiente && ultimo.id !== siguiente.id) {
    empateSorteo =
      ultimo.votos * siguiente.divisor === siguiente.votos * ultimo.divisor &&
      ultimo.votos === siguiente.votos;
  }

  return { escanos: resultado, clasificacion: cocientes, adjudicados, empateSorteo };
}
