// Pruebas del bucle de lectura con red y reloj simulados:  node --test scripts/tests/bucle.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const { crearBucle, PROVINCIAS, CONFIG } = require('../infoelectoral/bucle.cjs');

const OK = JSON.stringify({ cod: '200', data: {} });

/** Entorno simulado: reloj virtual, `pausar` lo adelanta, y se anota cada petición con su instante. */
function entorno({ resumenNacional = () => OK, falla = () => null, enviarFalla = false } = {}) {
  let t = 1_000_000;
  const e = { peticiones: [], envios: [], logs: [], enCurso: 0, maxEnCurso: 0 };
  e.ahora = () => t;
  e.pausar = async (ms) => {
    t += Math.max(0, ms);
  };
  e.azar = () => 0.5; // sin variación: pausa exacta
  e.log = (nivel, texto) => e.logs.push([nivel, texto]);
  e.pedirApi = async (ruta) => {
    e.enCurso++;
    e.maxEnCurso = Math.max(e.maxEnCurso, e.enCurso);
    await Promise.resolve();
    e.peticiones.push({ ruta, t });
    e.enCurso--;
    const f = falla(ruta, e.peticiones.length);
    if (f) return f;
    if (ruta.startsWith('resumen?') && !ruta.includes('codProvincia')) return { estado: 200, cuerpo: resumenNacional(e.peticiones.length) };
    return { estado: 200, cuerpo: OK };
  };
  e.enviar = async (carga) => {
    if (enviarFalla) throw new Error('sin receptor');
    e.envios.push(carga);
  };
  return e;
}

const config = (extra = {}) => ({ ...CONFIG, ...extra });

/** Crea el bucle y lo hace parar tras `maxCiclos` lecturas nacionales completas; lo ejecuta y devuelve el bucle. */
const correr = async (e, maxCiclos, cfg = config()) => {
  let bucle;
  const original = e.enviar;
  e.enviar = async (c) => {
    await original(c);
    if (c.respuestas.nacional?.estadisticas && e.envios.filter((x) => x.respuestas.nacional?.estadisticas).length >= maxCiclos) bucle.detener();
  };
  bucle = crearBucle(e, cfg);
  await bucle.ejecutar();
  return bucle;
};

test('las peticiones van de una en una y separadas al menos la pausa base', async () => {
  const e = entorno();
  const b = await correr(e, 3);
  assert.equal(e.maxEnCurso, 1);
  const huecos = e.peticiones.slice(1).map((p, i) => p.t - e.peticiones[i].t);
  assert.ok(huecos.every((h) => h >= CONFIG.PAUSA_MS), `hueco mínimo ${Math.min(...huecos)}`);
});

test('el barrido inicial lee las 52 provincias con resumen y estadísticas, en lotes, y el nacional', async () => {
  const e = entorno();
  const b = await correr(e, 1);
  const prov = new Set(e.peticiones.map((p) => /codProvincia=(\d+)/.exec(p.ruta)?.[1]).filter(Boolean));
  assert.equal(prov.size, 52);
  assert.equal(e.peticiones.length, 2 + 52 * 2);
  const lotes = e.envios.filter((x) => !x.respuestas.nacional).map((x) => Object.keys(x.respuestas).length);
  assert.deepEqual(lotes, [10, 10, 10, 10, 10, 2]);
});

test('empieza por las provincias con más escaños y usa el código de comunidad de la API', async () => {
  const e = entorno();
  await correr(e, 1);
  const primera = e.peticiones.find((p) => p.ruta.includes('codProvincia'));
  assert.match(primera.ruta, /codCCAA=12&codProvincia=28/); // Madrid
  assert.equal(PROVINCIAS.length, 52);
});

test('sin cambios en el resumen nacional no se piden provincias', async () => {
  const e = entorno(); // el resumen nacional es siempre igual
  const b = await correr(e, 3);
  const n = e.peticiones.length;
  assert.equal(n, 2 + 52 * 2 + 2 * 2); // barrido + dos ciclos sin cambios (2 peticiones nacionales cada uno)
  assert.ok(e.logs.some(([, t]) => t.includes('Sin cambios')));
});

