import { crearAzar, normalEstandar } from './azar';
import { ErrorDatos, type Escrutinio } from './tipos';

/**
 * Simulación de una noche electoral a partir de unos resultados municipales ya conocidos.
 *
 * Sirve para construir y probar la web y para medir cuánto se equivoca la proyección (backtest) sin
 * necesitar la fuente en vivo. Es un MODELO, no una reconstrucción de lo que pasó esa noche:
 *
 *  - Cada municipio se reparte entre sus mesas reales a partes iguales (con enteros, sin perder ni un voto):
 *    dentro de un municipio no hay diferencias entre mesas, así que la proyección es más fácil de lo real.
 *  - El orden en que llegan los municipios de cada provincia es una hipótesis (`OrdenEscrutinio`).
 *  - La velocidad del escrutinio es una curva sintética, distinta en cada provincia (`CurvaEscrutinio`).
 *
 * Todo es determinista dado el `semilla`.
 */

export interface Municipio {
  /** Código INE de la circunscripción ("28"). */
  circunscripcion: string;
  /** Número de mesas del municipio (al menos 1). */
  mesas: number;
  censo: number;
  blancos: number;
  /** Votos a candidaturas, por siglas. */
  votos: Record<string, number>;
}

/** Formato compacto de `data/simulacion/generales-2023-municipios.json`. */
export interface MunicipiosCompactos {
  partidos: string[];
  /** [provincia, mesas, censo, blancos, partido, votos, partido, votos, ...] */
  municipios: number[][];
}

/** Lee el formato compacto validándolo: un fichero corrupto falla aquí, no a mitad de la simulación. */
export function leerMunicipios(datos: MunicipiosCompactos): Municipio[] {
  const entero = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0;
  return datos.municipios.map((fila, i) => {
    if (fila.length < 4 || fila.length % 2 !== 0) throw new ErrorDatos(`Municipio ${i}: longitud inválida (${fila.length})`);
    const [provincia, mesas, censo, blancos, ...pares] = fila;
    if (![provincia, mesas, censo, blancos].every(entero) || (mesas as number) < 1) {
      throw new ErrorDatos(`Municipio ${i}: provincia, mesas, censo o blancos inválidos`);
    }
    const votos: Record<string, number> = {};
    for (let k = 0; k < pares.length; k += 2) {
      const siglas = datos.partidos[pares[k] as number];
      const v = pares[k + 1];
      if (siglas === undefined) throw new ErrorDatos(`Municipio ${i}: partido ${pares[k]} fuera de la lista`);
      if (!entero(v)) throw new ErrorDatos(`Municipio ${i}: votos inválidos para ${siglas}`);
      if (siglas in votos) throw new ErrorDatos(`Municipio ${i}: partido repetido ${siglas}`);
      votos[siglas] = v;
    }
    return {
      circunscripcion: String(provincia).padStart(2, '0'),
      mesas: mesas as number,
      censo: censo as number,
      blancos: blancos as number,
      votos,
    };
  });
}

/**
 * En qué orden llegan los municipios de cada provincia:
 *  - 'aleatorio': como una muestra al azar, sin sesgo.
 *  - 'rurales-primero': de menor a mayor población (con algo de ruido). Es lo habitual y sesga la proyección.
 *  - 'urbanos-primero': de mayor a menor. Sesgo contrario, como prueba de estrés.
 */
export type OrdenEscrutinio = 'aleatorio' | 'rurales-primero' | 'urbanos-primero';

/**
 * Cuánto del censo está escrutado en cada instante: Weibull, F(t) = 1 − exp(−(t/λ)^κ), con t en minutos desde que la
 * provincia empieza a dar datos. Cada provincia tiene su propio retraso y velocidad (sorteados en los rangos dados).
 * Los valores por defecto son inventados: con el escrutinio arrancando a las 20:00 dan ~45 % del censo a las
 * 21:30, ~70 % a las 22:00, ~94 % a las 23:00 y ~99 % a las 00:00. No son una medición de ninguna noche real.
 */
export interface CurvaEscrutinio {
  lambdaMin: number;
  kappa: number;
  /** Rango (minutos) del retraso con que cada provincia empieza a dar datos. */
  retrasoMin: [number, number];
  /** Rango del factor de velocidad de cada provincia (>0; 1 = la curva tal cual). */
  velocidad: [number, number];
}

