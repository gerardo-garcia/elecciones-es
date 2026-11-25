/**
 * Bucle de lectura de Infoelectoral para la noche electoral. Se pega en la consola (F12) de una pestaña de
 * https://infoelectoral.interior.gob.es/ y la deja abierta y visible. Lo ejecuta tu navegador normal: no se automatiza
 * ningún navegador ni se esquiva la protección del sitio. Las lecturas se las envía al receptor local
 * (scripts/infoelectoral/receptor.py), que valida, guarda y convierte.
 *
 * Reparte las peticiones para no activar la protección del sitio («Security Policy Violation»):
 *  - Una sola petición cada vez, separadas 4 s ± 1,5 s.
 *  - Al empezar, un barrido de todas las provincias en lotes de 10 (unos 7 minutos).
 *  - Después, cada ciclo de 2 minutos: el resumen y las estadísticas nacionales y, solo si el resumen nacional ha
 *    cambiado, un lote de 10 provincias en rotación (más escaños primero). El resumen de una provincia se repite cada
 *    4 visitas, no en todas.
 *  - Tope de 400 peticiones por hora.
 *  - Si hay un fallo (HTML en vez de JSON, 403, 429...): espera 2 min, luego 10 min, y a la tercera para y avisa.
 *    Nunca reintenta en ráfaga.
 * Para pararlo a mano: detenerInfoelectoral()
 *
 * Fuente de los datos: Ministerio del Interior, Infoelectoral (reutilización autorizada citando el origen).
 */
