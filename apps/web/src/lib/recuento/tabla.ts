import type { FilaDisputa, TablaDisputa, VistaRecuento } from '@elecciones/engine';
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

function cambio(f: FilaDisputa): string {
  if (f.tipo === 'escano') {
    return f.actual
      ? `Un escaño de <strong>${esc(f.actual)}</strong> pasaría a <strong>${esc(f.aspirante)}</strong>`
      : `<strong>${esc(f.aspirante)}</strong> ganaría un escaño`;
  }
  return (
    `<strong>${esc(f.aspirante)}</strong> alcanzaría el 3 % y entraría` +
    (f.actual ? `, a costa de <strong>${esc(f.actual)}</strong>` : '')
  );
}

function fila(f: FilaDisputa): string {
  const avisos = [
    f.empateSorteo ? 'Empate: lo decide un sorteo' : '',
    f.cera?.puedeDecidir ? 'El voto exterior podría decidirlo' : '',
  ].filter(Boolean);
  return (
    `<tr><th scope="row">${esc(f.nombre)}` +
    (avisos.length ? `<span class="aviso-fila">${avisos.map(esc).join(' · ')}</span>` : '') +
    `</th><td class="num">${porcentaje(f.porcentajeCenso)}</td>` +
    `<td>${cambio(f)}</td>` +
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
export function renderTablaDisputa(tabla: TablaDisputa): string {
  if (tabla.estado === 'sin-vuelco') {
    return `<p class="nota nota--tabla" role="status" data-estado="sin-vuelco">${esc(TEXTO_SIN_VUELCO)}</p>`;
  }
  const nota =
    tabla.estado === 'reducida' ? `<p class="nota nota--tabla" role="note" data-estado="reducida">${esc(textoReducida(tabla))}</p>` : '';
  if (tabla.filas.length === 0) {
    return `<p class="vacio">Todavía no hay circunscripciones con datos suficientes para la tabla.</p>`;
  }
  return (
    nota +
    `<div class="tabla-ancha"><table class="tabla"><caption>Para el <strong>${porcentaje(tabla.porcentajeEscrutadoGlobal)}</strong> del censo escrutado en toda España</caption>` +
    `<thead><tr><th scope="col">Circunscripción</th><th scope="col">Escrutado en ella</th><th scope="col">Escaño que podría cambiar</th>` +
    `<th scope="col">Votos que tendrían que moverse</th></tr></thead>` +
    `<tbody>${tabla.filas.map(fila).join('')}</tbody></table></div>`
  );
}

/** Todas las circunscripciones en una tabla: alternativa a los mapas para quien no los pueda usar. */
export function renderTablaCircunscripciones(vista: VistaRecuento): string {
  const filas = vista.circunscripciones.map((c) => {
    const reparto =
      c.estado === 'sin-datos'
        ? '<span class="vacio">Sin datos todavía</span>'
        : c.escanos.map((e) => `${esc(e.siglas)}&nbsp;${numero(e.escanos)}`).join(' · ');
    return (
      `<tr><th scope="row">${esc(c.nombre)}</th><td class="num">${numero(c.escanosTotales)}</td>` +
      `<td class="num">${c.estado === 'sin-datos' ? '—' : porcentaje(c.porcentajeCenso)}</td>` +
      `<td>${reparto}</td><td>${c.ganador ? esc(c.ganador.nombre) : '—'}</td></tr>`
    );
  });
  return (
    `<div class="tabla-ancha"><table class="tabla"><thead><tr><th scope="col">Circunscripción</th><th scope="col">Escaños</th>` +
    `<th scope="col">Escrutado</th><th scope="col">Reparto actual</th><th scope="col">Grupo más votado</th></tr></thead>` +
    `<tbody>${filas.join('')}</tbody></table></div>`
  );
}
