"""Pruebas del receptor local (servidor real en 127.0.0.1, puerto libre, carpeta temporal)."""
import json
import pathlib
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request

AQUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parent / "infoelectoral"))
import receptor  # noqa: E402

FIXTURE = json.loads((AQUI / "fixtures" / "infoelectoral-2023-parcial.json").read_text())
ORIGEN = receptor.ORIGEN


def carga(respuestas, hora="2026-11-29T21:00:00.000Z"):
    return {"capturadoEn": hora, "convocatoria": {"tipo": 2, "id": "202307"}, "respuestas": respuestas}


class Receptor(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.salida = pathlib.Path(self.tmp.name)
        self.servidor, self.estado = receptor.crear_servidor(self.salida, puerto=0, definitivo=True)
        self.puerto = self.servidor.server_address[1]
        threading.Thread(target=self.servidor.serve_forever, daemon=True).start()

    def tearDown(self):
        self.servidor.shutdown()
        self.servidor.server_close()
        self.tmp.cleanup()

    def enviar(self, cuerpo, origen=ORIGEN, ruta="/captura", metodo="POST"):
        datos = cuerpo if isinstance(cuerpo, bytes) else json.dumps(cuerpo).encode()
        cabeceras = {"Content-Type": "application/json"}
        if origen:
            cabeceras["Origin"] = origen
        req = urllib.request.Request(f"http://127.0.0.1:{self.puerto}{ruta}", data=datos, headers=cabeceras, method=metodo)
        try:
            with urllib.request.urlopen(req) as r:
                return r.status, json.loads(r.read() or b"null"), dict(r.headers)
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read() or b"null"), dict(e.headers)

    def test_acepta_una_lectura_valida_y_guarda_todo(self):
        codigo, cuerpo, cabeceras = self.enviar(carga(FIXTURE["respuestas"]))
        self.assertEqual((codigo, cuerpo["ok"], cuerpo["circunscripciones"]), (200, True, 1))
        self.assertEqual(cabeceras["Access-Control-Allow-Origin"], ORIGEN)
        escrutinio = json.loads((self.salida / "escrutinio.json").read_text())
        self.assertEqual(escrutinio["circunscripciones"][0]["codigo"], "28")
        self.assertEqual(escrutinio["circunscripciones"][0]["actualizadoEn"], "2026-11-29T21:00:00.000Z")
        self.assertEqual(len(list((self.salida / "crudos").glob("*.json"))), 1)
        serie = (self.salida / "serie.jsonl").read_text().splitlines()
        self.assertEqual(len(serie), 1)
        self.assertEqual(json.loads(serie[0])["candidaturas"][0]["siglas"], "PP")

    def test_junta_las_dos_partes_de_una_provincia_enviadas_por_separado(self):
        r = FIXTURE["respuestas"]["28"]
        self.assertEqual(self.enviar(carga({"28": {"resumen": r["resumen"]}}))[1]["circunscripciones"], 0)
        self.assertFalse((self.salida / "serie.jsonl").exists())
        _, cuerpo, _ = self.enviar(carga({"28": {"estadisticas": r["estadisticas"]}}, "2026-11-29T21:02:00.000Z"))
        self.assertEqual(cuerpo["circunscripciones"], 1)
        c = json.loads((self.salida / "escrutinio.json").read_text())["circunscripciones"][0]
        self.assertEqual(c["actualizadoEn"], "2026-11-29T21:02:00.000Z")  # la hora de lo más reciente

    def test_la_serie_crece_con_cada_lectura_nacional(self):
        self.enviar(carga({"nacional": FIXTURE["respuestas"]["nacional"]}, "2026-11-29T21:00:00.000Z"))
        self.enviar(carga({"nacional": FIXTURE["respuestas"]["nacional"]}, "2026-11-29T21:02:00.000Z"))
        self.assertEqual(len((self.salida / "serie.jsonl").read_text().splitlines()), 2)

    def test_el_registro_del_bucle_va_a_registro_log_en_una_linea(self):
        self.assertEqual(self.enviar("aviso uno\ndos".encode(), ruta="/registro")[0], 200)
        self.assertEqual(self.enviar(b"x", origen="https://otra.web", ruta="/registro")[0], 403)
        self.assertEqual(self.enviar(b"x" * 5000, ruta="/registro")[0], 413)
        lineas = (self.salida / "registro.log").read_text().splitlines()
        self.assertEqual(len(lineas), 1)
        self.assertTrue(lineas[0].endswith(" aviso uno dos"))

    def test_rechaza_otro_origen(self):
        self.assertEqual(self.enviar(carga(FIXTURE["respuestas"]), origen="https://otra.web")[0], 403)
        self.assertEqual(self.enviar(carga(FIXTURE["respuestas"]), origen=None)[0], 403)
        self.assertFalse((self.salida / "escrutinio.json").exists())

    def test_la_peticion_previa_de_cors_solo_vale_para_infoelectoral(self):
        codigo, _, cab = self.enviar(b"", metodo="OPTIONS")
        self.assertEqual((codigo, cab["Access-Control-Allow-Origin"]), (204, ORIGEN))
        self.assertEqual(self.enviar(b"", origen="https://otra.web", metodo="OPTIONS")[0], 403)

    def test_rechaza_una_pagina_de_bloqueo_sin_tocar_lo_guardado(self):
        self.enviar(carga(FIXTURE["respuestas"]))
        antes = (self.salida / "escrutinio.json").read_text()
        malo = {"28": {"estadisticas": {"estado": 200, "cuerpo": "<html>Security Policy Violation</html>"}}}
        codigo, cuerpo, _ = self.enviar(carga(malo, "2026-11-29T21:04:00.000Z"))
        self.assertEqual(codigo, 422)
        self.assertIn("bloqueo", cuerpo["error"])
        self.assertEqual((self.salida / "escrutinio.json").read_text(), antes)
        self.assertEqual(len(list((self.salida / "rechazados").glob("*.json"))), 1)
        # y el estado interno sigue siendo el bueno: una lectura válida posterior funciona
        self.assertEqual(self.enviar(carga(FIXTURE["respuestas"], "2026-11-29T21:06:00.000Z"))[0], 200)

    def test_un_territorio_malo_no_impide_aceptar_los_demas_del_mismo_envio(self):
        r = FIXTURE["respuestas"]
        malo = {"estadisticas": {"estado": 200, "cuerpo": "<html>Security Policy Violation</html>"}, "resumen": r["28"]["resumen"]}
        codigo, cuerpo, _ = self.enviar(carga({"nacional": r["nacional"], "28": r["28"], "29": malo}))
        self.assertEqual(codigo, 200)
        self.assertEqual(cuerpo["circunscripciones"], 1)
        self.assertEqual(list(cuerpo["rechazadas"]), ["29"])
        self.assertTrue((self.salida / "rechazados").glob("*.json"))

    def test_si_se_rechaza_todo_responde_422(self):
        malo = {"29": {"estadisticas": {"estado": 200, "cuerpo": "<html>x</html>"}}}
        self.assertEqual(self.enviar(carga(malo))[0], 422)

    def test_rechaza_basura(self):
        self.assertEqual(self.enviar(b"esto no es json")[0], 422)
        self.assertEqual(self.enviar({"hola": 1})[0], 422)
        self.assertEqual(self.enviar(carga({"28": {"otra": {"estado": 200, "cuerpo": "{}"}}}))[0], 422)

    def test_rechaza_tamano_excesivo(self):
        req = urllib.request.Request(
            f"http://127.0.0.1:{self.puerto}/captura", data=b"x", headers={"Origin": ORIGEN, "Content-Length": "99999999"}, method="POST"
        )
        with self.assertRaises((urllib.error.HTTPError, ConnectionError, OSError)):
            urllib.request.urlopen(req)

    def test_escucha_solo_en_local(self):
        self.assertEqual(self.servidor.server_address[0], "127.0.0.1")


if __name__ == "__main__":
    unittest.main()
