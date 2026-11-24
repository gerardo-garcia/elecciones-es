import type { TablaDisputa, VistaFilaDisputa, VistaRecuento, VistaTablaDisputa } from '@elecciones/engine';
import { COLOR_SIN_DATOS, colorGrupo } from './colores';
import { esc, numero, porcentaje } from './html';

/** Textos de las dos notas de la tabla (los fijó el usuario: ver docs/metodologia.md). */
export const TEXTO_SIN_VUELCO =
  'Ya no se incluye la tabla de circunscripciones en disputa: no hay opción de vuelco en ninguna circunscripción.';

export function textoReducida(tabla: TablaDisputa): string {
  const n = tabla.sinOpcionDeVuelco.length;
  const filas = tabla.filas.length;
  return (
    `La tabla tiene ${filas === 1 ? 'una fila' : `${numero(filas)} filas`} en lugar de ${numero(tabla.n)}: ` +
    `en ${numero(n)} ${n === 1 ? 'circunscripción' : 'circunscripciones'} los votos que faltan por escrutar ya no bastan para cambiar el reparto.`
  );
}

/**
 * Opciones de las tablas. `definitivo`: el recuento está cerrado (histórico), así que la tabla de disputa cuenta lo que
 * pudo haber sido y no lo que puede ser: «habría cambiado» en lugar de «podría cambiar», y sin el % escrutado.
 */
export interface OpcionesTabla {
  definitivo?: boolean;
}

/** La frase completa, solo para lectores de pantalla: a la vista se ve «origen → destino». */
function fraseCambio(f: VistaFilaDisputa, definitivo: boolean): string {
  if (f.tipo === 'escano') {
    return f.actual
      ? `Un escaño de ${f.actual} ${definitivo ? 'habría pasado' : 'pasaría'} a ${f.aspirante}`
      : `${f.aspirante} ${definitivo ? 'habría ganado' : 'ganaría'} un escaño`;
  }
  return `${f.aspirante} ${definitivo ? 'habría alcanzado el 3 % y entrado' : 'alcanzaría el 3 % y entraría'}${f.actual ? `, a costa de ${f.actual}` : ''}`;
}

function ficha(nombre: string | null, grupoId: string | null): string {
  const color = nombre === null || grupoId === null ? COLOR_SIN_DATOS : colorGrupo(grupoId);
  return `<span class="ficha"><i class="muestra" style="background:${esc(color)}"></i>${esc(nombre ?? 'Otra candidatura')}</span>`;
}

/** «PSOE → PP», cada uno con el color de su agrupación. El nombre siempre acompaña al color; la flecha no se separa del origen. */
function cambio(f: VistaFilaDisputa, definitivo: boolean): string {
  return (
    `<span class="cambio" aria-hidden="true"><span class="origen">${ficha(f.actual, f.actualGrupoId)}<span class="flecha">→</span></span>${ficha(f.aspirante, f.aspiranteGrupoId)}</span>` +
    (f.tipo === 'umbral' ? `<span class="aviso-fila" aria-hidden="true">${definitivo ? 'Habría entrado al alcanzar el 3 %' : 'Entra al alcanzar el 3 %'}</span>` : '') +
    `<span class="solo-lector">${esc(fraseCambio(f, definitivo))}</span>`
  );
}

/**
 * Solo el voto exterior (CERA, que se escruta días después) podría cambiar el reparto: los votos que faltan de los
 * residentes ya no bastan, pero sumando los del exterior que se esperan sí. Antes de eso el aviso no informa de nada.
 */
export function soloElVotoExterior(f: VistaFilaDisputa): boolean {
  const { vuelco, cera } = f;
  if (!vuelco || !cera || vuelco.votosNecesarios === null || !vuelco.puedeHaberVuelco) return false;
  return vuelco.votosNecesarios > vuelco.votosPendientes - cera.votosEsperados;
}

