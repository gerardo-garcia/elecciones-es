import { crearAgrupador, estimarVotosCera, type Circunscripcion, type ConfigCera, type GrupoConfig } from '@elecciones/engine';
import agrupacionesJson from '../../../../../data/config/agrupaciones.json';
import ceraJson from '../../../../../data/config/cera-2023.json';
import circunscripcionesJson from '../../../../../data/config/circunscripciones.json';
import historico2023 from '../../../../../data/historico/generales-2023-07.json';
import type { ReferenciasVivo } from './vivo';

/** Configuración del recuento en directo de 2026: circunscripciones 2026, CERA y participación de 2023. */
export function referenciasVivo(): ReferenciasVivo {
  const cera = ceraJson as unknown as ConfigCera;
  const censoCera = Object.fromEntries(Object.entries(cera.circunscripciones).map(([k, v]) => [k, v.censoCera]));
  const total = Object.values(censoCera).reduce((s, n) => s + n, 0);
  const participacionReferencia = Object.fromEntries(
    (historico2023 as { circunscripciones: { codigo: string; electores: number; votantes: number }[] }).circunscripciones.map((c) => [
      c.codigo,
      c.votantes / c.electores,
    ]),
  );
  return {
    circunscripciones: circunscripcionesJson.circunscripciones as Circunscripcion[],
    censoCera,
    participacionReferencia,
    agrupador: crearAgrupador(agrupacionesJson.grupos as GrupoConfig[]),
    ceraEsperados: estimarVotosCera(cera, total),
  };
}
