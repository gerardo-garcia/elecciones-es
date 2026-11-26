// Pruebas del bucle de lectura con red y reloj simulados:  node --test scripts/tests/bucle.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const { crearBucle, PROVINCIAS, CONFIG: CONFIG_BASE } = require('../infoelectoral/bucle.cjs');
// Los datos de prueba son de 2023.
const CONFIG = { ...CONFIG_BASE, ID: '202307' };

const OK = JSON.stringify({ cod: '200', data: {} });
const VUELTA = 2 + 52 * 2 + 2; // nacional ×2 (resumen y estadísticas) + 52 provincias ×2

/** Entorno simulado: reloj virtual (`pausar` lo adelanta) y cada petición queda anotada con su instante. */
function entorno({ falla = () => null, parar = Infinity } = {}) {
  let t = 1_000_000;
  const e = { peticiones: [], envios: [], logs: [], enCurso: 0, maxEnCurso: 0, bucle: null };
  e.ahora = () => t;
  e.pausar = async (ms) => {
    t += Math.max(0, ms);
  };
  e.log = (nivel, texto) => e.logs.push([nivel, texto]);
  e.pedirApi = async (ruta) => {
    e.enCurso++;
    e.maxEnCurso = Math.max(e.maxEnCurso, e.enCurso);
    await Promise.resolve();
    e.peticiones.push({ ruta, t });
    e.enCurso--;
    if (e.peticiones.length >= parar) e.bucle?.detener();
    return falla(ruta, e.peticiones.length) ?? { estado: 200, cuerpo: OK };
  };
  e.enviar = async (carga) => {
    e.envios.push(carga);
  };
  return e;
}

const correr = async (e, cfg = CONFIG) => {
  e.bucle = crearBucle(e, cfg);
  await e.bucle.ejecutar();
  return e.bucle;
};

test('las peticiones van de una en una y con 5 s entre una y la siguiente', async () => {
  const e = entorno({ parar: 30 });
  await correr(e);
  assert.equal(e.maxEnCurso, 1);
  const huecos = e.peticiones.slice(1).map((p, i) => p.t - e.peticiones[i].t);
  assert.ok(huecos.every((h) => h >= 5000), `hueco mínimo ${Math.min(...huecos)}`);
});

test('una vuelta son 108 peticiones: nacional ×2 y las 52 circunscripciones, y tarda unos 9 minutos', async () => {
  const e = entorno({ parar: VUELTA });
  await correr(e);
  assert.equal(e.peticiones.length, 108);
  const provincias = e.peticiones.map((p) => /codProvincia=(\d+)/.exec(p.ruta)?.[1]).filter(Boolean);
  assert.equal(new Set(provincias).size, 52);
  assert.equal(e.peticiones.filter((p) => !p.ruta.includes('codProvincia')).length, 4);
  const duracion = e.peticiones.at(-1).t - e.peticiones[0].t;
  assert.ok(duracion >= 107 * 5000 && duracion < 560000, `duración ${duracion / 1000} s`);
});

test('la nacional se lee al principio y a la mitad de la vuelta', async () => {
  const e = entorno({ parar: VUELTA });
  await correr(e);
  const posiciones = e.peticiones.map((p, i) => (p.ruta.startsWith('resumen?') && !p.ruta.includes('codProvincia') ? i : -1)).filter((i) => i >= 0);
  assert.deepEqual(posiciones, [0, 54]);
});

test('al acabar una vuelta empieza la siguiente sin esperar', async () => {
  const e = entorno({ parar: VUELTA + 6 });
  await correr(e);
  const hueco = e.peticiones[VUELTA].t - e.peticiones[VUELTA - 1].t;
  assert.equal(hueco, 5000);
  assert.match(e.peticiones[VUELTA].ruta, /^resumen\?tipoConvocatoria=2&idConvocatoria=202307$/); // vuelve a empezar por la nacional
  assert.ok(e.logs.some(([, t]) => t.includes('Vuelta 1 completa')));
});

test('empieza por las provincias con más escaños y usa el código de comunidad de la API', async () => {
  const e = entorno({ parar: 8 });
  await correr(e);
  const primera = e.peticiones.find((p) => p.ruta.includes('codProvincia'));
  assert.match(primera.ruta, /codCCAA=12&codProvincia=28/); // Madrid
  assert.equal(PROVINCIAS.length, 52);
});

test('cada territorio se envía al receptor con su resumen y sus estadísticas, tal cual', async () => {
  const e = entorno({ parar: 6 });
  await correr(e);
  const c = e.envios[1];
  assert.match(c.capturadoEn, /^\d{4}-\d\d-\d\dT/);
  assert.deepEqual(c.convocatoria, { tipo: 2, id: '202307' });
  assert.deepEqual(Object.keys(c.respuestas), ['28']);
  assert.equal(c.respuestas['28'].resumen.estado, 200);
  assert.ok(c.respuestas['28'].estadisticas.cuerpo.includes('"cod"'));
});

