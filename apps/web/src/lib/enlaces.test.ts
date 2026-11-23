import { describe, expect, it } from 'vitest';
import { enlacesVisibles, type Enlace } from './enlaces';

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
