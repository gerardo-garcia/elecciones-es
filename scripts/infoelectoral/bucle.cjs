/**
 * Bucle de lectura de Infoelectoral para la noche electoral. Se pega en la consola (F12) de una pestaña de
 * https://infoelectoral.interior.gob.es/ y la deja abierta y visible, o lo carga sin nadie delante la extensión de
 * scripts/infoelectoral/desatendido/. Lo ejecuta un Firefox normal: no se automatiza el navegador (ni WebDriver ni
 * control remoto) ni se esquiva la protección del sitio. Las lecturas se las envía al receptor local
 * (scripts/infoelectoral/receptor.py), que valida, guarda y convierte.
 *
 * Busca solo la convocatoria de 2026 en la API (INFOELECTORAL_ID = 'AAAAMM' para fijar otra) y, con
 * INFOELECTORAL_INICIO = 'fecha ISO', no pide nada hasta esa hora.
 *
 * Una ronda continua, sin esperas entre vueltas:
 *  - Una sola petición cada vez, con 5 s entre una y la siguiente (12 por minuto, 720 por hora).
 *  - Cada vuelta lee la información nacional (resumen y estadísticas) al principio y a la mitad, y las 52
 *    circunscripciones (resumen y estadísticas), de más a menos escaños: 108 peticiones, unos 9 minutos.
 *  - Al acabar una vuelta empieza la siguiente sin esperar.
 *  - Tope de 800 peticiones por hora.
 *  - Si hay un fallo (HTML en vez de JSON, 403, 429...): espera 2 min, luego 10 min, y a la tercera para y avisa.
 *    Nunca reintenta en ráfaga. Sin nadie delante, tras parar lo vuelve a intentar una sola vez cada 20 min.
 * Para pararlo a mano: detenerInfoelectoral()
 *
 * Fuente de los datos: Ministerio del Interior, Infoelectoral (reutilización autorizada citando el origen).
 */
