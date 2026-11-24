/**
 * Carga de los anuncios. El script de AdSense (en <head>, solo si hay anuncios configurados) los rellena cuando se
 * le pide con `push`. Los laterales solo se piden si caben: pedirlos ocultos haría que AdSense contara un anuncio
 * que nadie ve (y daría error de tamaño).
 */
type ColaAdsense = unknown[];
interface Googlefc {
  showRevocationMessage?: () => void;
}
const w = window as unknown as { adsbygoogle?: ColaAdsense; googlefc?: Googlefc };

function pedir(hueco: HTMLElement) {
  if (hueco.dataset.cargado) return;
  hueco.dataset.cargado = 'true';
  try {
    (w.adsbygoogle ||= []).push({});
  } catch {
    // Un anuncio que falla no debe romper la página.
  }
}

const huecos = document.querySelectorAll<HTMLElement>('[data-anuncio]');
if (huecos.length > 0) {
  const ancho = Number(document.body.dataset.anchoLaterales);
  const caben = window.matchMedia(`(min-width: ${ancho}px)`);
  const laterales: HTMLElement[] = [];
  for (const hueco of huecos) {
    if (hueco.dataset.anuncio === 'lateral') laterales.push(hueco);
    else pedir(hueco);
  }
  const pedirLaterales = () => {
    if (caben.matches) for (const l of laterales) pedir(l);
  };
  pedirLaterales();
  caben.addEventListener('change', pedirLaterales);

  // «Preferencias de publicidad»: reabre el mensaje de consentimiento de Google. El botón solo aparece si Google lo ofrece.
  const preferencias = document.querySelector<HTMLElement>('[data-preferencias-publicidad]');
  const boton = preferencias?.querySelector('button');
  if (preferencias && boton) {
    boton.addEventListener('click', () => w.googlefc?.showRevocationMessage?.());
    let intentos = 0;
    const espera = window.setInterval(() => {
      if (typeof w.googlefc?.showRevocationMessage === 'function') {
        preferencias.hidden = false;
        window.clearInterval(espera);
      } else if (++intentos >= 20) window.clearInterval(espera);
    }, 500);
  }
}
