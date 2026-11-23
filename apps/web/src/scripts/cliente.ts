/**
 * Script de cliente. Mejora la página estática con lo que depende del reloj del visitante:
 *  1. La portada ('/') salta a la fase vigente si cambió desde que se construyó.
 *  2. Durante la veda se retiran las encuestas aunque la página se construyera antes.
 *  3. Cuenta atrás.
 */
import { textoCuentaAtras } from '../lib/cuentaatras';
import { enVeda, faseEn, type Calendario } from '../lib/fase';

const calendarioEl = document.getElementById('calendario');

if (calendarioEl?.textContent) {
  const calendario = JSON.parse(calendarioEl.textContent) as Calendario;
  const { fase: construida, portada, base } = document.body.dataset;

  const vigente = faseEn(new Date(), calendario);
  if (portada === 'true' && construida && base && vigente !== construida) {
    location.replace(`${base}${vigente}/`);
  }

  const retirarEncuestasEnVeda = () => {
    if (enVeda(new Date(), calendario)) {
      document.querySelectorAll('[data-encuestas]').forEach((n) => n.remove());
      document.querySelectorAll('[data-aviso-veda]').forEach((n) => n.removeAttribute('hidden'));
    }
  };
  retirarEncuestasEnVeda();

  const cuentas = document.querySelectorAll<HTMLElement>('[data-cuenta-atras]');
  const actualizar = () => {
    for (const el of cuentas) {
      const objetivo = Date.parse(el.dataset.cuentaAtras ?? '');
      if (Number.isNaN(objetivo)) continue;
      const texto = textoCuentaAtras(objetivo - Date.now());
      el.textContent = texto ?? el.dataset.textoFinal ?? '';
    }
    retirarEncuestasEnVeda();
  };
  if (cuentas.length > 0) {
    actualizar();
    setInterval(actualizar, 30_000);
  }
}
