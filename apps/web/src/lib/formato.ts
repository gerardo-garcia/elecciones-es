const ZONA = 'Europe/Madrid';

const fechaLarga = new Intl.DateTimeFormat('es-ES', { dateStyle: 'full', timeZone: ZONA });
const fechaCorta = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', timeZone: ZONA });
const mesYAnio = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric', timeZone: ZONA });
const hora = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: ZONA });

/** "domingo, 29 de noviembre de 2026" */
export const formatoFechaLarga = (iso: string | Date) => fechaLarga.format(new Date(iso));
/** "29 de noviembre" */
export const formatoFechaCorta = (iso: string | Date) => fechaCorta.format(new Date(iso));
/** "octubre de 2026" */
export const formatoMesYAnio = (iso: string | Date) => mesYAnio.format(new Date(iso));
/** "20:00" */
export const formatoHora = (iso: string | Date) => hora.format(new Date(iso));

/** Ruta interna respetando la base de despliegue (GitHub Pages usa /<repo>/). */
export function ruta(destino: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return `${base}/${destino.replace(/^\//, '')}`;
}
