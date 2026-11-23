const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** "6 días y 3 horas", "2 horas y 5 minutos", "45 minutos". null si el instante ya pasó. */
export function textoCuentaAtras(milisegundos: number): string | null {
  if (milisegundos <= 0) return null;
  const minutosTotales = Math.floor(milisegundos / 60_000);
  const dias = Math.floor(minutosTotales / 1_440);
  const horas = Math.floor((minutosTotales % 1_440) / 60);
  const minutos = minutosTotales % 60;

  if (dias > 0) {
    return horas > 0 ? `${plural(dias, 'día', 'días')} y ${plural(horas, 'hora', 'horas')}` : plural(dias, 'día', 'días');
  }
  if (horas > 0) {
    return minutos > 0 ? `${plural(horas, 'hora', 'horas')} y ${plural(minutos, 'minuto', 'minutos')}` : plural(horas, 'hora', 'horas');
  }
  return plural(Math.max(minutos, 1), 'minuto', 'minutos');
}
