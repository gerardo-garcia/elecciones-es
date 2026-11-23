/**
 * Tipos del dominio electoral. El motor es puro: sin red, sin ficheros, sin fechas.
 */

export type TipoCircunscripcion = 'proporcional' | 'mayoritaria';

export interface Circunscripcion {
  /** Código INE de provincia ("28" = Madrid, "51" = Ceuta, "52" = Melilla). */
  codigo: string;
  nombre: string;
  /** Diputados que elige (anexo del real decreto de convocatoria). */
  escanos: number;
  /** Ceuta y Melilla eligen un diputado por mayoría simple; el resto, proporcional. */
  tipo: TipoCircunscripcion;
}

export interface VotosCandidatura {
  /** Siglas tal y como las publica la fuente (se normalizan al agrupar). */
  siglas: string;
  votos: number;
}

/** Escrutinio provisional de una circunscripción en un instante dado (votos realmente escrutados). */
export interface Escrutinio {
  /** Código INE de la circunscripción. */
  codigo: string;
  /** Censo electoral total de la circunscripción. */
  censo: number;
  /** Censo de las mesas ya escrutadas. */
  censoEscrutado: number;
  blancos: number;
  candidaturas: VotosCandidatura[];
}

/** Datos de entrada incoherentes (negativos, censo escrutado > censo, duplicados...). */
export class ErrorDatos extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ErrorDatos';
  }
}
