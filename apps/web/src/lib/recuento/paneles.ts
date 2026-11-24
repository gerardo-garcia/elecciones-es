import type { VistaRecuento } from '@elecciones/engine';
import { leyendaEscanos, leyendaGanador, renderLeyenda, renderMapaEscanos, renderMapaGanador } from './mapas';
import { coinciden, renderSectores, trozosFormaciones, trozosGrupos } from './sectores';
import { esc, numero, porcentaje } from './html';
import { renderTablaCircunscripciones, renderTablaDisputa } from './tabla';

/** HTML de cada panel del recuento. La página (o el script de cliente) los coloca en su sitio con `data-panel`. */
export interface Paneles {
  resumen: string;
  sectoresFormaciones: string;
  sectoresGrupos: string;
  notaGrupos: string;
  mapaGanador: string;
  mapaEscanos: string;
  disputa: string;
  circunscripciones: string;
}

function resumen(vista: VistaRecuento): string {
  const global = vista.porcentajeCensoNacional;
  const con = vista.circunscripciones.filter((c) => c.estado !== 'sin-datos').length;
  const mayoria = Math.floor(vista.escanosTotales / 2) + 1;
  return (
    `<div class="progreso"><p class="progreso-texto"><strong>${porcentaje(global)}</strong> del censo escrutado en toda España</p>` +
    `<div class="barra" role="progressbar" aria-label="Censo escrutado en toda España" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(global * 100)}">` +
    `<span style="width:${(global * 100).toFixed(1)}%"></span></div></div>` +
    `<p class="progreso-detalle">Circunscripciones con datos: <strong>${numero(con)}</strong> de ${numero(vista.circunscripciones.length)}. ` +
    `Escaños asignados: <strong>${numero(vista.escanosAsignados)}</strong> de ${numero(vista.escanosTotales)}` +
    (vista.escanosPendientes > 0 ? ` (${numero(vista.escanosPendientes)} en circunscripciones sin datos)` : '') +
    `. Mayoría absoluta: <strong>${numero(mayoria)}</strong>.</p>`
  );
}

export function renderPaneles(vista: VistaRecuento): Paneles {
  const formaciones = trozosFormaciones(vista);
  const grupos = trozosGrupos(vista);
  const total = vista.escanosTotales;
  return {
    resumen: resumen(vista),
    sectoresFormaciones: renderSectores(formaciones, { titulo: 'Escaños por formación', escanosTotales: total }),
    sectoresGrupos: renderSectores(grupos, { titulo: 'Escaños por partido, agrupando formaciones territoriales', escanosTotales: total }),
    notaGrupos: coinciden(formaciones, grupos)
      ? `<p class="nota-suave">${esc('Ninguna formación se agrupa con otra: este diagrama coincide con el anterior.')}</p>`
      : '',
    mapaGanador: renderMapaGanador(vista) + renderLeyenda(leyendaGanador(vista)),
    mapaEscanos: renderMapaEscanos(vista) + renderLeyenda(leyendaEscanos(vista)),
    disputa: renderTablaDisputa(vista.tabla),
    circunscripciones: renderTablaCircunscripciones(vista),
  };
}

export const NOMBRES_PANEL: (keyof Paneles)[] = [
  'resumen',
  'sectoresFormaciones',
  'sectoresGrupos',
  'notaGrupos',
  'mapaGanador',
  'mapaEscanos',
  'disputa',
  'circunscripciones',
];
