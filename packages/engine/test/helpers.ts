import type { Circunscripcion, Escrutinio } from '../src';

export { crearAzar } from '../src/azar';

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
