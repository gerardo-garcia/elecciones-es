import {
  construirVista,
  crearAgrupador,
  crearEscenario,
  estimarVotosCera,
  instantanea,
  instantaneaFinal,
  leerMunicipios,
  minutosHastaCompleto,
  proyectarInstantanea,
  type Circunscripcion,
  type ConfigCera,
  type GrupoConfig,
  type MunicipiosCompactos,
  type OrdenEscrutinio,
  type VistaRecuento,
} from '@elecciones/engine';
import agrupacionesJson from '../../../../data/config/agrupaciones.json';
import ceraJson from '../../../../data/config/cera-2023.json';
import circunscripcionesJson from '../../../../data/config/circunscripciones.json';
import municipiosJson from '../../../../data/simulacion/generales-2023-municipios.json';

/**
 * Noche electoral simulada con los datos de las generales de 2023 (votos por municipio y escaños de 2023). Solo en el
 * build: el motor calcula cada instante y la web recibe las vistas ya hechas (ver pages/simulacion/).
 */

export const ORDENES: readonly OrdenEscrutinio[] = ['aleatorio', 'rurales-primero', 'urbanos-primero'];

export const NOMBRE_ORDEN: Record<OrdenEscrutinio, string> = {
  aleatorio: 'Aleatorio: llegan mesas de todo tipo',
  'rurales-primero': 'Primero los municipios pequeños',
  'urbanos-primero': 'Primero las grandes ciudades',
};

/** Semilla del azar: la misma noche en cada build. */
export const SEMILLA = 7;
/** Separación entre instantes, en minutos simulados. */
export const PASO_MINUTOS = 5;

export interface NocheSimulada {
  orden: OrdenEscrutinio;
  semilla: number;
  /** Minutos tras el cierre de los colegios de cada instante. */
  minutos: number[];
  vistas: VistaRecuento[];
}

const datos = municipiosJson as unknown as MunicipiosCompactos & { escanos: Record<string, number> };

/** Circunscripciones de 2026 (nombres) con los escaños de 2023: así el final reproduce el reparto de 2023. */
export function circunscripcionesDe2023(): Circunscripcion[] {
  const config = circunscripcionesJson.circunscripciones as Circunscripcion[];
  return config.map((c) => {
    const escanos = datos.escanos[c.codigo];
    if (escanos === undefined) throw new Error(`Faltan los escaños de 2023 de la circunscripción ${c.codigo}`);
    return { ...c, escanos };
  });
}

/**
 * Agrupación de siglas de 2026 más dos alias que en 2023 se escribían distinto (Junts y Coalición Canaria): con las
 * siglas de 2023 las formaciones que 2026 agrupa serían, si no, grupos sueltos. Se quita el texto «incluye» de los
 * grupos: describe coaliciones de 2026 (como UPN-PP) que en los datos de 2023 no existen.
 */
const ALIAS_2023: Record<string, string[]> = { junts: ['JxCAT - JUNTS'], cc: ['CCa'] };

export function agrupadorDe2023() {
  const grupos = (agrupacionesJson.grupos as GrupoConfig[]).map(({ incluye: _incluye, ...g }) => ({
    ...g,
    alias: [...g.alias, ...(ALIAS_2023[g.id] ?? [])],
  }));
  return crearAgrupador(grupos);
}

const memoria = new Map<OrdenEscrutinio, NocheSimulada>();

export function nocheSimulada(orden: OrdenEscrutinio): NocheSimulada {
  const hecha = memoria.get(orden);
  if (hecha) return hecha;

  const circunscripciones = circunscripcionesDe2023();
  const agrupador = agrupadorDe2023();
  const cera = ceraJson as unknown as ConfigCera;
  const censoCera = Object.values(cera.circunscripciones).reduce((s, c) => s + c.censoCera, 0);
  // Mismo censo CERA que en 2023 y margen por defecto: lo que se espera del voto exterior, que se escruta días después.
  const ceraEsperados = estimarVotosCera(cera, censoCera);

  const escenario = crearEscenario(leerMunicipios(datos), { semilla: SEMILLA, orden });
  const ultimo = minutosHastaCompleto(escenario);
  const minutos: number[] = [];
  for (let m = 0; m < ultimo; m += PASO_MINUTOS) minutos.push(m);
  minutos.push(ultimo);

  const vistas = minutos.map((m, i) => {
    const inst = i === minutos.length - 1 ? instantaneaFinal(escenario) : instantanea(escenario, m);
    return construirVista(proyectarInstantanea(circunscripciones, inst), {
      agrupador,
      porcentajeCensoNacional: inst.porcentajeCenso,
      ceraEsperados,
    });
  });

  const noche = { orden, semilla: SEMILLA, minutos, vistas };
  memoria.set(orden, noche);
  return noche;
}

/** Instante con el que se abre la página: a la hora y media del cierre, cuando ya hay mucho en juego. */
export function indiceInicial(noche: NocheSimulada): number {
  const i = noche.minutos.findIndex((m) => m >= 90);
  return i < 0 ? noche.minutos.length - 1 : i;
}