test('con cambios pide un lote de 10 provincias en rotación y repite el resumen solo cada 4 visitas', async () => {
  const e = entorno({ resumenNacional: (n) => JSON.stringify({ cod: '200', data: { n } }) }); // cambia siempre
  const b = await correr(e, 2);
  const tras = e.peticiones.slice(2 + 52 * 2); // lo posterior al barrido
  const prov = tras.filter((p) => p.ruta.includes('codProvincia'));
  assert.equal(prov.length, 10); // un lote, solo estadísticas
  assert.ok(prov.every((p) => p.ruta.startsWith('estadisticas?')));
  assert.match(prov[0].ruta, /codProvincia=28/);
});

test('un fallo espera 2 min, luego 10 min, y al tercero para sin reintentar en ráfaga', async () => {
  const e = entorno({ falla: (ruta, n) => (n > 3 ? { estado: 200, cuerpo: '<html>Security Policy Violation</html>' } : null) });
  const b = crearBucle(e, config());
  await b.ejecutar();
  assert.equal(b.estado().detenido, true);
  assert.equal(b.estado().fallos, 3);
  assert.ok(e.logs.some(([n, t]) => n === 'error' && t.includes('PARADO')));
  // La 4.ª petición es la primera que falla: hasta la siguiente pasan 2 min, y hasta la otra, 10 min.
  const t = e.peticiones.map((p) => p.t);
  assert.ok(t[4] - t[3] >= 120000, `primera espera: ${t[4] - t[3]} ms`);
  assert.ok(t[5] - t[4] >= 600000, `segunda espera: ${t[5] - t[4]} ms`);
  assert.equal(e.peticiones.length, 6);
  assert.ok(e.peticiones.length < 20, `no debe insistir: ${e.peticiones.length} peticiones`);
});

test('un fallo aislado se recupera y el contador vuelve a cero', async () => {
  let fallado = false;
  const e = entorno({ falla: (ruta, n) => (n === 5 && !fallado ? ((fallado = true), { estado: 403, cuerpo: 'x' }) : null) });
  const b = await correr(e, 2);
  assert.equal(b.estado().fallos, 0);
  assert.equal(b.estado().detenido, true); // por `correr`, no por fallos
});

test('una respuesta que no es JSON ni HTML también cuenta como fallo', async () => {
  const e = entorno({ falla: () => ({ estado: 200, cuerpo: 'no es json' }) });
  const b = crearBucle(e, config());
  await b.ejecutar();
  assert.equal(b.estado().fallos, 3);
});

test('respeta el tope de peticiones por hora esperando', async () => {
  const e = entorno();
  const b = await correr(e, 2, config({ TOPE_HORA: 10, CICLO_MS: 1000 }));
  const ventanas = e.peticiones.map((p, i) => e.peticiones.filter((q, j) => j <= i && q.t > p.t - 3600000).length);
  assert.ok(Math.max(...ventanas) <= 10, `máximo en una hora: ${Math.max(...ventanas)}`);
  assert.ok(e.logs.some(([, t]) => t.includes('Tope')));
});

test('si el receptor no responde no se pierde nada y no se para la lectura', async () => {
  const e = entorno();
  let b;
  let intentos = 0;
  e.enviar = async () => {
    if (++intentos >= 3) b.detener();
    throw new Error('sin receptor');
  };
  b = crearBucle(e, config());
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
  b = crearBucle(e, config());
  await b.ejecutar();
  assert.equal(b.estado().sinEnviar, 0);
  assert.ok(e.logs.some(([n, t]) => n === 'error' && t.includes('descartado')));
  assert.ok(intentos >= 4); // los envíos siguientes al descartado sí se hicieron
});

test('avisa de los territorios que el receptor rechaza dentro de un envío aceptado', async () => {
  const e = entorno();
  let b;
  e.enviar = async () => {
    b.detener();
    return { ok: true, rechazadas: { '08': 'motivo' } };
  };
  b = crearBucle(e, config());
  await b.ejecutar();
  assert.ok(e.logs.some(([n, t]) => n === 'aviso' && t.includes('08')));
});

test('lo que se envía lleva hora, convocatoria y respuestas tal cual', async () => {
  const e = entorno();
  await correr(e, 1);
  const c = e.envios[0];
  assert.match(c.capturadoEn, /^\d{4}-\d\d-\d\dT/);
  assert.deepEqual(c.convocatoria, { tipo: 2, id: '202307' });
  assert.equal(c.respuestas.nacional.resumen.estado, 200);
});
