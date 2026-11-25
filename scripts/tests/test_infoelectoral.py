"""Pruebas del conversor de capturas de Infoelectoral. Se ejecutan con:  python3 -I -m unittest discover -s scripts/tests"""
import copy
import json
import pathlib
import sys
import unittest

AQUI = pathlib.Path(__file__).resolve().parent
RAIZ = AQUI.parent.parent
sys.path.insert(0, str(RAIZ / "scripts"))
import infoelectoral_a_escrutinio as conv  # noqa: E402

CAPTURA = json.loads((AQUI / "fixtures" / "infoelectoral-2023-parcial.json").read_text())


def oficial_madrid():
    datos = json.loads((RAIZ / "data" / "historico" / "generales-2023-07.json").read_text())
    return next(c for c in datos["circunscripciones"] if c["codigo"] == "28")


class Conversion(unittest.TestCase):
    def test_madrid_coincide_con_el_oficial_del_historico(self):
        madrid = conv.convertir(CAPTURA, definitivo=True)["circunscripciones"][0]
        oficial = oficial_madrid()
        self.assertEqual(madrid["censo"], oficial["electores"])
        self.assertEqual(madrid["votantes"], oficial["votantes"])
        self.assertEqual(madrid["nulos"], oficial["nulos"])
        self.assertEqual(madrid["blancos"], oficial["blancos"])
        self.assertEqual(
            [(c["siglas"], c["votos"], c["escanos"]) for c in madrid["candidaturas"]],
            [tuple(c) for c in oficial["candidaturas"]],
        )

    def test_sin_definitivo_no_se_inventa_el_censo_escrutado(self):
        self.assertIsNone(conv.convertir(CAPTURA)["circunscripciones"][0]["censoEscrutado"])

    def test_definitivo_escruta_todo_el_censo(self):
        c = conv.convertir(CAPTURA, definitivo=True)["circunscripciones"][0]
        self.assertEqual(c["censoEscrutado"], c["censo"])

    def test_una_captura_de_una_provincia_no_se_da_por_completa(self):
        self.assertFalse(conv.convertir(CAPTURA)["completa"])

    def test_nacional(self):
        n = conv.convertir(CAPTURA)["nacional"]
        self.assertEqual((n["censo"], n["votantes"], n["mesas"]), (37469458, 24952447, 60314))

    def test_la_salida_cita_el_origen(self):
        self.assertIn("Ministerio del Interior", conv.convertir(CAPTURA)["fuente"])


class CodigosDeProvincia(unittest.TestCase):
    def test_la_api_da_las_provincias_de_01_a_09_sin_cero(self):
        # Barcelona: la API devuelve provincia.cod = "8", y nosotros la pedimos y la guardamos como "08".
        c = copy.deepcopy(CAPTURA)
        r = c["respuestas"].pop("28")
        est = json.loads(r["estadisticas"]["cuerpo"])
        est["data"]["provincia"]["cod"] = "8"
        r["estadisticas"]["cuerpo"] = json.dumps(est)
        c["respuestas"]["08"] = r
        self.assertEqual(conv.convertir(c)["circunscripciones"][0]["codigo"], "08")

    def test_sigue_rechazando_otra_provincia(self):
        c = copy.deepcopy(CAPTURA)
        r = c["respuestas"].pop("28")
        est = json.loads(r["estadisticas"]["cuerpo"])
        est["data"]["provincia"]["cod"] = "9"
        r["estadisticas"]["cuerpo"] = json.dumps(est)
        c["respuestas"]["08"] = r
        with self.assertRaisesRegex(conv.ErrorCaptura, "devolvió la provincia"):
            conv.convertir(c)


class Errores(unittest.TestCase):
    def modificada(self, cambia):
        c = copy.deepcopy(CAPTURA)
        cambia(c)
        return c

    def test_respuesta_con_error(self):
        c = self.modificada(lambda c: c["respuestas"]["28"]["estadisticas"].update(estado=403))
        with self.assertRaisesRegex(conv.ErrorCaptura, "403"):
            conv.convertir(c)

    def test_provincia_distinta_de_la_pedida(self):
        def cambia(c):
            c["respuestas"]["29"] = c["respuestas"].pop("28")

        with self.assertRaisesRegex(conv.ErrorCaptura, "devolvió la provincia"):
            conv.convertir(self.modificada(cambia))

    def test_circunscripcion_desconocida(self):
        def cambia(c):
            c["respuestas"]["99"] = c["respuestas"].pop("28")

        with self.assertRaisesRegex(conv.ErrorCaptura, "desconocida"):
            conv.convertir(self.modificada(cambia))

    def test_votos_negativos(self):
        def cambia(c):
            r = c["respuestas"]["28"]["estadisticas"]
            datos = json.loads(r["cuerpo"])
            datos["data"]["candidaturas"][0]["votos"] = "-5"
            r["cuerpo"] = json.dumps(datos)

        with self.assertRaisesRegex(conv.ErrorCaptura, "negativo"):
            conv.convertir(self.modificada(cambia))

    def test_candidatura_repetida(self):
        def cambia(c):
            r = c["respuestas"]["28"]["estadisticas"]
            datos = json.loads(r["cuerpo"])
            datos["data"]["candidaturas"].append(datos["data"]["candidaturas"][0])
            r["cuerpo"] = json.dumps(datos)

        with self.assertRaisesRegex(conv.ErrorCaptura, "repetida"):
            conv.convertir(self.modificada(cambia))

    def test_pagina_de_bloqueo_html(self):
        c = self.modificada(lambda c: c["respuestas"]["28"]["resumen"].update(cuerpo="<html>Just a moment...</html>"))
        with self.assertRaisesRegex(conv.ErrorCaptura, "bloqueo"):
            conv.convertir(c)

    def test_respuesta_que_no_es_json(self):
        c = self.modificada(lambda c: c["respuestas"]["28"]["resumen"].update(cuerpo="no es json"))
        with self.assertRaisesRegex(conv.ErrorCaptura, "no es JSON"):
            conv.convertir(c)


if __name__ == "__main__":
    unittest.main()
