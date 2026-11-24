import { describe, expect, it } from 'vitest';
import agrupacionesJson from '../../../../../data/config/agrupaciones.json';
import circunscripcionesJson from '../../../../../data/config/circunscripciones.json';
import {
  calcularCircunscripcion,
  construirVista,
  crearAgrupador,
  type Circunscripcion,
  type Escrutinio,
  type GrupoConfig,
  type VistaFilaDisputa,
  type VistaRecuento,
} from '@elecciones/engine';
import { aclarar, colorFormacion, colorGrupo, COLOR_SIN_DATOS } from './colores';
import { ALTO, ANCHO, posicionesHemiciclo, renderHemiciclo } from './hemiciclo';
import { esc, numero, porcentaje } from './html';
import { leyendaEscanos, leyendaGanador, MAPA, renderMapaEscanos, renderMapaGanador } from './mapas';
import { NOMBRES_PANEL, renderPaneles } from './paneles';
import { coinciden, renderSectores, trozosFormaciones, trozosGrupos } from './sectores';
import { renderTablaCircunscripciones, renderTablaDisputa, soloElVotoExterior, TEXTO_SIN_VUELCO } from './tabla';

const circs = circunscripcionesJson.circunscripciones as Circunscripcion[];
const agrupador = crearAgrupador(agrupacionesJson.grupos as GrupoConfig[]);

const escrutinio = (codigo: string, censo: number, censoEscrutado: number, votos: Record<string, number>): Escrutinio => ({
  codigo,
  censo,
  censoEscrutado,
  blancos: 0,
  candidaturas: Object.entries(votos).map(([siglas, v]) => ({ siglas, votos: v })),
});

/** Vista de las 52 circunscripciones: todas con el mismo reparto y la fracción de censo escrutado dada (0 = sin datos). */
function vista(fraccion: number, global = fraccion, votos: Record<string, number> = { PP: 4_000, PSOE: 3_500, VOX: 1_500, PSC: 600 }): VistaRecuento {
  const resultados = circs.map((c) =>
    calcularCircunscripcion(c, fraccion > 0 ? escrutinio(c.codigo, 10_000, Math.round(10_000 * fraccion), votos) : null),
  );
  return construirVista(resultados, { agrupador, porcentajeCensoNacional: global });
}