function fila(f: VistaFilaDisputa, definitivo: boolean): string {
  const avisos = [
    f.empateSorteo ? (definitivo ? 'Empate: lo decidió un sorteo' : 'Empate: lo decide un sorteo') : '',
    !definitivo && soloElVotoExterior(f) ? 'Solo el voto exterior, que se escruta días después, podría cambiarlo' : '',
  ].filter(Boolean);
  return (
    `<tr><th scope="row">${esc(f.nombre)}` +
    (avisos.length ? `<span class="aviso-fila">${avisos.map(esc).join(' · ')}</span>` : '') +
    // En un recuento cerrado todo el censo está escrutado: la columna no informa de nada.
    (definitivo ? '</th>' : `</th><td class="num">${porcentaje(f.porcentajeCenso)}</td>`) +
    `<td>${cambio(f, definitivo)}</td>` +
    `<td class="num"><strong>${porcentaje(f.porcentajeVotosAMover, 2)}</strong>` +
    `<span class="aviso-fila">≈ ${numero(Math.round(f.votosAMover))} votos</span></td></tr>`
  );
}

/**
 * Tabla de las circunscripciones donde un escaño puede cambiar de manos.
 *  - normal: la tabla (hasta 10 filas), indicando a qué % de censo escrutado en toda España corresponde.
 *  - reducida: la tabla y una nota que avisa de que tiene menos filas porque ya no hay vuelco en el resto.
 *  - sin-vuelco: sin tabla; un mensaje.
 */
export function renderTablaDisputa(tabla: VistaTablaDisputa, { definitivo = false }: OpcionesTabla = {}): string {
  if (tabla.estado === 'sin-vuelco') {
    return `<p class="nota nota--tabla" role="status" data-estado="sin-vuelco">${esc(TEXTO_SIN_VUELCO)}</p>`;
  }
  const nota =
    tabla.estado === 'reducida' ? `<p class="nota nota--tabla" role="note" data-estado="reducida">${esc(textoReducida(tabla))}</p>` : '';
  if (tabla.filas.length === 0) {
    return `<p class="vacio">Todavía no hay circunscripciones con datos suficientes para la tabla.</p>`;
  }
  const cuerpo = `<tbody>${tabla.filas.map((f) => fila(f, definitivo)).join('')}</tbody></table></div>`;
  if (definitivo) {
    return (
      `<div class="tabla-ancha"><table class="tabla"><caption>Las <strong>${numero(tabla.filas.length)}</strong> circunscripciones con el reparto más ajustado</caption>` +
      `<thead><tr><th scope="col">Circunscripción</th><th scope="col">Escaño que habría cambiado</th>` +
      `<th scope="col">Votos que tendrían que haberse movido</th></tr></thead>` +
      cuerpo
    );
  }
  return (
    nota +
    `<div class="tabla-ancha"><table class="tabla"><caption>Para el <strong>${porcentaje(tabla.porcentajeEscrutadoGlobal)}</strong> del censo escrutado en toda España</caption>` +
    `<thead><tr><th scope="col">Circunscripción</th><th scope="col">Escrutado en ella</th><th scope="col">Escaño que podría cambiar</th>` +
    `<th scope="col">Votos que tendrían que moverse</th></tr></thead>` +
    cuerpo
  );
}

/** Todas las circunscripciones en una tabla: alternativa a los mapas para quien no los pueda usar. */
export function renderTablaCircunscripciones(vista: VistaRecuento, { definitivo = false }: OpcionesTabla = {}): string {
  const filas = vista.circunscripciones.map((c) => {
    const reparto =
      c.estado === 'sin-datos'
        ? '<span class="vacio">Sin datos todavía</span>'
        : c.escanos.map((e) => `${esc(e.siglas)}&nbsp;${numero(e.escanos)}`).join(' · ');
    return (
      `<tr><th scope="row">${esc(c.nombre)}</th><td class="num">${numero(c.escanosTotales)}</td>` +
      (definitivo ? '' : `<td class="num">${c.estado === 'sin-datos' ? '—' : porcentaje(c.porcentajeCenso)}</td>`) +
      `<td>${reparto}</td><td>${c.ganador ? esc(c.ganador.nombre) : '—'}</td></tr>`
    );
  });
  return (
    `<div class="tabla-ancha"><table class="tabla"><thead><tr><th scope="col">Circunscripción</th><th scope="col">Escaños</th>` +
    (definitivo ? '' : '<th scope="col">Escrutado</th>') +
    `<th scope="col">${definitivo ? 'Reparto' : 'Reparto actual'}</th><th scope="col">Grupo más votado</th></tr></thead>` +
    `<tbody>${filas.join('')}</tbody></table></div>`
  );
}
