import { describe, expect, it } from 'vitest';
import enlacesJson from '../data/enlaces.json';
import { enlacesVisibles, formatoFechaEnlace, metaEnlace, type Enlace } from './enlaces';

const enlaces: Enlace[] = [
  { tipo: 'encuesta', titulo: 'Encuesta A', medio: 'Diario A', url: 'https://a.example/', fecha: '2026-11-20' },
  { tipo: 'encuesta', titulo: 'Encuesta B', medio: 'Diario B', url: 'https://b.example/', fecha: '2026-11-22' },
  { tipo: 'noticia', titulo: 'Noticia', medio: 'Diario C', url: 'https://c.example/', fecha: '2026-11-21' },
  { tipo: 'oficial', titulo: 'Oficial', medio: 'Interior', url: 'https://d.example/' },
  { tipo: 'noticia', titulo: 'Futura', medio: 'Diario E', url: 'https://e.example/', fecha: '2026-12-31' },
];

const ahora = new Date('2026-11-23T12:00:00+01:00');

describe('enlacesVisibles', () => {
  it('fuera de la veda muestra encuestas, ordenadas de más reciente a más antigua', () => {
    const encuestas = enlacesVisibles(enlaces, ahora, false, 'encuesta');
    expect(encuestas.map((e) => e.titulo)).toEqual(['Encuesta B', 'Encuesta A']);
  });

  it('durante la veda no muestra ninguna encuesta, pero sí noticias y enlaces oficiales', () => {
    expect(enlacesVisibles(enlaces, ahora, true, 'encuesta')).toEqual([]);
    const todos = enlacesVisibles(enlaces, ahora, true);
    expect(todos.some((e) => e.tipo === 'encuesta')).toBe(false);
    expect(todos.map((e) => e.titulo)).toEqual(['Noticia', 'Oficial']);
  });

  it('oculta lo que tiene fecha futura', () => {
    expect(enlacesVisibles(enlaces, ahora, false).some((e) => e.titulo === 'Futura')).toBe(false);
  });

  it('los enlaces sin fecha van al final', () => {
    const todos = enlacesVisibles(enlaces, ahora, false);
    expect(todos[todos.length - 1]?.titulo).toBe('Oficial');
  });
});

describe('fechas de los enlaces', () => {
  it('da día y mes si hay fecha completa, y mes y año si solo hay mes', () => {
    expect(formatoFechaEnlace('2026-11-09')).toBe('9 de noviembre');
    expect(formatoFechaEnlace('2026-10')).toBe('octubre de 2026');
  });

  it('rechaza formatos que no son AAAA-MM-DD ni AAAA-MM', () => {
    for (const mala of ['2026', '9/11/2026', '2026-1-5', '2026-11-09T10:00', '']) {
      expect(() => formatoFechaEnlace(mala), mala).toThrow(/inválido/);
    }
  });

  it('una fecha con solo el mes ordena como el día 1 y no se muestra antes de que empiece ese mes', () => {
    const e: Enlace[] = [
      { tipo: 'encuesta', titulo: 'Mensual', medio: 'CIS', url: 'https://a.example/', fecha: '2026-10' },
      { tipo: 'encuesta', titulo: 'Diaria', medio: 'X', url: 'https://b.example/', fecha: '2026-10-05' },
    ];
    expect(enlacesVisibles(e, new Date('2026-11-23T12:00:00+01:00'), false).map((x) => x.titulo)).toEqual(['Diaria', 'Mensual']);
    expect(enlacesVisibles(e, new Date('2026-09-30T12:00:00+02:00'), false)).toEqual([]);
  });

  it('metaEnlace une medio, fecha y detalle, y omite lo que falta', () => {
    expect(metaEnlace({ tipo: 'encuesta', titulo: 't', medio: 'El País', url: 'https://x.example/', fecha: '2026-11-09', detalle: 'Campo: 2–4 de noviembre' })).toBe(
      'El País · 9 de noviembre · Campo: 2–4 de noviembre',
    );
    expect(metaEnlace({ tipo: 'oficial', titulo: 't', medio: 'BOE', url: 'https://x.example/' })).toBe('BOE');
  });
});

describe('data/enlaces.json', () => {
  const todos = enlacesJson.enlaces as Enlace[];

  it('todos los enlaces son https y tienen tipo, título y medio', () => {
    for (const e of todos) {
      expect(['encuesta', 'noticia', 'oficial'], e.titulo).toContain(e.tipo);
      expect(e.url, e.titulo).toMatch(/^https:\/\//);
      expect(e.titulo.length, e.url).toBeGreaterThan(0);
      expect(e.medio.length, e.url).toBeGreaterThan(0);
    }
  });

  it('toda encuesta lleva fecha con formato válido: sin fecha no se enlaza', () => {
    const encuestas = todos.filter((e) => e.tipo === 'encuesta');
    expect(encuestas.length).toBeGreaterThan(0);
    for (const e of encuestas) {
      expect(e.fecha, e.titulo).toBeTruthy();
      expect(() => formatoFechaEnlace(e.fecha!), e.titulo).not.toThrow();
    }
  });

  it('no hay URLs repetidas', () => {
    expect(new Set(todos.map((e) => e.url)).size).toBe(todos.length);
  });
});
