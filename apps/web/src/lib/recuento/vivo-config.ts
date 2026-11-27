import { crearAgrupador, type Circunscripcion, type GrupoConfig } from '@elecciones/engine';
import agrupacionesJson from '../../../../../data/config/agrupaciones.json';
import circunscripcionesJson from '../../../../../data/config/circunscripciones.json';
import type { ReferenciasVivo } from './vivo';

/**
 * Configuración del recuento en directo de 2026: circunscripciones y agrupación de siglas de 2026. Todos los números
 * (censo, participación, votos) salen de la fuente de esta elección. No se usa ningún dato de otra elección: tampoco
 * una estimación del voto exterior pendiente, que solo se podría hacer con el de 2023.
 */
export function referenciasVivo(): ReferenciasVivo {
  return {
    circunscripciones: circunscripcionesJson.circunscripciones as Circunscripcion[],
    agrupador: crearAgrupador(agrupacionesJson.grupos as GrupoConfig[]),
  };
}