export const CURVA_POR_DEFECTO: CurvaEscrutinio = {
  lambdaMin: 80,
  kappa: 1.8,
  retrasoMin: [8, 50],
  velocidad: [0.75, 1.35],
};

export interface OpcionesEscenario {
  semilla?: number;
  orden?: OrdenEscrutinio;
  curva?: Partial<CurvaEscrutinio>;
  /** Ruido (desviación típica del logaritmo de la población) con que se desordenan 'rurales/urbanos-primero'. */
  ruidoOrden?: number;
}

interface Provincia {
  codigo: string;
  censoTotal: number;
  municipios: Municipio[];
  /** Acumulados tras contar los k primeros municipios completos: longitud n + 1, acum[0] = 0. */
  acumCenso: Float64Array;
  acumBlancos: Float64Array;
  acumVotos: Map<string, Float64Array>;
  retrasoMin: number;
  velocidad: number;
}

export interface Escenario {
  readonly curva: CurvaEscrutinio;
  readonly censoNacional: number;
  /** Provincias ordenadas por código. */
  readonly provincias: readonly Provincia[];
}

/** Por encima de esta fracción, la provincia se da por completa (la Weibull solo llega a 1 en el infinito). */
const UMBRAL_COMPLETO = 0.999;

function validarCurva(c: CurvaEscrutinio): void {
  const ok =
    c.lambdaMin > 0 && c.kappa > 0 &&
    c.retrasoMin[0] >= 0 && c.retrasoMin[0] <= c.retrasoMin[1] &&
    c.velocidad[0] > 0 && c.velocidad[0] <= c.velocidad[1];
  if (!ok) throw new ErrorDatos(`Curva de escrutinio inválida: ${JSON.stringify(c)}`);
}

export function crearEscenario(municipios: Municipio[], opciones: OpcionesEscenario = {}): Escenario {
  const { semilla = 1, orden = 'rurales-primero', ruidoOrden = 0.5 } = opciones;
  const curva: CurvaEscrutinio = { ...CURVA_POR_DEFECTO, ...opciones.curva };
  validarCurva(curva);
  if (municipios.length === 0) throw new ErrorDatos('No hay municipios para simular');

  const porProvincia = new Map<string, Municipio[]>();
  for (const m of municipios) {
    if (!(m.mesas >= 1 && m.censo >= 0)) throw new ErrorDatos(`Municipio inválido en ${m.circunscripcion}`);
    const lista = porProvincia.get(m.circunscripcion) ?? [];
    lista.push(m);
    porProvincia.set(m.circunscripcion, lista);
  }

  const azar = crearAzar(semilla);
  const provincias: Provincia[] = [...porProvincia.keys()].sort().map((codigo) => {
    const retrasoMin = curva.retrasoMin[0] + azar() * (curva.retrasoMin[1] - curva.retrasoMin[0]);
    const [vMin, vMax] = curva.velocidad;
    const velocidad = Math.exp(Math.log(vMin) + azar() * (Math.log(vMax) - Math.log(vMin)));

    let ordenados = [...(porProvincia.get(codigo) as Municipio[])];
    if (orden === 'aleatorio') {
      for (let i = ordenados.length - 1; i > 0; i--) {
        const j = Math.floor(azar() * (i + 1));
        [ordenados[i], ordenados[j]] = [ordenados[j] as Municipio, ordenados[i] as Municipio];
      }
    } else {
      const signo = orden === 'rurales-primero' ? 1 : -1;
      ordenados = ordenados
        .map((m) => ({ m, clave: signo * (Math.log(m.censo + 1) + ruidoOrden * normalEstandar(azar)) }))
        .sort((a, b) => a.clave - b.clave)
        .map((x) => x.m);
    }

    const n = ordenados.length;
    const siglas = [...new Set(ordenados.flatMap((m) => Object.keys(m.votos)))].sort();
    const acumCenso = new Float64Array(n + 1);
    const acumBlancos = new Float64Array(n + 1);
    const acumVotos = new Map(siglas.map((s) => [s, new Float64Array(n + 1)] as const));
    ordenados.forEach((m, i) => {
      acumCenso[i + 1] = (acumCenso[i] as number) + m.censo;
      acumBlancos[i + 1] = (acumBlancos[i] as number) + m.blancos;
      for (const [s, acum] of acumVotos) acum[i + 1] = (acum[i] as number) + (m.votos[s] ?? 0);
    });
    return { codigo, censoTotal: acumCenso[n] as number, municipios: ordenados, acumCenso, acumBlancos, acumVotos, retrasoMin, velocidad };
  });

  return { curva, censoNacional: provincias.reduce((s, p) => s + p.censoTotal, 0), provincias };
}

