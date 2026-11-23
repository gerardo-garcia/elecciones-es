import { ErrorDatos } from './tipos';

export type Confianza = 'alta' | 'media' | 'baja';

export interface GrupoConfig {
  id: string;
  nombre: string;
  color?: string;
  confianza: Confianza;
  /** Siglas (o denominaciones cortas) que pertenecen al grupo. Se comparan ya normalizadas. */
  alias: string[];
  /**
   * Texto que debe acompañar al grupo en gráficos y tablas cuando suma partidos distintos
   * (p. ej. "PP y UPN-PP (coalición con UPN en Navarra)").
   */
  incluye?: string;
  /** Marca los grupos cuya composición debe decidir una persona. */
  pendienteDecision?: boolean;
  notas?: string;
}

export interface Agrupacion {
  id: string;
  nombre: string;
  /** Qué partidos suma el grupo, si hay que decirlo (ver `GrupoConfig.incluye`). */
  incluye?: string;
  /** false si las siglas no están en ningún grupo: cuentan por separado. */
  agrupada: boolean;
}

export type Agrupador = (siglas: string) => Agrupacion;

/** "PSdeG-PSOE" → "PSDEGPSOE"; "B.N.G." → "BNG"; "Aramés" → "ARAMES". */
export function normalizarSiglas(siglas: string): string {
  return siglas
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

/**
 * Construye una función siglas → grupo. Las siglas sin grupo no se pierden:
 * cuentan como su propia agrupación (`agrupada: false`).
 */
export function crearAgrupador(grupos: GrupoConfig[]): Agrupador {
  const porAlias = new Map<string, GrupoConfig>();
  const ids = new Set<string>();

  for (const grupo of grupos) {
    if (ids.has(grupo.id)) throw new ErrorDatos(`Grupo duplicado: ${grupo.id}`);
    ids.add(grupo.id);
    for (const alias of grupo.alias) {
      const clave = normalizarSiglas(alias);
      if (!clave) throw new ErrorDatos(`Alias vacío tras normalizar en el grupo ${grupo.id}: "${alias}"`);
      const previo = porAlias.get(clave);
      if (previo && previo.id !== grupo.id) {
        throw new ErrorDatos(`El alias "${alias}" está en dos grupos: ${previo.id} y ${grupo.id}`);
      }
      porAlias.set(clave, grupo);
    }
  }

  return (siglas: string): Agrupacion => {
    const clave = normalizarSiglas(siglas);
    const grupo = porAlias.get(clave);
    if (grupo) {
      return grupo.incluye === undefined
        ? { id: grupo.id, nombre: grupo.nombre, agrupada: true }
        : { id: grupo.id, nombre: grupo.nombre, incluye: grupo.incluye, agrupada: true };
    }
    return { id: `sin-agrupar:${clave}`, nombre: siglas, agrupada: false };
  };
}
