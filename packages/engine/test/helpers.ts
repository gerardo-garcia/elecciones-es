import type { Circunscripcion, Escrutinio } from '../src';

/** PRNG determinista (mulberry32) para que los tests aleatorios sean reproducibles. */
export function crearAzar(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function entero(azar: () => number, min: number, max: number): number {
  return min + Math.floor(azar() * (max - min + 1));
}

export function circ(
  codigo: string,
  escanos: number,
  tipo: Circunscripcion['tipo'] = 'proporcional',
): Circunscripcion {
  return { codigo, nombre: `Circ ${codigo}`, escanos, tipo };
}

/** Escrutinio completo (100 % del censo) con los votos dados. */
export function escrutinioCompleto(
  codigo: string,
  votos: Record<string, number>,
  blancos = 0,
  censo = 1_000_000,
): Escrutinio {
  return {
    codigo,
    censo,
    censoEscrutado: censo,
    blancos,
    candidaturas: Object.entries(votos).map(([siglas, v]) => ({ siglas, votos: v })),
  };
}
