#!/usr/bin/env python3
"""Receptor local de las lecturas de Infoelectoral que envía scripts/infoelectoral/bucle.js desde el navegador.

  python3 -I scripts/infoelectoral/receptor.py [--salida DIR] [--puerto 8765] [--definitivo]

Escucha solo en 127.0.0.1 y solo acepta peticiones con el origen de Infoelectoral (así ninguna otra página abierta en el
navegador puede escribirle). Cada envío se valida con el conversor antes de aceptarse: si algo no cuadra, se rechaza
(422), no cambia nada de lo guardado y el envío queda en `rechazados/`. En DIR guarda:

  crudos/AAAA-...json   cada envío aceptado, tal cual
  rechazados/...json    cada envío rechazado, con el motivo
  escrutinio.json       el último estado combinado: lo más reciente de cada circunscripción, con su hora
  serie.jsonl           una línea por lectura nacional (hora, totales y escaños por candidatura) para la evolución
  registro.log          lo que anota el bucle cuando funciona sin nadie delante (POST /registro, texto)

Fuente de los datos: Ministerio del Interior, Infoelectoral (reutilización autorizada citando el origen).
"""
import argparse
import copy
import json
import os
import pathlib
import re
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

AQUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parent))
import infoelectoral_a_escrutinio as conv  # noqa: E402

ORIGEN = "https://infoelectoral.interior.gob.es"
MAX_BYTES = 8_000_000
MAX_REGISTRO = 2000
PARTES = ("resumen", "estadisticas")


class Rechazo(Exception):
    pass


def escribir_atomico(ruta, texto):
    tmp = ruta.with_suffix(ruta.suffix + ".tmp")
    tmp.write_text(texto)
    os.replace(tmp, ruta)


class Estado:
    def __init__(self, salida, definitivo=False):
        self.salida = pathlib.Path(salida)
        self.definitivo = definitivo
        self.candado = threading.Lock()
        self.territorios = {}
        for d in ("crudos", "rechazados"):
            (self.salida / d).mkdir(parents=True, exist_ok=True)

    def _validar_forma(self, carga):
        if not isinstance(carga, dict) or not isinstance(carga.get("capturadoEn"), str):
            raise Rechazo("Falta capturadoEn")
        if not isinstance(carga.get("convocatoria"), dict) or not isinstance(carga.get("respuestas"), dict):
            raise Rechazo("Faltan convocatoria o respuestas")
        for clave, partes in carga["respuestas"].items():
            if not isinstance(partes, dict) or not partes or not set(partes) <= set(PARTES):
                raise Rechazo(f"{clave}: partes no válidas")
            for parte in partes.values():
                if not isinstance(parte, dict) or not isinstance(parte.get("estado"), int) or not isinstance(parte.get("cuerpo"), str):
                    raise Rechazo(f"{clave}: respuesta mal formada")

    def recibir(self, carga):
        """Acepta cada territorio por separado: uno malo no impide aceptar los demás del mismo envío."""
        with self.candado:
            try:
                self._validar_forma(carga)
            except Rechazo as e:
                self._guardar("rechazados", carga, {"motivo": repr(e)})
                raise
            candidato = copy.deepcopy(self.territorios)
            aceptadas, rechazadas, salida = [], {}, None
            for clave, partes in carga["respuestas"].items():
                prueba = copy.deepcopy(candidato)
                destino = prueba.setdefault(clave, {})
                try:
                    for nombre, respuesta in partes.items():
                        conv.cuerpo(respuesta, f"{clave} {nombre}")  # cada parte se valida nada más llegar
                        destino[nombre] = respuesta
                        destino[nombre + "En"] = carga["capturadoEn"]
                    salida = self._convertir(prueba, carga)
                except (conv.ErrorCaptura, KeyError, TypeError) as e:
                    rechazadas[clave] = str(e)
                    continue
                candidato = prueba
                aceptadas.append(clave)
            if rechazadas:
                self._guardar("rechazados", carga, {"motivo": rechazadas})
            if not aceptadas:
                raise Rechazo("; ".join(rechazadas.values()))
            self.territorios = candidato
            self._guardar("crudos", carga)
            escribir_atomico(self.salida / "escrutinio.json", json.dumps(salida, ensure_ascii=False, indent=1) + "\n")
            if "nacional" in aceptadas and salida["nacional"]:
                fila = {"t": salida["capturadoEn"], "circunscripciones": len(salida["circunscripciones"]), **salida["nacional"]}
                with open(self.salida / "serie.jsonl", "a") as f:
                    f.write(json.dumps(fila, ensure_ascii=False) + "\n")
            return {"ok": True, "circunscripciones": len(salida["circunscripciones"]), "rechazadas": rechazadas}

    def _convertir(self, territorios, carga):
        """Con lo último de cada territorio que tenga las dos partes (el resumen y las estadísticas) hace el escrutinio."""
        respuestas, actualizados = {}, {}
        for clave, t in territorios.items():
            if clave == "nacional":
                if "resumen" in t:
                    respuestas[clave] = {k: t[k] for k in PARTES if k in t}
            elif all(k in t for k in PARTES):
                respuestas[clave] = {k: t[k] for k in PARTES}
                actualizados[clave] = max(t["resumenEn"], t["estadisticasEn"])
        captura = {
            "version": 1,
            "capturadoEn": carga["capturadoEn"],
            "convocatoria": carga["convocatoria"],
            "respuestas": respuestas,
            "actualizados": actualizados,
        }
        return conv.convertir(captura, definitivo=self.definitivo)

    def registrar(self, texto):
        linea = " ".join(str(texto).split())[:MAX_REGISTRO]
        marca = time.strftime("%Y-%m-%dT%H:%M:%S%z")
        with self.candado, open(self.salida / "registro.log", "a", encoding="utf-8") as f:
            f.write(f"{marca} {linea}\n")
        sys.stderr.write(f"bucle: {linea}\n")

    def _guardar(self, carpeta, carga, extra=None):
        marca = re.sub(r"[^0-9A-Za-z-]", "-", str(carga.get("capturadoEn", "sin-hora")) if isinstance(carga, dict) else "sin-hora")
        contenido = dict(carga) if isinstance(carga, dict) else {"carga": str(carga)[:1000]}
        if extra:
            contenido.update(extra)
        ruta = self.salida / carpeta / f"{marca}.json"
        n = 1
        while ruta.exists():
            n += 1
            ruta = self.salida / carpeta / f"{marca}-{n}.json"
        ruta.write_text(json.dumps(contenido, ensure_ascii=False))


