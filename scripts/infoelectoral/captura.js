/**
 * Captura de Infoelectoral para pegar en la consola (F12) de una pestaña de https://infoelectoral.interior.gob.es/
 * Hace las mismas peticiones de solo lectura que el visor de resultados (misma API y la misma credencial pública que va
 * en el JS de la página) y descarga un fichero con las respuestas tal cual. Lo ejecuta tu navegador normal: no se
 * automatiza ningún navegador ni se esquiva la protección del sitio.
 *
 * Cambia TIPO e ID para otras elecciones (2 = Congreso; ID = AAAAMM: 202307 = julio de 2023).
 * Fuente de los datos: Ministerio del Interior, Infoelectoral (reutilización autorizada citando el origen).
 */
(async () => {
  const TIPO = 2;
  const ID = '202307';
  const PAUSA_MS = 600;
  // Provincia (código INE) -> código de comunidad que usa la API de Infoelectoral (orden de su visor; si una
  // petición falla, el estado queda en el fichero y el conversor lo avisa).
  const CCAA = {
    1: ['04', '11', '14', '18', '21', '23', '29', '41'], 2: ['22', '44', '50'], 3: ['33'], 4: ['07'], 5: ['35', '38'],
    6: ['39'], 7: ['02', '13', '16', '19', '45'], 8: ['05', '09', '24', '34', '37', '40', '42', '47', '49'],
    9: ['08', '17', '25', '43'], 10: ['06', '10'], 11: ['15', '27', '32', '36'], 12: ['28'], 13: ['30'], 14: ['31'],
    15: ['01', '20', '48'], 16: ['26'], 17: ['03', '12', '46'], 18: ['51'], 19: ['52'],
  };
  const base = 'https://infoelectoral.interior.gob.es/min/';
  const cabeceras = { Authorization: 'Basic ' + btoa('apiInfoelectoral:apiInfoelectoralPro') };
  const q = `tipoConvocatoria=${TIPO}&idConvocatoria=${ID}`;
  const pedir = async (ruta) => {
    const r = await fetch(base + ruta, { headers: cabeceras });
    return { estado: r.status, cuerpo: await r.text() };
  };
  const territorios = [{ clave: 'nacional', filtro: '' }];
  for (const [ccaa, provincias] of Object.entries(CCAA)) {
    for (const p of provincias) territorios.push({ clave: p, filtro: `&codCCAA=${ccaa}&codProvincia=${p}` });
  }
  const respuestas = {};
  const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
  let bloqueada = null;
  // Una petición cada vez y con pausa: más de eso activa la protección del sitio («Security Policy Violation»).
  // Si llega un bloqueo, se para: insistir solo empeora las cosas.
  for (const { clave, filtro } of territorios) {
    const resumen = await pedir(`resumen?${q}${filtro}`);
    await pausa(PAUSA_MS);
    const estadisticas = await pedir(`estadisticas?${q}${filtro}`);
    await pausa(PAUSA_MS);
    respuestas[clave] = { resumen, estadisticas };
    if ([resumen, estadisticas].some((r) => r.estado !== 200 || r.cuerpo.trimStart().startsWith('<'))) {
      bloqueada = clave;
      break;
    }
  }
  const captura = { version: 1, capturadoEn: new Date().toISOString(), convocatoria: { tipo: TIPO, id: ID }, respuestas };
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(captura)], { type: 'application/json' }));
  a.download = `infoelectoral-${ID}-${captura.capturadoEn.replace(/[:.]/g, '-')}.json`;
  a.click();
  console.log(bloqueada === null ? `Hecho: ${territorios.length} territorios` : `PARADO en ${bloqueada}: respuesta de error o bloqueo. Captura parcial descargada.`);
})();