(() => {
  // [provincia (código INE), comunidad (código de la API, que NO es el del mapa del visor: ver scripts/tests)], de más a menos escaños.
  const PROVINCIAS = [
    ['28', 12], ['08', 9], ['46', 17], ['03', 17], ['41', 1], ['29', 1], ['30', 15], ['07', 4], ['11', 1], ['15', 11],
    ['35', 5], ['48', 14], ['18', 1], ['33', 3], ['36', 11], ['38', 5], ['50', 2], ['04', 1], ['14', 1], ['17', 9],
    ['20', 14], ['43', 9], ['45', 7], ['06', 10], ['12', 17], ['13', 7], ['21', 1], ['23', 1], ['31', 13], ['39', 6],
    ['47', 8], ['01', 14], ['02', 7], ['09', 8], ['10', 10], ['24', 8], ['25', 9], ['26', 16], ['27', 11], ['32', 11],
    ['37', 8], ['05', 8], ['16', 7], ['19', 7], ['22', 2], ['34', 8], ['40', 8], ['44', 2], ['49', 8], ['42', 8],
    ['51', 18], ['52', 19],
  ];

  const CONFIG = {
    TIPO: 2, // 2 = Congreso
    // AAAAMM de la convocatoria. Por defecto 'auto': la de 2026 que liste la API (se mira cada 2 min hasta que aparezca).
    // Para un ensayo, antes del bucle:  INFOELECTORAL_ID = '202307'
    ID: (typeof globalThis !== 'undefined' && globalThis.INFOELECTORAL_ID) || 'auto',
    RECEPTOR: 'http://127.0.0.1:8765',
    PAUSA_MS: 5000,
    TOPE_HORA: 800,
    ESPERAS_FALLO_MS: [120000, 600000],
    MAX_FALLOS: 3,
  };

  class ErrorApi extends Error {}

  const cuerpoValido = (cuerpo) => {
    if (cuerpo.trimStart().startsWith('<')) return false;
    try {
      return JSON.parse(cuerpo).cod === '200';
    } catch {
      return false;
    }
  };

  /**
   * Toda la lógica está aquí y no toca el navegador: lo que necesita (red y tiempo) entra por `entorno`,
   * para poder probarla con datos simulados.
   * entorno: { pedirApi(ruta) -> {estado, cuerpo}, enviar(carga), pausar(ms), ahora(), log(nivel, texto) }
   */
  function crearBucle(entorno, config = CONFIG) {
    const { pedirApi, enviar, pausar, ahora, log } = entorno;
    const comunidad = Object.fromEntries(PROVINCIAS);
    const q = `tipoConvocatoria=${config.TIPO}&idConvocatoria=${config.ID}`;
    const filtro = (c) => (c === 'nacional' ? '' : `&codCCAA=${comunidad[c]}&codProvincia=${c}`);
    // Una vuelta: nacional, la primera mitad de las provincias, nacional, la segunda mitad.
    const provincias = PROVINCIAS.map(([p]) => p);
    const mitad = Math.ceil(provincias.length / 2);
    const vuelta = ['nacional', ...provincias.slice(0, mitad), 'nacional', ...provincias.slice(mitad)];

    const peticiones = []; // instantes de las peticiones de la última hora
    let pendientesEnvio = [];
    let fallos = 0;
    let detenido = false;
    let indice = 0; // posición en la vuelta
    let vueltas = 0;

    const esperarPresupuesto = async () => {
      for (;;) {
        const limite = ahora() - 3600000;
        while (peticiones.length > 0 && peticiones[0] <= limite) peticiones.shift();
        if (peticiones.length < config.TOPE_HORA) return;
        log('aviso', 'Tope de peticiones por hora alcanzado: espero');
        await pausar(peticiones[0] + 3600000 - ahora() + 1000);
      }
    };

    const pedir = async (ruta) => {
      await esperarPresupuesto();
      await pausar(config.PAUSA_MS);
      peticiones.push(ahora());
      const r = await pedirApi(ruta);
      if (r.estado !== 200 || !cuerpoValido(r.cuerpo)) {
        throw new ErrorApi(`${ruta}: estado ${r.estado}, ${r.cuerpo.trimStart().startsWith('<') ? 'HTML (¿bloqueo?)' : 'respuesta no válida'}`);
      }
      return r;
    };

    // Envía al receptor lo leído. Si el receptor no responde, lo guarda y lo reenvía en el siguiente envío.
    const transmitir = async (respuestas) => {
      if (Object.keys(respuestas).length === 0) return;
      pendientesEnvio.push({
        capturadoEn: new Date(ahora()).toISOString(),
        convocatoria: { tipo: config.TIPO, id: config.ID },
        respuestas,
      });
      while (pendientesEnvio.length > 0) {
        try {
          const r = await enviar(pendientesEnvio[0]);
          pendientesEnvio.shift();
          if (r && r.rechazadas && Object.keys(r.rechazadas).length > 0) {
            log('aviso', `El receptor rechazó ${Object.keys(r.rechazadas).join(', ')}: ${JSON.stringify(r.rechazadas)}`);
          }
        } catch (e) {
          if (e.permanente) {
            // El receptor entiende el envío pero no lo acepta: reenviarlo daría lo mismo y bloquearía los siguientes.
            log('error', `Envío descartado por el receptor (${e.message})`);
            pendientesEnvio.shift();
            continue;
          }
          log('aviso', `El receptor no ha aceptado el envío (${e.message}); se reintenta en el siguiente`);
          return;
        }
      }
    };

    // Un territorio: resumen y estadísticas, y se envían juntos.
    const leer = async (clave) => {
      const resumen = await pedir(`resumen?${q}${filtro(clave)}`);
      const estadisticas = await pedir(`estadisticas?${q}${filtro(clave)}`);
      await transmitir({ [clave]: { resumen, estadisticas } });
    };

    const ejecutar = async () => {
      while (!detenido) {
        try {
          await leer(vuelta[indice]);
          fallos = 0;
        } catch (e) {
          fallos += 1;
          log('error', `Fallo ${fallos} de ${config.MAX_FALLOS}: ${e.message}`);
          if (fallos >= config.MAX_FALLOS) {
            detenido = true;
            log('error', 'PARADO: demasiados fallos seguidos. No se reintenta. Revisa el sitio y vuelve a pegar el bucle.');
            break;
          }
          await pausar(config.ESPERAS_FALLO_MS[fallos - 1]);
          continue; // se vuelve a intentar el mismo territorio
        }
        indice += 1;
        if (indice >= vuelta.length) {
          indice = 0;
          vueltas += 1;
          log('info', `Vuelta ${vueltas} completa`);
        }
      }
    };

    return {
      ejecutar,
      detener: () => {
        detenido = true;
      },
      estado: () => ({ vueltas, posicion: `${indice}/${vuelta.length}`, fallos, detenido, peticionesUltimaHora: peticiones.length, sinEnviar: pendientesEnvio.length }),
    };
  }

  /** De la lista de convocatorias de la API, la más reciente cuyo código empieza por `prefijo` (o null si no hay). */
  function elegirConvocatoria(cuerpo, prefijo = '2026') {
    let datos;
    try {
      datos = JSON.parse(cuerpo);
    } catch {
      return null;
    }
    const codigos = (Array.isArray(datos && datos.data) ? datos.data : [])
      .map((c) => String((c && c.cod) || ''))
      .filter((c) => /^\d{6}$/.test(c) && c.startsWith(prefijo))
      .sort();
    return codigos.length > 0 ? codigos[codigos.length - 1] : null;
  }

  if (typeof module !== 'undefined') {
    module.exports = { crearBucle, elegirConvocatoria, PROVINCIAS, CONFIG };
  } else if (typeof document !== 'undefined') {
    // Una sola instancia por página (por si el script se carga dos veces).
    if (window.estadoInfoelectoral) return;
    const base = 'https://infoelectoral.interior.gob.es/min/';
    const cabeceras = { Authorization: 'Basic ' + btoa('apiInfoelectoral:apiInfoelectoralPro') };
    // Sin nadie delante (extensión de scripts/infoelectoral/desatendido): el registro va también al receptor.
    const registroAlReceptor = globalThis.INFOELECTORAL_REGISTRO === true;
    // Instante de arranque (ISO 8601); antes no se pide nada.
    const inicio = globalThis.INFOELECTORAL_INICIO ? Date.parse(globalThis.INFOELECTORAL_INICIO) : 0;
    const pausar = (ms) => new Promise((resolver) => setTimeout(resolver, ms));
    const log = (nivel, texto) => {
      const linea = `[${new Date().toLocaleTimeString()}] ${texto}`;
      console[nivel === 'error' ? 'error' : nivel === 'aviso' ? 'warn' : 'log'](linea);
      if (registroAlReceptor) {
        red(`${CONFIG.RECEPTOR}/registro`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: `${nivel} ${texto}` }).catch(() => {});
      }
    };
    // Dentro de la extensión, las peticiones se hacen como la propia página (content.fetch), igual que desde la consola.
    const red = typeof content !== 'undefined' && content && typeof content.fetch === 'function' ? content.fetch.bind(content) : fetch;
    const pedirApi = async (ruta) => {
      const r = await red(base + ruta, { headers: cabeceras });
      return { estado: r.status, cuerpo: await r.text() };
    };
    let bucle = null;
    let paradaManual = false;
    window.detenerInfoelectoral = () => {
      paradaManual = true;
      if (bucle) bucle.detener();
    };
    window.estadoInfoelectoral = () => (bucle ? bucle.estado() : { esperando: true });
    const entorno = {
      pedirApi,
      enviar: async (carga) => {
        const r = await red(`${CONFIG.RECEPTOR}/captura`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(carga),
        });
        if (!r.ok) {
          const error = new Error(`receptor ${r.status}: ${(await r.text()).slice(0, 300)}`);
          error.permanente = r.status >= 400 && r.status < 500;
          throw error;
        }
        return r.json();
      },
      pausar,
      ahora: () => Date.now(),
      log,
    };
    const arrancar = async () => {
      if (Date.now() < inicio) log('info', `Bucle de Infoelectoral cargado: empieza a las ${new Date(inicio).toLocaleString()}`);
      while (!paradaManual && Date.now() < inicio) await pausar(Math.min(inicio - Date.now(), 60000));
      let id = CONFIG.ID;
      while (!paradaManual && id === 'auto') {
        let r = null;
        try {
          r = await pedirApi(`convocatorias?tipoConvocatoria=${CONFIG.TIPO}`);
        } catch (e) {
          log('aviso', `No se pudo leer la lista de convocatorias (${e.message})`);
        }
        const elegida = r && r.estado === 200 ? elegirConvocatoria(r.cuerpo) : null;
        if (elegida) id = elegida;
        else {
          log('aviso', `La convocatoria de 2026 aún no aparece en la API${r ? ` (estado ${r.estado})` : ''}: vuelvo a mirar en 2 min`);
          await pausar(120000);
        }
      }
      while (!paradaManual) {
        log('info', `Bucle de Infoelectoral en marcha, convocatoria ${id}. Para pararlo: detenerInfoelectoral(). Estado: estadoInfoelectoral()`);
        bucle = crearBucle(entorno, { ...CONFIG, ID: id });
        await bucle.ejecutar();
        if (paradaManual || !registroAlReceptor) break;
        // Sin nadie delante: tras una parada por fallos, un único intento cada 20 min (nunca en ráfaga).
        log('aviso', 'Vuelvo a intentarlo dentro de 20 min');
        await pausar(1200000);
      }
    };
    arrancar();
  }
})();
