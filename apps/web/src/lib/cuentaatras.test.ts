import { describe, expect, it } from 'vitest';
import { textoCuentaAtras } from './cuentaatras';

const min = 60_000;
const hora = 60 * min;
const dia = 24 * hora;

describe('textoCuentaAtras', () => {
  it('días y horas', () => {
    expect(textoCuentaAtras(6 * dia + 3 * hora)).toBe('6 días y 3 horas');
    expect(textoCuentaAtras(1 * dia + 1 * hora)).toBe('1 día y 1 hora');
    expect(textoCuentaAtras(2 * dia)).toBe('2 días');
  });

  it('horas y minutos', () => {
    expect(textoCuentaAtras(2 * hora + 5 * min)).toBe('2 horas y 5 minutos');
    expect(textoCuentaAtras(3 * hora)).toBe('3 horas');
  });

  it('minutos, con un mínimo de 1', () => {
    expect(textoCuentaAtras(45 * min)).toBe('45 minutos');
    expect(textoCuentaAtras(20_000)).toBe('1 minuto');
  });

  it('devuelve null cuando el instante ya pasó', () => {
    expect(textoCuentaAtras(0)).toBeNull();
    expect(textoCuentaAtras(-5)).toBeNull();
  });
});
