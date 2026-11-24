/**
 * Anuncios (Google AdSense). Se activan con variables de entorno, igual que SITE_URL:
 *   ADSENSE_CLIENT          ca-pub-XXXXXXXXXXXXXXXX (ID de editor). Sin él la web no carga nada de terceros.
 *   ADSENSE_SLOT_PIE        ID del bloque de anuncios del pie.
 *   ADSENSE_SLOT_LATERAL    ID del bloque de los laterales (solo si están activados).
 *   ADSENSE_LATERALES       "false" para quitar los laterales (por defecto, activados).
 *
 * Tres estados: sin ADSENSE_CLIENT, nada. Con solo ADSENSE_CLIENT, **modo verificación**: la etiqueta `meta` y `ads.txt`
 * con los que AdSense comprueba que el sitio es tuyo, sin ningún script ni anuncio ni cookie. Con los bloques, anuncios.
 */

/** Ancho de pantalla desde el que caben los laterales junto a la columna de contenido (`--ancho` + 2 × 160 px + márgenes). */
export const ANCHO_MINIMO_LATERALES = 1400;

/** Identificador de la entidad que certifica a Google como vendedor autorizado en `ads.txt` (valor fijo de Google). */
const AUTORIDAD_GOOGLE = 'f08c47fec0942fa0';

export interface ConfigAnuncios {
  cliente: string;
  /** null en modo verificación: sin bloques de anuncios. */
  huecoPie: string | null;
  /** null si los laterales están desactivados (o en modo verificación). */
  huecoLateral: string | null;
}

/** Configuración con anuncios de verdad (no solo verificación del sitio). */
export type ConfigConAnuncios = ConfigAnuncios & { huecoPie: string };

export function muestraAnuncios(config: ConfigAnuncios | null): config is ConfigConAnuncios {
  return config !== null && config.huecoPie !== null;
}

/** Datos del responsable del sitio (aviso legal, art. 10 de la LSSI). Se publican en /privacidad/. */
export interface Titular {
  nombre: string;
  domicilio: string;
  contacto: string;
  nif?: string;
}

const CLIENTE = /^ca-pub-\d{10,}$/;
const HUECO = /^\d{6,}$/;

type Entorno = Record<string, string | undefined>;

/** null si no hay anuncios configurados. Si lo hay pero mal escrito, falla: mejor que un anuncio roto en producción. */
export function configuracionAnuncios(env: Entorno): ConfigAnuncios | null {
  const cliente = env.ADSENSE_CLIENT?.trim();
  if (!cliente) return null;
  if (!CLIENTE.test(cliente)) throw new Error(`ADSENSE_CLIENT no tiene el formato ca-pub-XXXXXXXXXXXXXXXX: «${cliente}»`);

  const huecoPie = env.ADSENSE_SLOT_PIE?.trim() ?? '';
  const huecoLateral = env.ADSENSE_SLOT_LATERAL?.trim() ?? '';
  if (!huecoPie && !huecoLateral) return { cliente, huecoPie: null, huecoLateral: null };
  if (!HUECO.test(huecoPie)) throw new Error('Con bloques de anuncios hace falta ADSENSE_SLOT_PIE (el ID numérico del bloque del pie).');

  if (env.ADSENSE_LATERALES?.trim().toLowerCase() === 'false') return { cliente, huecoPie, huecoLateral: null };
  if (!HUECO.test(huecoLateral)) {
    throw new Error('Con los laterales activados hace falta ADSENSE_SLOT_LATERAL (o ADSENSE_LATERALES=false para quitarlos).');
  }
  return { cliente, huecoPie, huecoLateral };
}

export function urlScriptAnuncios(cliente: string): string {
  return `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(cliente)}`;
}

/** Línea de `ads.txt` que declara a Google como vendedor autorizado. */
export function lineaAdsTxt(cliente: string): string {
  return `google.com, ${cliente.replace(/^ca-/, '')}, DIRECT, ${AUTORIDAD_GOOGLE}`;
}

/** Con anuncios (actividad económica) la ley exige identificar al titular: sin sus datos no se construye la web. */
export function exigirTitular(titular: Partial<Titular>): Titular {
  const faltan = (['nombre', 'domicilio', 'contacto'] as const).filter((campo) => !titular[campo]?.trim());
  if (faltan.length > 0) {
    throw new Error(
      `Hay anuncios configurados pero faltan datos del titular en src/data/titular.json: ${faltan.join(', ')}. ` +
        'Se publican en /privacidad/ (aviso legal).',
    );
  }
  return titular as Titular;
}

export const ANUNCIOS = (): ConfigAnuncios | null => configuracionAnuncios(process.env);
