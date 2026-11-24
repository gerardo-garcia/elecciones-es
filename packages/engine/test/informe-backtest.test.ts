import { describe, it } from 'vitest';
import { circunscripciones2023, municipios2023 } from './datos2023';
import { backtest, crearEscenario, type OrdenEscrutinio } from '../src';

/**
 * Informe del backtest para la documentación (docs/metodologia.md). No es un test: solo se ejecuta a mano con
 *
 *   INFORME_BACKTEST=1 pnpm --filter @elecciones/engine exec vitest run test/informe-backtest.test.ts
 *
 * e imprime una tabla Markdown con 20 noches simuladas (semillas 1-20) por cada orden de llegada.
 */
const NOCHES = 20;
const CORTES = [0.5, 0.75, 0.9, 0.95, 0.99];
const ORDENES: OrdenEscrutinio[] = ['aleatorio', 'rurales-primero', 'urbanos-primero'];

const mediana = (xs: number[]) => {
  const o = [...xs].sort((a, b) => a - b);
  const m = o.length >> 1;
  return o.length % 2 ? (o[m] as number) : ((o[m - 1] as number) + (o[m] as number)) / 2;
};

describe.skipIf(!process.env.INFORME_BACKTEST)('informe del backtest', () => {
  it('imprime la tabla', { timeout: 300_000 }, () => {
    const filas: string[] = [
      '| Orden de llegada | Censo escrutado | Circunscripciones con reparto distinto del final (mediana / máx.) | De ellas, fuera de la tabla de disputa (máx.) | Minuto en que se estabiliza (mediana / máx.) | % de censo al que la tabla se reduce / se queda sin filas (mediana) |',
      '|---|---|---|---|---|---|',
    ];
    for (const orden of ORDENES) {
      const noches = Array.from({ length: NOCHES }, (_, i) =>
        backtest(circunscripciones2023, crearEscenario(municipios2023, { semilla: i + 1, orden })),
      );
      const estables = noches.map((n) => n.minutoEstable ?? n.minutosCompleto);
      const primero = (estado: string) =>
        noches.flatMap((n) => {
          const p = n.puntos.find((x) => (estado === 'reducida' ? x.estadoTabla !== 'normal' : x.estadoTabla === estado));
          return p ? [p.porcentajeCenso * 100] : [];
        });
      const reducida = primero('reducida');
      const vacia = primero('sin-vuelco');
      const descartados = noches.reduce((s, n) => s + n.puntos.reduce((a, p) => a + p.cambiosDescartados, 0), 0);
      if (descartados !== 0) throw new Error(`El criterio de vuelco ha descartado ${descartados} cambios reales`);
      for (const corte of CORTES) {
        // Para cada noche, el primer punto con todas las circunscripciones con datos y al menos `corte` del censo.
        const puntos = noches.flatMap((n) => {
          const p = n.puntos.find((x) => x.escanosPendientes === 0 && x.porcentajeCenso >= corte);
          return p ? [p] : [];
        });
        const dist = puntos.map((p) => p.circunscripcionesDistintas);
        const fuera = puntos.map((p) => p.circunscripcionesDistintas - p.distintasEnTabla);
        const primera = corte === CORTES[0];
        filas.push(
          `| ${primera ? orden : ''} | ${Math.round(corte * 100)} % | ${mediana(dist)} / ${Math.max(...dist)} | ${Math.max(...fuera)} | ${
            primera ? `${mediana(estables)} / ${Math.max(...estables)}` : ''
          } | ${primera ? `${mediana(reducida).toFixed(1)} % / ${mediana(vacia).toFixed(1)} %` : ''} |`,
        );
      }
    }
    console.log(`\n${filas.join('\n')}\n`);
  });
});
