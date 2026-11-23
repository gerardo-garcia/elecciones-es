import { describe, expect, it } from 'vitest';
import circunscripcionesJson from '../../../data/config/circunscripciones.json';
import candidaturasJson from '../../../data/config/candidaturas-proclamadas-2026.json';
import agrupacionesJson from '../../../data/config/agrupaciones.json';
import { crearAgrupador, type Circunscripcion, type GrupoConfig } from '../src';

const circunscripciones = circunscripcionesJson.circunscripciones as Circunscripcion[];
const grupos = agrupacionesJson.grupos as GrupoConfig[];
const provincias = candidaturasJson.provincias as Record<string, { denominacion: string; siglas: string }[]>;

describe('data/config/circunscripciones.json (anexo del RD 806/2026)', () => {
  it('son 52 circunscripciones con códigos INE únicos', () => {
    expect(circunscripciones).toHaveLength(52);
    expect(new Set(circunscripciones.map((c) => c.codigo)).size).toBe(52);
  });

  it('suman 350 diputados', () => {
    expect(circunscripciones.reduce((s, c) => s + c.escanos, 0)).toBe(350);
  });

  it('cada provincia elige al menos 2 y solo Ceuta y Melilla eligen 1, por mayoría', () => {
    for (const c of circunscripciones) {
      if (c.codigo === '51' || c.codigo === '52') {
        expect(c).toMatchObject({ escanos: 1, tipo: 'mayoritaria' });
      } else {
        expect(c.escanos).toBeGreaterThanOrEqual(2);
        expect(c.tipo).toBe('proporcional');
      }
    }
  });

  it('coincide con las cifras publicadas de las grandes circunscripciones', () => {
    const escanos = (codigo: string) => circunscripciones.find((c) => c.codigo === codigo)?.escanos;
    expect(escanos('28')).toBe(38); // Madrid
    expect(escanos('08')).toBe(32); // Barcelona
    expect(escanos('46')).toBe(16); // Valencia
    expect(escanos('41')).toBe(12); // Sevilla
    expect(escanos('03')).toBe(12); // Alicante
  });
});

describe('data/config/candidaturas-proclamadas-2026.json', () => {
  it('tiene las 534 listas del Congreso en las 52 circunscripciones', () => {
    const codigos = Object.keys(provincias).sort();
    expect(codigos).toEqual(circunscripciones.map((c) => c.codigo).sort());
    expect(Object.values(provincias).reduce((s, l) => s + l.length, 0)).toBe(534);
  });
});

describe('data/config/agrupaciones.json', () => {
  const agrupar = crearAgrupador(grupos);
  const grupoDe = (siglas: string) => agrupar(siglas);

  it('es válida: sin grupos ni alias duplicados', () => {
    expect(() => crearAgrupador(grupos)).not.toThrow();
  });

  it('todas las listas del PSOE y sus federaciones van al grupo psoe', () => {
    for (const s of ['PSOE', 'PSC', 'PSE-EE (PSOE)', 'PSdeG-PSOE', 'PSIB-PSOE', 'PSN-PSOE']) {
      expect(grupoDe(s)).toMatchObject({ id: 'psoe', agrupada: true });
    }
  });

  it('las variantes de una misma sigla van al mismo grupo', () => {
    expect(grupoDe('EH BILDU').id).toBe('eh-bildu');
    expect(grupoDe('EH Bildu').id).toBe('eh-bildu');
    expect(grupoDe('B.N.G.').id).toBe('bng');
    expect(grupoDe('F.I.A.').id).toBe('fia');
    expect(grupoDe('CCa-1.ºCAN').id).toBe('cc');
    expect(grupoDe('1.ºCAN-CCa').id).toBe('cc');
    for (const s of ['PCTE', 'PCTC', 'PCTG', 'PCTE/ELAK', 'ELAK/PCTE']) expect(grupoDe(s).id).toBe('pcte');
  });

  it('Frente Amplio (con Comuns, Aramés y CHA), Compromís y UPC van juntos bajo FA+COMP+UPC', () => {
    const siglas = [
      'FA',
      'FRENTE AMPLIO-FRONTE AMPLA',
      'COMUNS-FRONT AMPLI',
      'ARAMÉS-EU-MS',
      'CHA-IU-MS-FRENTE AMPLIO',
      'COMPROMIS-EUPV-PODEM-ERPV',
      'NC-BC, PODEMOS, IU, SUMAR',
    ];
    for (const s of siglas) {
      expect(grupoDe(s), s).toMatchObject({ id: 'fa-comp-upc', nombre: 'FA+COMP+UPC', agrupada: true });
    }
  });

  it('UPN-PP se suma al PP y la leyenda lo dice', () => {
    expect(grupoDe('UPN-PP')).toMatchObject({ id: 'pp', nombre: 'PP', agrupada: true });
    expect(grupoDe('PP').id).toBe('pp');
    expect(grupoDe('UPN-PP').incluye).toMatch(/UPN-PP/);
  });

  it('no queda ninguna decisión pendiente', () => {
    expect(grupos.filter((g) => g.pendienteDecision).map((g) => g.id)).toEqual([]);
  });

  it('los grupos que suman partidos distintos llevan el texto de lo que incluyen', () => {
    for (const id of ['fa-comp-upc', 'pp']) {
      expect(grupos.find((g) => g.id === id)?.incluye?.length ?? 0, id).toBeGreaterThan(10);
    }
    // Y solo ellos: el resto no necesita aclaración.
    expect(grupos.filter((g) => g.incluye !== undefined).map((g) => g.id).sort()).toEqual(['fa-comp-upc', 'pp']);
  });

  it('las siglas desconocidas no se pierden: cuentan por separado', () => {
    expect(grupoDe('PARTIDO NUEVO')).toEqual({
      id: 'sin-agrupar:PARTIDONUEVO',
      nombre: 'PARTIDO NUEVO',
      agrupada: false,
    });
  });

  it('en las 52 circunscripciones hay una lista del grupo psoe', () => {
    for (const [codigo, listas] of Object.entries(provincias)) {
      expect(listas.some((l) => grupoDe(l.siglas).id === 'psoe'), `circunscripción ${codigo}`).toBe(true);
    }
  });

  it('todos los alias están en alguna lista proclamada o son variantes conocidas', () => {
    // Detecta erratas en los alias: cada alias debe aparecer en alguna lista proclamada.
    const proclamadas = new Set(
      Object.values(provincias).flatMap((l) => l.map((x) => agrupar(x.siglas).id + '|' + x.siglas)),
    );
    const sigla = new Set([...proclamadas].map((p) => p.split('|')[1]));
    const variantesSinLista = ['PSC-PSOE', 'PSE-EE', 'PSOE'];
    for (const g of grupos) {
      for (const alias of g.alias) {
        const existe = [...sigla].some((s) => agrupar(s ?? '').id === g.id && s !== undefined);
        expect(existe || variantesSinLista.includes(alias), `grupo ${g.id}, alias ${alias}`).toBe(true);
      }
    }
  });
});
