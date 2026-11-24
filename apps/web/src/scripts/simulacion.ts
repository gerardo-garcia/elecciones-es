/**
 * Controles de la simulación: carga la noche simulada (JSON generado en el build), y al mover el deslizador o dar al
 * play sustituye el interior de cada panel con el dibujo de la vista de ese instante.
 */
import type { VistaRecuento } from '@elecciones/engine';
import { NOMBRES_PANEL, renderPaneles } from '../lib/recuento/paneles';
import { horaSimulada, tiempoTrasElCierre } from '../lib/reloj';

interface Noche {
  orden: string;
  semilla: number;
  minutos: number[];
  vistas: VistaRecuento[];
}

const formulario = document.querySelector<HTMLFormElement>('[data-simulacion]');
if (formulario) iniciar(formulario);

function iniciar(formulario: HTMLFormElement) {
  const q = <T extends HTMLElement>(selector: string) => formulario.querySelector<T>(selector) as T;
  const deslizador = q<HTMLInputElement>('[data-deslizador]');
  const botonPlay = q<HTMLButtonElement>('[data-reproducir]');
  const selectorOrden = q<HTMLSelectElement>('[data-orden]');
  const selectorVelocidad = q<HTMLSelectElement>('[data-velocidad]');
  const reloj = q<HTMLElement>('[data-reloj]');
  const tiempo = q<HTMLElement>('[data-tiempo]');
  const estadoCarga = q<HTMLElement>('[data-estado-carga]');
  const base = document.body.dataset.base ?? '/';

  const noches = new Map<string, Promise<Noche>>();
  const cargar = (orden: string): Promise<Noche> => {
    let p = noches.get(orden);
    if (!p) {
      p = fetch(`${base}simulacion/noche-${orden}.json`).then((r) => {
        if (!r.ok) throw new Error(`No se pudo cargar la simulación (${r.status})`);
        return r.json() as Promise<Noche>;
      });
      noches.set(orden, p);
      p.catch(() => noches.delete(orden));
    }
    return p;
  };

  let noche: Noche | null = null;
  let indice = Number(formulario.dataset.inicial ?? 0);
  let temporizador: number | undefined;
  let pendiente = 0;

  const pintar = () => {
    pendiente = 0;
    if (!noche) return;
    const vista = noche.vistas[indice];
    const minutos = noche.minutos[indice];
    if (!vista || minutos === undefined) return;
    const paneles = renderPaneles(vista);
    for (const nombre of NOMBRES_PANEL) {
      const destino = document.querySelector(`[data-panel="${nombre}"]`);
      if (destino) destino.innerHTML = paneles[nombre];
    }
    deslizador.value = String(indice);
    reloj.textContent = horaSimulada(minutos);
    tiempo.textContent = `(${tiempoTrasElCierre(minutos)})`;
  };
  /** Varios cambios seguidos (arrastrar el deslizador) se pintan una sola vez por fotograma. */
  const pedirPintado = () => {
    if (!pendiente) pendiente = requestAnimationFrame(pintar);
  };

  const pausar = () => {
    if (temporizador !== undefined) clearInterval(temporizador);
    temporizador = undefined;
    botonPlay.textContent = '▶ Reproducir';
    botonPlay.setAttribute('aria-pressed', 'false');
  };

  const reproducir = () => {
    if (!noche) return;
    if (indice >= noche.vistas.length - 1) indice = 0;
    botonPlay.textContent = '⏸ Pausar';
    botonPlay.setAttribute('aria-pressed', 'true');
    temporizador = window.setInterval(() => {
      if (!noche || indice >= noche.vistas.length - 1) return pausar();
      indice++;
      pintar();
      if (indice >= noche.vistas.length - 1) pausar();
    }, Number(selectorVelocidad.value));
    pintar();
  };

  const cambiarOrden = async () => {
    pausar();
    const minutosActuales = noche?.minutos[indice] ?? 0;
    selectorOrden.disabled = true;
    try {
      noche = await cargar(selectorOrden.value);
      const i = noche.minutos.findIndex((m) => m >= minutosActuales);
      indice = i < 0 ? noche.vistas.length - 1 : i;
      deslizador.max = String(noche.vistas.length - 1);
      pintar();
    } catch {
      estadoCarga.textContent = 'No se ha podido cargar esa simulación. Recarga la página para volver a intentarlo.';
    } finally {
      selectorOrden.disabled = false;
    }
  };

  deslizador.addEventListener('input', () => {
    pausar();
    indice = Number(deslizador.value);
    pedirPintado();
  });
  botonPlay.addEventListener('click', () => (temporizador === undefined ? reproducir() : pausar()));
  selectorOrden.addEventListener('change', cambiarOrden);
  selectorVelocidad.addEventListener('change', () => {
    if (temporizador !== undefined) {
      pausar();
      reproducir();
    }
  });

  cargar(selectorOrden.value)
    .then((n) => {
      noche = n;
      indice = Math.min(indice, n.vistas.length - 1);
      deslizador.max = String(n.vistas.length - 1);
      for (const el of [deslizador, selectorOrden, selectorVelocidad]) el.disabled = false;
      botonPlay.hidden = false;
      estadoCarga.hidden = true;
      pintar();
    })
    .catch(() => {
      estadoCarga.textContent = 'No se ha podido cargar la simulación. Recarga la página para volver a intentarlo.';
    });
}