const sinBasura = (html: string) => {
  expect(html).not.toMatch(/NaN|undefined|Infinity|\[object/);
};

describe('formato', () => {
  it('escapa el texto que viene de la fuente', () => {
    expect(esc(`<img src=x onerror="a()"> & 'b'`)).toBe('&lt;img src=x onerror=&quot;a()&quot;&gt; &amp; &#39;b&#39;');
  });
  it('números y porcentajes en español', () => {
    expect(numero(1234567)).toBe('1.234.567');
    expect(numero(1234)).toBe('1.234');
    expect(numero(350)).toBe('350');
    expect(porcentaje(0.6234)).toBe('62,3 %');
    expect(porcentaje(0.00421, 2)).toBe('0,42 %');
    expect(porcentaje(1)).toBe('100,0 %');
  });
});

describe('colores', () => {
  it('cada grupo conocido tiene su color y los desconocidos siempre el mismo', () => {
    expect(colorGrupo('pp')).toMatch(/^#[0-9a-f]{6}$/);
    expect(colorGrupo('pp')).not.toBe(colorGrupo('psoe'));
    expect(colorGrupo('sin-agrupar:INVENTADO')).toBe(colorGrupo('sin-agrupar:INVENTADO'));
    expect(colorGrupo('sin-agrupar:INVENTADO')).toMatch(/^#[0-9a-f]{6}$/);
  });
  it('aclara hacia el blanco y la primera formación de un grupo conserva el color', () => {
    expect(aclarar('#000000', 1)).toBe('#ffffff');
    expect(aclarar('#102030', 0)).toBe('#102030');
    expect(colorFormacion('pp', 0)).toBe(colorGrupo('pp'));
    expect(colorFormacion('pp', 1)).not.toBe(colorGrupo('pp'));
  });
});

describe('diagramas de sectores', () => {
  it('un trazo por formación con escaños, más el gris de lo que no tiene datos', () => {
    const v = vista(0.5);
    const html = renderSectores(trozosFormaciones(v), { titulo: 'Escaños por formación', escanosTotales: v.escanosTotales });
    expect(html.match(/<path /g)).toHaveLength(v.formaciones.length);
    expect(html).toContain(`>${v.escanosAsignados}</text>`);
    sinBasura(html);

    const parcial = construirVista(
      circs.map((c, i) => calcularCircunscripcion(c, i < 30 ? escrutinio(c.codigo, 10_000, 5_000, { PP: 4_000, PSOE: 3_500 }) : null)),
      { agrupador, porcentajeCensoNacional: 0.3 },
    );
    const conGris = renderSectores(trozosFormaciones(parcial), { titulo: 't', escanosTotales: 350 });
    expect(conGris).toContain('Sin datos todavía');
    expect(conGris).toContain(COLOR_SIN_DATOS);
    expect(conGris.match(/<path /g)).toHaveLength(parcial.formaciones.length + 1);
  });

  it('al empezar, todo es gris y se lee que no hay escaños asignados', () => {
    const v = vista(0);
    const html = renderSectores(trozosFormaciones(v), { titulo: 'Escaños', escanosTotales: 350 });
    expect(html.match(/<path /g)).toHaveLength(1);
    expect(html).toContain('>0</text>');
    expect(html).toContain('0 de 350 escaños asignados');
    sinBasura(html);
  });

  it('con un solo sector dibuja la corona entera sin arcos degenerados', () => {
    const html = renderSectores([{ clave: 'a', nombre: 'A', escanos: 350, color: '#123456' }], { titulo: 't', escanosTotales: 350 });
    expect(html.match(/<path /g)).toHaveLength(1);
    sinBasura(html);
  });

  it('los sectores son proporcionales: los ángulos suman una vuelta', () => {
    const html = renderSectores(
      [
        { clave: 'a', nombre: 'A', escanos: 100, color: '#111111' },
        { clave: 'b', nombre: 'B', escanos: 250, color: '#222222' },
      ],
      { titulo: 't', escanosTotales: 350 },
    );
    // El primer sector (100 de 350 = 102,9°) acaba a la derecha y abajo de las 12; el segundo es "grande" (>180°).
    const arcos = [...html.matchAll(/A92 92 0 (\d) 1/g)].map((m) => m[1]);
    expect(arcos).toEqual(['0', '1']);
  });

  it('escapa los nombres y la leyenda explica qué agrupa un grupo', () => {
    const html = renderSectores(
      [{ clave: 'x', nombre: '<b>X</b>', escanos: 3, color: '#111111', nota: 'X e Y & Z' }],
      { titulo: 'T"', escanosTotales: 350 },
    );
    expect(html).not.toContain('<b>X</b>');
    expect(html).toContain('&lt;b&gt;X&lt;/b&gt;');
    expect(html).toContain('<small>Incluye X e Y &amp; Z</small>');
    const v = vista(1);
    const grupos = renderSectores(trozosGrupos(v), { titulo: 'g', escanosTotales: v.escanosTotales });
    expect(grupos).toContain('<small>Incluye ');
  });

  it('el segundo diagrama avisa de que coincide con el primero solo si agrupar no junta nada', () => {
    const sinJuntar = construirVista(
      circs.map((c) => calcularCircunscripcion(c, escrutinio(c.codigo, 10_000, 10_000, { PP: 4_000, PSOE: 3_500 }))),
      { agrupador, porcentajeCensoNacional: 1 },
    );
    expect(coinciden(trozosFormaciones(sinJuntar), trozosGrupos(sinJuntar))).toBe(true);
    expect(renderPaneles(sinJuntar).notaGrupos).toContain('coincide con el anterior');
    const juntando = vista(1); // PSOE y PSC comparten grupo
    expect(coinciden(trozosFormaciones(juntando), trozosGrupos(juntando))).toBe(false);
    expect(renderPaneles(juntando).notaGrupos).toBe('');
  });
});

describe('datos del mapa', () => {
  it('trae exactamente las 52 circunscripciones, con trazo, punto interior dentro de su caja y todo dentro del lienzo', () => {
    expect(Object.keys(MAPA.circunscripciones).sort()).toEqual(circs.map((c) => c.codigo).sort());
    for (const [codigo, m] of Object.entries(MAPA.circunscripciones)) {
      expect(m.d, codigo).toMatch(/^M[-\d. MZ]+Z$/);
      const [cx, cy] = m.centro;
      const [x0, y0, x1, y1] = m.caja;
      expect(cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1, codigo).toBe(true);
      expect(x0 >= 0 && y0 >= 0 && x1 <= MAPA.ancho && y1 <= MAPA.alto, codigo).toBe(true);
    }
  });
  it('Canarias queda dentro de su recuadro y este dentro del lienzo', () => {
    const [x, y, w, h] = MAPA.canarias;
    expect(x + w).toBeLessThanOrEqual(MAPA.ancho);
    expect(y + h).toBeLessThanOrEqual(MAPA.alto);
    for (const c of ['35', '38']) {
      const [x0, y0, x1, y1] = (MAPA.circunscripciones[c] as { caja: number[] }).caja as [number, number, number, number];
      expect(x0 >= x && y0 >= y && x1 <= x + w && y1 <= y + h, c).toBe(true);
    }
  });
});

describe('mapas', () => {
  it('el mapa del ganador pinta cada circunscripción con el color de su grupo y agranda Ceuta y Melilla', () => {
    const v = vista(0.6);
    const html = renderMapaGanador(v);
    expect(html.match(/<path /g)).toHaveLength(52);
    expect(html.match(/<circle /g)).toHaveLength(2);
    // PSOE (3.500) y PSC (600) son el mismo grupo y suman más que el PP (4.000): gana el grupo socialista.
    expect(html).toContain(`fill="${colorGrupo('psoe')}"`);
    expect(html).not.toContain(`fill="${colorGrupo('pp')}"`);
    expect(html).toContain('Ceuta</text>');
    expect(html).toContain('Melilla</text>');
    expect(html).toContain('Canarias</text>');
    sinBasura(html);
  });

  it('sin datos todo el mapa es gris', () => {
    const html = renderMapaGanador(vista(0));
    expect(html.match(new RegExp(`fill="${COLOR_SIN_DATOS}"`, 'g'))).toHaveLength(54); // 52 trazos + 2 círculos
    expect(html).toContain('sin datos todavía');
  });

  it('el mapa de escaños pone un símbolo por circunscripción, proporcional a sus escaños y los grandes debajo', () => {
    const v = vista(0.6);
    const html = renderMapaEscanos(v);
    expect(html.match(/<g>/g)).toHaveLength(52);
    // 52 trazos de base + los sectores de cada círculo (PP, PSOE... en cada una)
    expect(html.match(/<path /g)!.length).toBeGreaterThan(52);
    const madrid = html.indexOf('Madrid:');
    const soria = html.indexOf('Soria:');
    expect(madrid).toBeGreaterThan(-1);
    expect(soria).toBeGreaterThan(madrid);
    sinBasura(html);
  });

  it('en el mapa de escaños, las circunscripciones sin datos son un círculo discontinuo', () => {
    const html = renderMapaEscanos(vista(0));
    expect(html.match(/stroke-dasharray/g)).toHaveLength(52);
  });

  it('las leyendas listan lo que hay en el mapa', () => {
    const v = vista(0.6);
    expect(leyendaGanador(v).map((e) => e.nombre)).toEqual(['PSOE (52)']);
    expect(leyendaEscanos(v).map((e) => e.nombre)).toEqual(v.formaciones.map((f) => f.siglas));
    expect(leyendaGanador(vista(0)).map((e) => e.nombre)).toEqual(['Sin datos todavía']);
  });
});

describe('tabla de disputa', () => {
  // Circunscripción con la mitad por contar: siempre hay vuelco posible. Con el recuento completo no (sin CERA esperado).
  const completa = vista(1);
  const aMedias = vista(0.5);

  it('normal: indica a qué % del censo escrutado en toda España corresponde y el % de cada circunscripción', () => {
    const html = renderTablaDisputa(aMedias.tabla);
    expect(aMedias.tabla.estado).toBe('normal');
    expect(html).toContain('<caption>Para el <strong>50,0 %</strong> del censo escrutado en toda España</caption>');
    expect(html.match(/<tbody>.*<\/tbody>/s)?.[0].match(/<tr>/g)).toHaveLength(10);
    expect(html).toContain('<td class="num">50,0 %</td>');
    expect(html).not.toMatch(/provisional/i);
    expect(html).not.toContain('role="note"');
    sinBasura(html);
  });

  it('el escaño que cambia se ve como «origen → destino» con el color de la agrupación de cada uno', () => {
    const html = renderTablaDisputa(aMedias.tabla);
    expect(aMedias.tabla.filas.length).toBeGreaterThan(0);
    for (const f of aMedias.tabla.filas) {
      const origen = `<span class="ficha"><i class="muestra" style="background:${colorGrupo(f.actualGrupoId ?? '')}"></i>${f.actual}</span>`;
      const destino = `<span class="ficha"><i class="muestra" style="background:${colorGrupo(f.aspiranteGrupoId)}"></i>${f.aspirante}</span>`;
      expect(html, f.nombre).toContain(`<span class="cambio" aria-hidden="true"><span class="origen">${origen}<span class="flecha">→</span></span>${destino}</span>`);
    }
    // La frase larga solo queda para los lectores de pantalla.
    expect(html).toMatch(/<span class="solo-lector">Un escaño de \w+ pasaría a \w+<\/span>/);
    expect(html.replace(/<span class="solo-lector">.*?<\/span>/g, '')).not.toContain('pasaría');
  });

  it('el color es el de la agrupación: PSC y PSOE, que comparten grupo, comparten color', () => {
    const c = { ...(circs[0] as Circunscripcion), escanos: 4 };
    const v = construirVista([calcularCircunscripcion(c, escrutinio(c.codigo, 800, 400, { PP: 150, PSOE: 120, PSC: 70, VOX: 20 }))], {
      agrupador,
      porcentajeCensoNacional: 0.5,
    });
    const colorPsoe = colorGrupo('psoe');
    const html = renderTablaDisputa(v.tabla);
    expect(html).toContain(`<i class="muestra" style="background:${colorPsoe}"></i>PSC</span><span class="flecha">→</span></span><span class="ficha"><i class="muestra" style="background:${colorPsoe}"></i>PSOE`);
  });

  it('si no hay una candidatura concreta que pierda el escaño, el origen es «Otra candidatura» en gris', () => {
    const fila = { ...(aMedias.tabla.filas[0] as VistaFilaDisputa), tipo: 'umbral' as const, actual: null, actualGrupoId: null };
    const html = renderTablaDisputa({ ...aMedias.tabla, filas: [fila] });
    expect(html).toContain(`<i class="muestra" style="background:${COLOR_SIN_DATOS}"></i>Otra candidatura</span>`);
    expect(html).toContain('Entra al alcanzar el 3 %');
    expect(html).toContain(`${fila.aspirante} alcanzaría el 3 % y entraría</span>`);
  });

  it('sin-vuelco: no hay tabla, solo el mensaje', () => {
    expect(completa.tabla.estado).toBe('sin-vuelco');
    const html = renderTablaDisputa(completa.tabla);
    expect(html).not.toContain('<table');
    expect(html).toContain(TEXTO_SIN_VUELCO);
    expect(TEXTO_SIN_VUELCO).toBe('Ya no se incluye la tabla de circunscripciones en disputa: no hay opción de vuelco en ninguna circunscripción.');
  });

  it('reducida: la tabla, con menos filas, lleva una nota que lo avisa', () => {
    // 45 circunscripciones completas (sin vuelco) y 7 a medias: la tabla tiene 7 filas en lugar de 10.
    const mixta = construirVista(
      circs.map((c, i) =>
        calcularCircunscripcion(c, escrutinio(c.codigo, 10_000, i < 45 ? 10_000 : 5_000, { PP: 4_000, PSOE: 3_500, VOX: 1_500 })),
      ),
      { agrupador, porcentajeCensoNacional: 0.93 },
    );
    expect(mixta.tabla).toMatchObject({ estado: 'reducida', conOpcionDeVuelco: 7 });
    const html = renderTablaDisputa(mixta.tabla);
    expect(html).toContain('role="note"');
    expect(html).toContain('La tabla tiene 7 filas en lugar de 10: en 45 circunscripciones los votos que faltan por escrutar ya no bastan para cambiar el reparto.');
    expect(html.match(/<tbody>.*<\/tbody>/s)?.[0].match(/<tr>/g)).toHaveLength(7);
    expect(html).toContain('<caption>Para el <strong>93,0 %</strong>');
  });

  it('con una sola fila la nota va en singular', () => {
    const una = construirVista(
      circs.map((c, i) => calcularCircunscripcion(c, escrutinio(c.codigo, 10_000, i === 0 ? 5_000 : 10_000, { PP: 4_000, PSOE: 3_500 }))),
      { agrupador, porcentajeCensoNacional: 0.99 },
    );
    expect(renderTablaDisputa(una.tabla)).toContain('La tabla tiene una fila en lugar de 10: en 51 circunscripciones');
  });

  it('al empezar, sin datos, no es "sin vuelco": solo avisa de que faltan datos', () => {
    const html = renderTablaDisputa(vista(0).tabla);
    expect(html).toContain('Todavía no hay circunscripciones con datos suficientes');
    expect(html).not.toContain(TEXTO_SIN_VUELCO);
  });

  it('avisa del voto exterior solo cuando los residentes por sí solos ya no pueden cambiar la circunscripción', () => {
    const conCera = (fraccion: number, cera: number) =>
      construirVista(
        circs.map((c) => calcularCircunscripcion(c, escrutinio(c.codigo, 10_000, Math.round(10_000 * fraccion), { PP: 4_113, PSOE: 3_377, VOX: 1_511 }))),
        { agrupador, porcentajeCensoNacional: fraccion, ceraEsperados: Object.fromEntries(circs.map((c) => [c.codigo, cera])) },
      );
    const aviso = 'Solo el voto exterior, que se escruta días después, podría cambiarlo';

    // A mitad del recuento quedan 5.000 votos de residentes: bastan para cambiar el reparto, el exterior no hace falta.
    const antes = conCera(0.5, 5_000);
    expect(antes.tabla.filas.length).toBeGreaterThan(0);
    expect(antes.tabla.filas.some(soloElVotoExterior)).toBe(false);
    expect(renderTablaDisputa(antes.tabla)).not.toContain(aviso);

    // Con el recuento de residentes completo, lo que mantiene la fila en la tabla es el voto exterior.
    const despues = conCera(1, 5_000);
    expect(despues.tabla.estado).toBe('normal');
    expect(despues.tabla.filas.every(soloElVotoExterior)).toBe(true);
    expect(renderTablaDisputa(despues.tabla).match(new RegExp(aviso, 'g'))).toHaveLength(10);

    // Si el exterior esperado no basta para cambiar nada, no queda ninguna fila.
    expect(conCera(1, 1).tabla.estado).toBe('sin-vuelco');
  });

  it('escapa los nombres de las circunscripciones y de las candidaturas', () => {
    const v = vista(0.5, 0.5, { '<PP>': 4_000, 'PSOE&Co': 3_500 });
    const html = renderTablaDisputa(v.tabla);
    expect(html).not.toContain('<PP>');
    expect(html).toContain('&lt;PP&gt;');
    expect(html).toContain('PSOE&amp;Co');
  });
});

describe('paneles', () => {
  it('generan todos los paneles, sin valores sueltos, con la vista vacía, a medias y completa', () => {
    for (const v of [vista(0), vista(0.5), vista(1)]) {
      const paneles = renderPaneles(v);
      for (const nombre of NOMBRES_PANEL) {
        if (nombre === 'notaGrupos') continue; // puede ser vacío
        expect(paneles[nombre].length, nombre).toBeGreaterThan(0);
      }
      sinBasura(Object.values(paneles).join(''));
    }
  });

  it('el resumen da el % global, las circunscripciones con datos y la mayoría absoluta', () => {
    const html = renderPaneles(vista(0.5)).resumen;
    expect(html).toContain('<strong>50,0 %</strong> del censo escrutado en toda España');
    expect(html).toContain('aria-valuenow="50"');
    expect(html).toContain('Circunscripciones con datos: <strong>52</strong> de 52');
    expect(html).toContain('Mayoría absoluta: <strong>176</strong>');
    expect(renderPaneles(vista(0)).resumen).toContain('(350 en circunscripciones sin datos)');
  });

  it('la tabla de todas las circunscripciones tiene una fila por circunscripción', () => {
    const html = renderTablaCircunscripciones(vista(0.5));
    expect(html.match(/<tbody>.*<\/tbody>/s)?.[0].match(/<tr>/g)).toHaveLength(52);
  });
});

describe('recuento definitivo (histórico)', () => {
  /** Recuento cerrado: todo el censo escrutado y, por tanto, ninguna circunscripción con opción de vuelco. */
  const cerrado = () => {
    const resultados = circs.map((c, i) =>
      calcularCircunscripcion(c, escrutinio(c.codigo, 10_000, 10_000, { PP: 4_000 + 25 * i, PSOE: 3_500, VOX: 1_500, PSC: 600 })),
    );
    return construirVista(resultados, { agrupador, porcentajeCensoNacional: 1, resultadoDefinitivo: true });
  };

  it('la tabla de disputa habla en pasado, sin la columna de lo escrutado ni el aviso del voto exterior', () => {
    const html = renderTablaDisputa(cerrado().tabla, { definitivo: true });
    sinBasura(html);
    expect(html).toContain('circunscripciones con el reparto más ajustado');
    expect(html).toContain('Escaño que habría cambiado');
    expect(html).toContain('Votos que tendrían que haberse movido');
    expect(html).toContain('habría pasado a');
    expect(html).not.toMatch(/Escrutado en ella|podría cambiar|pasaría|del censo escrutado|voto exterior/);
    expect(html.match(/<tr>/g)).toHaveLength(11); // la cabecera y 10 filas
  });

  it('sin la opción definitiva, la misma vista cerrada sigue diciendo que no hay vuelco (la noche electoral no cambia)', () => {
    const v = cerrado();
    expect(renderTablaDisputa({ ...v.tabla, estado: 'sin-vuelco', filas: [] })).toContain(TEXTO_SIN_VUELCO);
  });

  it('en la fila del umbral dice que habría entrado, no que entra', () => {
    const fila: VistaFilaDisputa = {
      codigo: '28',
      nombre: 'Madrid',
      tipo: 'umbral',
      actual: null,
      actualGrupoId: null,
      aspirante: 'ZZZ',
      aspiranteGrupoId: 'sin-agrupar:ZZZ',
      votosAMover: 120,
      porcentajeVotosAMover: 0.01,
      porcentajeCenso: 1,
      empateSorteo: false,
      cera: null,
      vuelco: null,
    };
    const tabla = { ...cerrado().tabla, filas: [fila] };
    expect(renderTablaDisputa(tabla, { definitivo: true })).toMatch(/Habría entrado al alcanzar el 3 %.*ZZZ habría alcanzado el 3 % y entrado/s);
    expect(renderTablaDisputa(tabla)).toContain('Entra al alcanzar el 3 %');
  });

  it('la tabla de todas las circunscripciones no lleva el % escrutado y el reparto ya no es «actual»', () => {
    const v = cerrado();
    const definitiva = renderTablaCircunscripciones(v, { definitivo: true });
    sinBasura(definitiva);
    expect(definitiva).not.toContain('Escrutado');
    expect(definitiva).not.toContain('Reparto actual');
    expect(definitiva).toContain('<th scope="col">Reparto</th>');
    expect(definitiva.match(/<tr>/g)).toHaveLength(53); // la cabecera y 52 circunscripciones
    expect(renderTablaCircunscripciones(v)).toContain('Reparto actual');
  });

  it('el panel de resumen del escrutinio queda vacío y el resto de paneles se dibujan', () => {
    const paneles = renderPaneles(cerrado(), { definitivo: true });
    expect(paneles.resumen).toBe('');
    for (const nombre of NOMBRES_PANEL.filter((n) => n !== 'resumen' && n !== 'notaGrupos')) {
      sinBasura(paneles[nombre]);
      expect(paneles[nombre].length, nombre).toBeGreaterThan(20);
    }
  });
});

describe('hemiciclo', () => {
  const total = 350;
  it('coloca todos los escaños, cada uno una vez y dentro del dibujo', () => {
    const p = posicionesHemiciclo(total);
    expect(p).toHaveLength(total);
    expect(new Set(p.map((e) => `${e.x.toFixed(2)},${e.y.toFixed(2)}`)).size).toBe(total);
    for (const { x, y } of p) {
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(ANCHO);
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThan(ALTO);
    }
  });

  it('va de izquierda a derecha: el primero está a la izquierda y el último a la derecha', () => {
    const p = posicionesHemiciclo(total);
    expect((p[0] as { x: number }).x).toBeLessThan((p[total - 1] as { x: number }).x);
    const mitad = ANCHO / 2;
    expect(p.slice(0, 170).every((e) => e.x < mitad)).toBe(true);
    expect(p.slice(-170).every((e) => e.x > mitad)).toBe(true);
  });

  it('funciona con pocos escaños y con una sola fila', () => {
    expect(posicionesHemiciclo(1)).toHaveLength(1);
    expect(posicionesHemiciclo(5, 1)).toHaveLength(5);
    expect(posicionesHemiciclo(24, 3)).toHaveLength(24);
  });

  it('sin grupos todo queda vacío; con grupos reparte los colores y deja el resto vacío', () => {
    const vacio = renderHemiciclo({ total, etiqueta: 'Hemiciclo' });
    expect(vacio).toContain('var(--escano)');
    expect(vacio.match(/<path/g)).toHaveLength(1);

    const con = renderHemiciclo({
      total,
      etiqueta: 'Hemiciclo',
      grupos: [
        { nombre: 'A', color: '#111111', escanos: 100 },
        { nombre: 'B', color: '#222222', escanos: 50 },
      ],
    });
    const cuentas = [...con.matchAll(/stroke="([^"]+)"[^>]*fill="none"/g)].map((m) => m[1]);
    expect(cuentas).toEqual(['#111111', '#222222', 'var(--escano)']);
    // Cada trazo lleva un punto por escaño.
    const puntosPorTrazo = [...con.matchAll(/<path d="([^"]+)"/g)].map((m) => (m[1] as string).split('M').length - 1);
    expect(puntosPorTrazo).toEqual([100, 50, 200]);
  });

  it('dibuja la línea de la mayoría solo si se pide y escapa la etiqueta', () => {
    expect(renderHemiciclo({ total, etiqueta: 'x' })).not.toContain('<line');
    const svg = renderHemiciclo({ total, mayoria: 176, etiqueta: 'a "b" <c>' });
    expect(svg).toContain('<line');
    expect(svg).toContain('Mayoría absoluta: 176 escaños');
    expect(svg).toContain('a &quot;b&quot; &lt;c&gt;');
    expect(svg).toContain(`viewBox="0 0 ${ANCHO} ${ALTO + 20}"`);
  });

  it('sin etiqueta es decorativo: los lectores de pantalla lo ignoran', () => {
    const svg = renderHemiciclo({ total: 24, filas: 3 });
    expect(svg).toContain('aria-hidden="true"');
    expect(svg).not.toContain('role="img"');
    expect(svg).toContain(`viewBox="0 0 ${ANCHO} ${ALTO}"`);
  });
});
