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
  /**
   * Censo de la circunscripción SIN el voto exterior (CER: residentes en España, el que vota en las mesas).
   * El censo CERA no entra aquí: se escruta aparte, ver `VotosCera`.
   */
  censo: number;
  /** Censo de las mesas ya escrutadas. */
  censoEscrutado: number;
  blancos: number;
  candidaturas: VotosCandidatura[];
}

/**
 * Voto de los residentes ausentes (CERA) de una circunscripción.
 * No se cuenta la noche electoral: llega con el escrutinio general de las Juntas Electorales, días después,
 * y de una sola vez. Por eso se suma tal cual, sin extrapolar. El voto por correo de los residentes en
 * España NO va aquí: se cuenta en su mesa junto al resto y ya está en el escrutinio normal.
 */
export interface VotosCera {
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