/** Fracción del censo de la provincia ya escrutada a los `minutos` de empezar la noche. */
function fraccionEscrutada(curva: CurvaEscrutinio, p: Provincia, minutos: number): number {
  const t = Math.max(0, (minutos - p.retrasoMin) * p.velocidad);
  if (t === 0) return 0;
  const f = 1 - Math.exp(-Math.pow(t / curva.lambdaMin, curva.kappa));
  return f >= UMBRAL_COMPLETO ? 1 : f;
}

/** Minuto en que la última provincia queda completa. */
export function minutosHastaCompleto(e: Escenario): number {
  const tCompleto = e.curva.lambdaMin * Math.pow(-Math.log(1 - UMBRAL_COMPLETO), 1 / e.curva.kappa);
  return Math.max(...e.provincias.map((p) => p.retrasoMin + tCompleto / p.velocidad));
}

/** `floor(j · total / mesas)`: lo que suman las `j` primeras de `mesas` mesas si el reparto es a partes iguales. */
const parte = (total: number, j: number, mesas: number) => Math.floor((j * total) / mesas);

function escrutinioProvincia(p: Provincia, f: number): Escrutinio | null {
  const n = p.municipios.length;
  let k = n;
  let j = 0;
  if (f < 1) {
    const objetivo = f * p.censoTotal;
    // Mayor k con acumCenso[k] <= objetivo.
    let lo = 0;
    let hi = n;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if ((p.acumCenso[mid] as number) <= objetivo) lo = mid;
      else hi = mid - 1;
    }
    k = lo;
    if (k < n) {
      const m = p.municipios[k] as Municipio;
      j = m.censo > 0 ? Math.min(m.mesas - 1, Math.floor(((objetivo - (p.acumCenso[k] as number)) / m.censo) * m.mesas)) : 0;
    }
  }
  const parcial = k < n ? (p.municipios[k] as Municipio) : null;
  const censoEscrutado = (p.acumCenso[k] as number) + (parcial ? parte(parcial.censo, j, parcial.mesas) : 0);
  if (censoEscrutado <= 0) return null;

  const candidaturas = [];
  for (const [siglas, acum] of p.acumVotos) {
    const votos = (acum[k] as number) + (parcial ? parte(parcial.votos[siglas] ?? 0, j, parcial.mesas) : 0);
    if (votos > 0) candidaturas.push({ siglas, votos });
  }
  return {
    codigo: p.codigo,
    censo: p.censoTotal,
    censoEscrutado,
    blancos: (p.acumBlancos[k] as number) + (parcial ? parte(parcial.blancos, j, parcial.mesas) : 0),
    candidaturas,
  };
}

/** Lo que se ve de la noche electoral en un instante: lo mismo que entregará la fuente en vivo. */
export interface Instantanea {
  /** Minutos desde el cierre de los colegios. */
  minutos: number;
  /** Censo escrutado en toda España, de 0 a 1 (incluye las provincias que aún no dan datos). */
  porcentajeCenso: number;
  /** Solo las circunscripciones que ya dan datos, ordenadas por código. */
  escrutinios: Escrutinio[];
}

function construir(e: Escenario, minutos: number, completo: boolean): Instantanea {
  const escrutinios: Escrutinio[] = [];
  for (const p of e.provincias) {
    const f = completo ? 1 : fraccionEscrutada(e.curva, p, minutos);
    if (f <= 0) continue;
    const esc = escrutinioProvincia(p, f);
    if (esc) escrutinios.push(esc);
  }
  const escrutado = escrutinios.reduce((s, x) => s + x.censoEscrutado, 0);
  return { minutos, porcentajeCenso: escrutado / e.censoNacional, escrutinios };
}

/** Estado del escrutinio `minutos` después del cierre de los colegios. */
export function instantanea(e: Escenario, minutos: number): Instantanea {
  if (!Number.isFinite(minutos) || minutos < 0) throw new ErrorDatos(`Minutos inválidos: ${minutos}`);
  return construir(e, minutos, false);
}

/** Escrutinio completo (100 % del censo) de todas las circunscripciones, sin voto exterior. */
export function instantaneaFinal(e: Escenario): Instantanea {
  return construir(e, minutosHastaCompleto(e), true);
}
