/**
 * Generador pseudoaleatorio determinista (mulberry32). Misma semilla, misma secuencia: las simulaciones
 * y los informes del backtest se pueden reproducir. No es criptográfico ni pretende serlo.
 */
export function crearAzar(semilla: number): () => number {
  let s = semilla >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Normal estándar (Box-Muller) a partir de un generador uniforme en [0, 1). */
export function normalEstandar(azar: () => number): number {
  const u = 1 - azar(); // (0, 1]
  const v = azar();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
