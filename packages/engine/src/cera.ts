import { ErrorDatos } from './tipos';

/** Peso del voto exterior en unas elecciones de referencia (ver data/config/cera-2023.json). */
export interface ConfigCera {
  circunscripciones: Record<
    string,
    {
      /** Electores CERA inscritos. */
      censoCera: number;
      votantesCera: number;
      /** Votos a candidaturas + blancos del voto CERA. */
      votosValidosCera: number;
    }
  >;
}

/**
 * Estima cuántos votos válidos CERA llegarán a cada circunscripción en las elecciones nuevas:
 *
 *     votos de referencia × (censo CERA nacional nuevo / censo CERA nacional de referencia) × margen
 *
 * Es decir: la misma participación y el mismo reparto territorial que en la elección de referencia,
 * escalados por el crecimiento del censo CERA. El `margen` (por defecto 1,5) es holgura por si la
 * participación sube. Solo se usa para avisar de dónde el CERA podría decidir un escaño, nunca para
 * repartir escaños: la estimación no dice a quién votarán.
 */
export function estimarVotosCera(
  config: ConfigCera,
  censoCeraNacionalNuevo: number,
  margen = 1.5,
): Record<string, number> {
  if (!(censoCeraNacionalNuevo > 0)) throw new ErrorDatos(`Censo CERA nacional inválido: ${censoCeraNacionalNuevo}`);
  if (!(margen >= 1)) throw new ErrorDatos(`El margen debe ser >= 1: ${margen}`);
  const referencia = Object.values(config.circunscripciones).reduce((s, c) => s + c.censoCera, 0);
  if (!(referencia > 0)) throw new ErrorDatos('La configuración CERA de referencia no tiene censo');
  const crecimiento = censoCeraNacionalNuevo / referencia;
  return Object.fromEntries(
    Object.entries(config.circunscripciones).map(([codigo, c]) => [codigo, c.votosValidosCera * crecimiento * margen]),
  );
}
