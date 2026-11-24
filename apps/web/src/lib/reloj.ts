import { CALENDARIO } from './calendario';

/** Cierre de los colegios: el reloj de la simulación empieza aquí. */
export const CIERRE_COLEGIOS = Date.parse(CALENDARIO.cierreColegios);

const hora = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });
const diaSemana = new Intl.DateTimeFormat('es-ES', { weekday: 'long', timeZone: 'Europe/Madrid' });
const dia = new Intl.DateTimeFormat('es-ES', { day: 'numeric', timeZone: 'Europe/Madrid' });

/** "21:35"; pasada la medianoche añade el día: "00:35 (madrugada del lunes 30)". */
export function horaSimulada(minutosTrasElCierre: number): string {
  const t = new Date(CIERRE_COLEGIOS + minutosTrasElCierre * 60_000);
  const mismoDia = dia.format(t) === dia.format(new Date(CIERRE_COLEGIOS));
  return mismoDia ? hora.format(t) : `${hora.format(t)} (madrugada del ${diaSemana.format(t)} ${dia.format(t)})`;
}

/** "1 h 35 min tras el cierre" / "45 min tras el cierre" / "al cierre de los colegios". */
export function tiempoTrasElCierre(minutos: number): string {
  if (minutos <= 0) return 'al cierre de los colegios';
  const h = Math.floor(minutos / 60);
  const m = Math.round(minutos % 60);
  return `${h > 0 ? `${h} h ` : ''}${m > 0 || h === 0 ? `${m} min ` : ''}tras el cierre`.replace(/\s+/g, ' ').trim();
}
