/** Utilidades para construir HTML y SVG a mano: escape de texto y formato de números en español. */

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escapa texto que va dentro de un elemento o de un atributo entre comillas. Los nombres vienen de la fuente de datos. */
export function esc(texto: string | number): string {
  return String(texto).replace(/[&<>"']/g, (c) => ESCAPES[c] as string);
}

const entero = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 });
const decimales = (n: number) => new Intl.NumberFormat('es-ES', { minimumFractionDigits: n, maximumFractionDigits: n });
const formatos = new Map<number, Intl.NumberFormat>();

/** 1234567 → "1.234.567" (con puntos de millar también por debajo de 10.000). */
export function numero(n: number): string {
  return entero.format(n).replace(/ /g, ' ').replace(/^(\d)(\d{3})$/, '$1.$2');
}

/** 0,6234 → "62,3 %" (el parámetro es la fracción de 0 a 1). */
export function porcentaje(fraccion: number, cifras = 1): string {
  let f = formatos.get(cifras);
  if (!f) {
    f = decimales(cifras);
    formatos.set(cifras, f);
  }
  return `${f.format(fraccion * 100)}\u00a0%`;
}

/** Redondea a 1 decimal para atributos SVG (evita ruido como 12.300000000000001). */
export const r1 = (n: number): string => (Math.round(n * 10) / 10).toString();