def manejador(estado):
    class Manejador(BaseHTTPRequestHandler):
        def _responder(self, codigo, cuerpo=None, cors=False):
            datos = json.dumps(cuerpo).encode() if cuerpo is not None else b""
            self.send_response(codigo)
            if cors:
                self.send_header("Access-Control-Allow-Origin", ORIGEN)
                self.send_header("Vary", "Origin")
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(datos)))
            self.end_headers()
            self.wfile.write(datos)

        def _origen_valido(self):
            return self.headers.get("Origin") == ORIGEN

        def do_OPTIONS(self):
            if not self._origen_valido():
                return self._responder(403, {"ok": False, "error": "origen no permitido"})
            self.send_response(204)
            self.send_header("Access-Control-Allow-Origin", ORIGEN)
            self.send_header("Access-Control-Allow-Methods", "POST")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.send_header("Access-Control-Max-Age", "600")
            self.send_header("Content-Length", "0")
            self.end_headers()

        def do_POST(self):
            if self.path not in ("/captura", "/registro"):
                return self._responder(404, {"ok": False})
            if not self._origen_valido():
                return self._responder(403, {"ok": False, "error": "origen no permitido"})
            if self.path == "/registro":
                # Registro del bucle cuando no hay nadie delante del navegador: una línea de texto, a registro.log.
                try:
                    n = int(self.headers.get("Content-Length", ""))
                except ValueError:
                    n = 0
                if not 0 < n <= MAX_REGISTRO:
                    return self._responder(413, {"ok": False}, cors=True)
                estado.registrar(self.rfile.read(n).decode("utf-8", "replace"))
                return self._responder(200, {"ok": True}, cors=True)
            try:
                n = int(self.headers.get("Content-Length", ""))
            except ValueError:
                return self._responder(411, {"ok": False, "error": "falta Content-Length"}, cors=True)
            if not 0 < n <= MAX_BYTES:
                return self._responder(413, {"ok": False, "error": "tamaño no válido"}, cors=True)
            try:
                carga = json.loads(self.rfile.read(n))
                resultado = estado.recibir(carga)
            except (Rechazo, json.JSONDecodeError) as e:
                return self._responder(422, {"ok": False, "error": str(e)}, cors=True)
            self._responder(200, resultado, cors=True)

        def do_GET(self):
            if self.path != "/estado":
                return self._responder(404, {"ok": False})
            self._responder(200, {"ok": True, "territorios": sorted(estado.territorios)})

        def log_message(self, formato, *args):
            sys.stderr.write("%s %s\n" % (self.log_date_time_string(), formato % args))

    return Manejador


def crear_servidor(salida, puerto=8765, definitivo=False):
    estado = Estado(salida, definitivo)
    return ThreadingHTTPServer(("127.0.0.1", puerto), manejador(estado)), estado


def main(argv):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--salida", default=str(AQUI.parent.parent / ".datos-vivo"))
    ap.add_argument("--puerto", type=int, default=8765)
    ap.add_argument("--definitivo", action="store_true", help="resultados finales: censoEscrutado = censo")
    args = ap.parse_args(argv)
    servidor, _ = crear_servidor(args.salida, args.puerto, args.definitivo)
    print(f"Receptor en http://127.0.0.1:{args.puerto}  (salida: {args.salida}). Ctrl+C para parar.")
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
