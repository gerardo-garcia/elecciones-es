/**
 * Recuento en directo: cada minuto lee `escrutinio.json` (la rama `datos-vivo` del repositorio, publicada desde el
 * ordenador que lee Infoelectoral) y repinta los paneles. Si la fuente principal falla, usa la copia que sirve la
 * propia web. Nunca inventa datos: si no hay ninguno válido lo dice, y si el último es viejo, lo avisa.
 */
import { NOMBRES_PANEL, renderPaneles } from '../lib/recuento/paneles';
import { antiguedadMinutos, leerDatosVivo, vistaDesdeVivo, type DatosVivo } from '../lib/recuento/vivo';
import { referenciasVivo } from '../lib/recuento/vivo-config';
import { CIERRE_COLEGIOS } from '../lib/reloj';

const FUENTE_PRINCIPAL = 'https://raw.githubusercontent.com/gerardo-garcia/elecciones-es/datos-vivo/escrutinio.json';
const CADA_MS = 60_000;
/** A partir de aquí se avisa de que el dato puede estar atrasado respecto a la realidad. */
const DATO_VIEJO_MIN = 15;

/** Ensayo: con `?ensayo` en la URL se aceptan datos anteriores al cierre de colegios (p. ej. los de 2023 en la rama). */
const ENSAYO = new URLSearchParams(location.search).has('ensayo');

const raiz = document.querySelector<HTMLElement>('[data-recuento-vivo]');
if (raiz) iniciar(raiz);

const hora = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });

async function leer(url: string): Promise<DatosVivo> {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return leerDatosVivo(await r.json());
}

function iniciar(raiz: HTMLElement) {
  const estado = document.querySelector<HTMLElement>('[data-vivo-estado]');
  const aviso = document.querySelector<HTMLElement>('[data-vivo-aviso]');
  const espera = document.querySelector<HTMLElement>('[data-vivo-espera]');
  const base = document.body.dataset.base ?? '/';
  const fuentes = [FUENTE_PRINCIPAL, `${base}datos-vivo/escrutinio.json`];
  const ref = referenciasVivo();
  let ultima: string | null = null;

  const decir = (el: HTMLElement | null, texto: string) => {
    if (!el) return;
    el.textContent = texto;
    el.hidden = texto === '';
  };

  const pintar = (datos: DatosVivo) => {
    const { vista, estimado, descartadas } = vistaDesdeVivo(datos, ref);
    if (!vista.circunscripciones.some((c) => c.estado !== 'sin-datos')) return false; // todavía sin escrutinio
    const paneles = renderPaneles(vista);
    for (const nombre of NOMBRES_PANEL) {
      const destino = raiz.querySelector(`[data-panel="${nombre}"]`);
      if (destino) destino.innerHTML = paneles[nombre];
    }
    const notas: string[] = [];
    if (estimado) notas.push('El porcentaje de censo escrutado es una estimación a partir de la participación de 2023.');
    const n = Object.keys(descartadas).length;
    if (n > 0) notas.push(`${n} circunscripción(es) no se muestran porque sus datos no son válidos.`);
    decir(aviso, notas.join(' '));
    raiz.hidden = false;
    if (espera) espera.hidden = true;
    return true;
  };

  const actualizar = async () => {
    let datos: DatosVivo | null = null;
    for (const url of fuentes) {
      try {
        datos = await leer(url);
        break;
      } catch {
        /* se prueba la siguiente fuente */
      }
    }
    if (!datos) {
      if (ultima === null) decir(estado, 'Todavía no hay datos del escrutinio o no se han podido cargar. Se vuelve a intentar cada minuto.');
      else decir(estado, `No se han podido cargar datos nuevos. Se muestran los de las ${ultima}.`);
      return;
    }
    // Lo publicado antes del cierre de los colegios no es del 29N (p. ej. restos de un ensayo): se ignora.
    if (!ENSAYO && Date.parse(datos.capturadoEn) < CIERRE_COLEGIOS) {
      decir(estado, 'Todavía no hay datos del escrutinio. Se vuelve a comprobar cada minuto.');
      return;
    }
    if (!pintar(datos)) {
      decir(estado, 'Todavía no hay votos escrutados. Se vuelve a comprobar cada minuto.');
      return;
    }
    ultima = hora.format(new Date(datos.capturadoEn));
    const minutos = Math.round(antiguedadMinutos(datos, Date.now()));
    const viejo = minutos >= DATO_VIEJO_MIN ? ` Atención: el dato tiene ${minutos} minutos; el escrutinio real puede ir más adelantado.` : '';
    decir(estado, `Datos de las ${ultima} (hora peninsular). Origen de los datos: Ministerio del Interior.${viejo}`);
  };

  void actualizar();
  setInterval(() => {
    if (!document.hidden) void actualizar();
  }, CADA_MS);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void actualizar();
  });
}