(() => {
  // [provincia (código INE), comunidad (código de la API)], de más a menos escaños.
  const PROVINCIAS = [
    ['28', 12], ['08', 9], ['46', 17], ['03', 17], ['41', 1], ['29', 1], ['30', 13], ['07', 4], ['11', 1], ['15', 11],
    ['35', 5], ['48', 15], ['18', 1], ['33', 3], ['36', 11], ['38', 5], ['50', 2], ['04', 1], ['14', 1], ['17', 9],
    ['20', 15], ['43', 9], ['45', 7], ['06', 10], ['12', 17], ['13', 7], ['21', 1], ['23', 1], ['31', 14], ['39', 6],
    ['47', 8], ['01', 15], ['02', 7], ['09', 8], ['10', 10], ['24', 8], ['25', 9], ['26', 16], ['27', 11], ['32', 11],
    ['37', 8], ['05', 8], ['16', 7], ['19', 7], ['22', 2], ['34', 8], ['40', 8], ['44', 2], ['49', 8], ['42', 8],
    ['51', 18], ['52', 19],
  ];

  const CONFIG = {
    TIPO: 2, // 2 = Congreso
    ID: '202307', // AAAAMM de la convocatoria. Para el 29N: 202611 (hay que confirmarlo en el visor)
    RECEPTOR: 'http://127.0.0.1:8765',
    CICLO_MS: 120000,
    PAUSA_MS: 4000,
    VARIACION_MS: 1500,
    LOTE: 10,
    REFRESCO_RESUMEN: 4,
    TOPE_HORA: 400,
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
   * Toda la lógica está aquí y no toca el navegador: lo que necesita (red, tiempo, azar) entra por `entorno`,
   * para poder probarla con datos simulados.
   * entorno: { pedirApi(ruta) -> {estado, cuerpo}, enviar(carga), pausar(ms), ahora(), azar(), log(nivel, texto) }
   */
  function crearBucle(entorno, config = CONFIG) {
    const { pedirApi, enviar, pausar, ahora, azar, log } = entorno;
    const orden = PROVINCIAS.map(([p]) => p);
    const comunidad = Object.fromEntries(PROVINCIAS);
    const q = `tipoConvocatoria=${config.TIPO}&idConvocatoria=${config.ID}`;
    const filtro = (c) => (c === 'nacional' ? '' : `&codCCAA=${comunidad[c]}&codProvincia=${c}`);

    const peticiones = []; // instantes de las peticiones de la última hora
    const visitas = {};
    let pendientesInicio = [...orden];
    let cursor = 0;
    let ultimoResumenNacional = null;
    let pendientesEnvio = [];
    let fallos = 0;
    let detenido = false;
    let ciclos = 0;

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
      await pausar(config.PAUSA_MS + (azar() * 2 - 1) * config.VARIACION_MS);
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
          await enviar(pendientesEnvio[0]);
          pendientesEnvio.shift();
        } catch (e) {
          log('aviso', `El receptor no ha aceptado el envío (${e.message}); se reintenta en el siguiente`);
          return;
        }
      }
    };

    // Lee un lote de provincias (estadísticas siempre; resumen si `conResumen(provincia)`) y lo transmite aunque falle a medias.
    const leerLote = async (provincias, conResumen) => {
      const respuestas = {};
      try {
        for (const c of provincias) {
          const t = {};
          if (conResumen(c)) t.resumen = await pedir(`resumen?${q}${filtro(c)}`);
          t.estadisticas = await pedir(`estadisticas?${q}${filtro(c)}`);
          respuestas[c] = t;
        }
      } finally {
        await transmitir(respuestas);
      }
    };

    const barridoInicial = async () => {
      const nacional = {};
      nacional.resumen = await pedir(`resumen?${q}`);
      nacional.estadisticas = await pedir(`estadisticas?${q}`);
      ultimoResumenNacional = nacional.resumen.cuerpo;
      await transmitir({ nacional });
      while (pendientesInicio.length > 0) {
        const lote = pendientesInicio.slice(0, config.LOTE);
        await leerLote(lote, () => true);
        pendientesInicio = pendientesInicio.slice(lote.length);
        lote.forEach((c) => (visitas[c] = 1));
      }
    };

    const ciclo = async () => {
      const nacional = { resumen: await pedir(`resumen?${q}`) };
      const cambio = nacional.resumen.cuerpo !== ultimoResumenNacional;
      nacional.estadisticas = await pedir(`estadisticas?${q}`);
      await transmitir({ nacional });
      if (cambio) {
        const lote = [];
        for (let i = 0; i < config.LOTE; i++) lote.push(orden[(cursor + i) % orden.length]);
        await leerLote(lote, (c) => (visitas[c] ?? 0) % config.REFRESCO_RESUMEN === 0);
        cursor = (cursor + config.LOTE) % orden.length;
        lote.forEach((c) => (visitas[c] = (visitas[c] ?? 0) + 1));
      } else {
        log('info', 'Sin cambios en el resumen nacional: no se piden provincias');
      }
      ultimoResumenNacional = nacional.resumen.cuerpo;
    };

    const ejecutar = async () => {
      while (!detenido) {
        const inicio = ahora();
        try {
          if (pendientesInicio.length > 0 || ultimoResumenNacional === null) await barridoInicial();
          else await ciclo();
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
          continue;
        }
        ciclos += 1;
        const resto = config.CICLO_MS - (ahora() - inicio);
        if (resto > 0) await pausar(resto);
      }
    };

    return {
      ejecutar,
      detener: () => {
        detenido = true;
      },
      estado: () => ({ ciclos, fallos, detenido, peticionesUltimaHora: peticiones.length, sinEnviar: pendientesEnvio.length }),
    };
  }

  if (typeof module !== 'undefined') {
    module.exports = { crearBucle, PROVINCIAS, CONFIG };
  } else if (typeof document !== 'undefined') {
    const base = 'https://infoelectoral.interior.gob.es/min/';
    const cabeceras = { Authorization: 'Basic ' + btoa('apiInfoelectoral:apiInfoelectoralPro') };
    const bucle = crearBucle({
      pedirApi: async (ruta) => {
        const r = await fetch(base + ruta, { headers: cabeceras });
        return { estado: r.status, cuerpo: await r.text() };
      },
      enviar: async (carga) => {
        const r = await fetch(`${CONFIG.RECEPTOR}/captura`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(carga),
        });
        if (!r.ok) throw new Error(`receptor ${r.status}: ${(await r.text()).slice(0, 200)}`);
      },
      pausar: (ms) => new Promise((resolver) => setTimeout(resolver, ms)),
      ahora: () => Date.now(),
      azar: Math.random,
      log: (nivel, texto) => console[nivel === 'error' ? 'error' : nivel === 'aviso' ? 'warn' : 'log'](`[${new Date().toLocaleTimeString()}] ${texto}`),
    });
    window.detenerInfoelectoral = bucle.detener;
    window.estadoInfoelectoral = bucle.estado;
    console.log('Bucle de Infoelectoral en marcha. Para pararlo: detenerInfoelectoral(). Estado: estadoInfoelectoral()');
    bucle.ejecutar();
  }
})();