test('un fallo espera 2 min, luego 10 min, y al tercero para sin reintentar en ráfaga', async () => {
  const e = entorno({ falla: (ruta, n) => (n > 3 ? { estado: 200, cuerpo: '<html>Security Policy Violation</html>' } : null) });
  const b = await correr(e);
  assert.equal(b.estado().detenido, true);
  assert.equal(b.estado().fallos, 3);
  assert.ok(e.logs.some(([n, t]) => n === 'error' && t.includes('PARADO')));
  const t = e.peticiones.map((p) => p.t);
  assert.ok(t[4] - t[3] >= 120000, `primera espera: ${t[4] - t[3]} ms`);
  assert.ok(t[5] - t[4] >= 600000, `segunda espera: ${t[5] - t[4]} ms`);
  assert.equal(e.peticiones.length, 6);
});

test('tras un fallo aislado reintenta el mismo territorio y sigue; el contador vuelve a cero', async () => {
  let fallado = false;
  const e = entorno({ parar: 12, falla: (ruta, n) => (n === 5 && !fallado ? ((fallado = true), { estado: 403, cuerpo: 'x' }) : null) });
  const b = await correr(e);
  assert.equal(b.estado().fallos, 0);
  const rutas = e.peticiones.map((p) => p.ruta);
  assert.equal(rutas[4], rutas[5]); // la petición que falló se repite
});

test('una respuesta que no es JSON ni HTML también cuenta como fallo', async () => {
  const e = entorno({ falla: () => ({ estado: 200, cuerpo: 'no es json' }) });
  const b = await correr(e);
  assert.equal(b.estado().fallos, 3);
});

test('respeta el tope de peticiones por hora esperando', async () => {
  const e = entorno({ parar: 40 });
  await correr(e, { ...CONFIG, TOPE_HORA: 10 });
  const ventanas = e.peticiones.map((p, i) => e.peticiones.filter((q, j) => j <= i && q.t > p.t - 3600000).length);
  assert.ok(Math.max(...ventanas) <= 10, `máximo en una hora: ${Math.max(...ventanas)}`);
  assert.ok(e.logs.some(([, t]) => t.includes('Tope')));
});

test('al ritmo normal (5 s) no se acerca al tope de 800 por hora', async () => {
  const e = entorno({ parar: 2 * VUELTA });
  const b = await correr(e);
  assert.ok(b.estado().peticionesUltimaHora <= 720 + 1);
  assert.ok(!e.logs.some(([, t]) => t.includes('Tope')));
});

test('si el receptor no responde no se pierde nada y no se para la lectura', async () => {
  const e = entorno();
  let b;
  let intentos = 0;
  e.enviar = async () => {
    if (++intentos >= 3) b.detener();
    throw new Error('sin receptor');
  };
  b = crearBucle(e, CONFIG);
  await b.ejecutar();
  assert.ok(b.estado().sinEnviar > 0);
  assert.equal(b.estado().fallos, 0);
});

test('un rechazo permanente del receptor (4xx) se descarta y no bloquea los envíos siguientes', async () => {
  const e = entorno();
  let b;
  let intentos = 0;
  e.enviar = async () => {
    intentos++;
    if (intentos === 1) {
      const error = new Error('receptor 422');
      error.permanente = true;
      throw error;
    }
    if (intentos >= 4) b.detener();
  };
  b = crearBucle(e, CONFIG);
  await b.ejecutar();
  assert.equal(b.estado().sinEnviar, 0);
  assert.ok(e.logs.some(([n, t]) => n === 'error' && t.includes('descartado')));
  assert.ok(intentos >= 4);
});

test('avisa de los territorios que el receptor rechaza dentro de un envío aceptado', async () => {
  const e = entorno();
  let b;
  e.enviar = async () => {
    b.detener();
    return { ok: true, rechazadas: { '08': 'motivo' } };
  };
  b = crearBucle(e, CONFIG);
  await b.ejecutar();
  assert.ok(e.logs.some(([n, t]) => n === 'aviso' && t.includes('08')));
});

test('los códigos de comunidad coinciden con los que el visor envía a la API para cada provincia', () => {
  // Fichero: provincia -> código de comunidad del MAPA del visor (prv.geojson). El visor lo traduce al de la API con
  // la tabla `mappingCCAA` de su map.js: la que sigue es esa tabla (mapa -> API; los demás son iguales).
  const mapa = require('./fixtures/infoelectoral-provincia-comunidad-mapa.json');
  const aApi = { 7: 8, 8: 7, 10: 17, 11: 10, 12: 11, 13: 12, 14: 15, 15: 13, 16: 14, 17: 16 };
  const esperado = Object.fromEntries(Object.entries(mapa).map(([p, c]) => [p, aApi[Number(c)] ?? Number(c)]));
  const real = Object.fromEntries(PROVINCIAS);
  assert.deepEqual(real, esperado);
  // Las tres que dieron bloqueo por pedirlas con el código del mapa o con una suposición:
  assert.equal(real['30'], 15); // Murcia
  assert.equal(real['31'], 13); // Navarra
  assert.deepEqual([real['01'], real['20'], real['48']], [14, 14, 14]); // País Vasco
  assert.equal(real['28'], 12); // Madrid: es el código de la URL que usa el propio visor
});
