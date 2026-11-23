import municipiosJson from '../../../data/simulacion/generales-2023-municipios.json';
import fixtureJson from './fixtures/generales-2023.json';
import { leerMunicipios, type Circunscripcion, type Municipio, type MunicipiosCompactos } from '../src';

/** Datos oficiales de 2023 ya leídos, compartidos por los tests de simulación y backtest. */
export interface Circ2023 {
  codigo: string;
  nombre: string;
  escanos: number;
  censoCER: number;
  cer: { blancos: number; votos: Record<string, number> };
  cera: { blancos: number; votos: Record<string, number> };
  escanosOficiales: Record<string, number>;
}

export const circ2023 = (fixtureJson as unknown as { circunscripciones: Circ2023[] }).circunscripciones;

export const circunscripciones2023: Circunscripcion[] = circ2023.map((c) => ({
  codigo: c.codigo,
  nombre: c.nombre,
  escanos: c.escanos,
  tipo: c.codigo === '51' || c.codigo === '52' ? 'mayoritaria' : 'proporcional',
}));

export const municipios2023: Municipio[] = leerMunicipios(municipiosJson as unknown as MunicipiosCompactos);
