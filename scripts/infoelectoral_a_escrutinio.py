#!/usr/bin/env python3
"""Convierte una captura de la API de Infoelectoral (scripts/infoelectoral/captura.js) en un escrutinio listo para el
motor: por circunscripción, censo, votos en blanco y votos y escaños de cada candidatura.

  python3 -I scripts/infoelectoral_a_escrutinio.py CAPTURA.json SALIDA.json [--definitivo]

La captura es un dato externo: solo se lee, nunca se ejecuta. Si algo no cuadra (respuesta con error, provincia que no
es la pedida, votos negativos, circunscripciones repetidas o desconocidas), el script termina con error y no escribe.

Sin `--definitivo`, `censoEscrutado` queda a null: la API no dice qué parte del censo ya se ha escrutado y hay que
averiguarlo la noche del 29N. Con `--definitivo` (resultados finales) es igual al censo.

Fuente de los datos: Ministerio del Interior, Infoelectoral (reutilización autorizada citando el origen).
"""
import json
import pathlib
import sys

RAIZ = pathlib.Path(__file__).resolve().parent.parent
CIRCUNSCRIPCIONES = RAIZ / "data" / "config" / "circunscripciones.json"
FUENTE = "Origen de los datos: Ministerio del Interior (Infoelectoral)"


class ErrorCaptura(Exception):
    pass


def entero(texto):
    """'8.160.837' -> 8160837 (la API da los votos como texto con puntos de miles)."""
    try:
        n = int(str(texto).replace(".", ""))
    except ValueError:
        raise ErrorCaptura(f"Número no válido: {texto!r}")
    if n < 0:
        raise ErrorCaptura(f"Número negativo: {texto!r}")
    return n


def cuerpo(respuesta, donde):
    if respuesta.get("estado") != 200:
        raise ErrorCaptura(f"{donde}: la API respondió {respuesta.get('estado')}")
    try:
        datos = json.loads(respuesta["cuerpo"])
    except (KeyError, json.JSONDecodeError):
        raise ErrorCaptura(f"{donde}: la respuesta no es JSON")
    if datos.get("cod") != "200" or "data" not in datos:
        raise ErrorCaptura(f"{donde}: respuesta sin datos ({datos.get('cod')})")
    return datos["data"]


def candidaturas(datos, donde):
    salida = []
    vistas = set()
    for c in datos.get("candidaturas") or []:
        siglas = c["partido"]["acronimo"]
        if siglas in vistas:
            raise ErrorCaptura(f"{donde}: candidatura repetida ({siglas})")
        vistas.add(siglas)
        salida.append(
            {
                "siglas": siglas,
                "votos": entero(c["votos"]),
                "escanos": entero(c["apoderados"]["numeroApoderados"]),
            }
        )
    return salida


def convertir(captura, definitivo=False):
    if captura.get("version") != 1:
        raise ErrorCaptura("Versión de captura desconocida")
    conocidas = {c["codigo"]: c["nombre"] for c in json.loads(CIRCUNSCRIPCIONES.read_text())["circunscripciones"]}
    respuestas = captura["respuestas"]
    circunscripciones = []
    for codigo, r in respuestas.items():
        if codigo == "nacional":
            continue
        if codigo not in conocidas:
            raise ErrorCaptura(f"Circunscripción desconocida: {codigo}")
        resumen = cuerpo(r["resumen"], f"{codigo} resumen")["resumen"]
        est = cuerpo(r["estadisticas"], f"{codigo} estadisticas")
        pedida = (est.get("provincia") or {}).get("cod")
        if pedida != codigo:
            raise ErrorCaptura(f"{codigo}: la API devolvió la provincia {pedida!r}")
        censo = entero(resumen["totalCenso"]["numero"])
        circunscripciones.append(
            {
                "codigo": codigo,
                "nombre": conocidas[codigo],
                "censo": censo,
                "censoEscrutado": censo if definitivo else None,
                "votantes": entero(resumen["votantes"]["numero"]),
                "nulos": entero(resumen["votosNulos"]["numero"]),
                "blancos": entero(resumen["votosBlanco"]["numero"]),
                "mesas": entero(resumen["numeroMesas"]["numero"]),
                "candidaturas": candidaturas(est, f"{codigo} estadisticas"),
            }
        )
    circunscripciones.sort(key=lambda c: c["codigo"])
    nacional = None
    if "nacional" in respuestas:
        r = cuerpo(respuestas["nacional"]["resumen"], "nacional resumen")["resumen"]
        nacional = {
            "censo": entero(r["totalCenso"]["numero"]),
            "votantes": entero(r["votantes"]["numero"]),
            "nulos": entero(r["votosNulos"]["numero"]),
            "blancos": entero(r["votosBlanco"]["numero"]),
            "mesas": entero(r["numeroMesas"]["numero"]),
            "avances": {
                "primero": entero(r["votantesAv1"]["numero"]),
                "segundo": entero(r["votantesAv2"]["numero"]),
                "cierre": entero(r["votantesCierre"]["numero"]),
            },
        }
        suma = sum(c["censo"] for c in circunscripciones)
        if len(circunscripciones) == len(conocidas) and suma != nacional["censo"]:
            raise ErrorCaptura(f"El censo nacional ({nacional['censo']}) no es la suma de las provincias ({suma})")
    return {
        "version": 1,
        "fuente": FUENTE,
        "capturadoEn": captura["capturadoEn"],
        "convocatoria": captura["convocatoria"],
        "definitivo": definitivo,
        "completa": len(circunscripciones) == len(conocidas),
        "nacional": nacional,
        "circunscripciones": circunscripciones,
    }


def main(argv):
    args = [a for a in argv if not a.startswith("--")]
    if len(args) != 2:
        print(__doc__)
        return 2
    captura = json.loads(pathlib.Path(args[0]).read_text())
    try:
        salida = convertir(captura, definitivo="--definitivo" in argv)
    except (ErrorCaptura, KeyError, TypeError) as e:
        print(f"ERROR: {e!r}", file=sys.stderr)
        return 1
    pathlib.Path(args[1]).write_text(json.dumps(salida, ensure_ascii=False, indent=1) + "\n")
    print(f"{len(salida['circunscripciones'])} circunscripciones, capturado {salida['capturadoEn']}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
