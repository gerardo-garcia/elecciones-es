#!/usr/bin/env python3
"""Convierte una captura de la API de Infoelectoral (scripts/infoelectoral/captura.js) en un escrutinio listo para el
motor: por circunscripción, censo, votos en blanco y votos y escaños de cada candidatura.

  python3 -I scripts/infoelectoral_a_escrutinio.py CAPTURA.json SALIDA.json [--definitivo]

La captura es un dato externo: solo se lee, nunca se ejecuta. Si algo no cuadra (respuesta con error, provincia que no
es la pedida, votos negativos, circunscripciones repetidas o desconocidas), el script termina con error y no escribe.

Sin `--definitivo`, `censoEscrutado` queda a null: la API no dice qué parte del censo ya se ha escrutado. La web lo
estima con la participación al cierre de los colegios de la propia elección (`votantesCierre` y `censoMesas`, que salen
del resumen); si no están, no hay datos. Con `--definitivo` (resultados finales) es igual al censo.

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


def porcentaje(texto):
    """'74,15' -> 74.15 (la API da los porcentajes como texto con coma decimal)."""
    try:
        return float(str(texto).replace(",", "."))
    except ValueError:
        return None


def cierre(resumen):
    """Participación al cierre de los colegios (votantesCierre): sus votantes y el censo de las mesas que se deduce.

    La API da `votantesCierre` como número y como porcentaje del censo SIN voto exterior; de los dos sale ese censo
    (sin CERA), que no aparece en ningún otro campo. Devuelve (votantes, censo_mesas), con None si falta o no se puede
    deducir: así la web dirá que no hay datos en vez de inventarlos.
    """
    v = resumen.get("votantesCierre") or {}
    try:
        votantes = entero(v["numero"])
    except (KeyError, ErrorCaptura):
        return None, None
    pct = porcentaje(v.get("porcentaje"))
    if votantes <= 0 or not pct or pct <= 0:
        return (votantes or None), None
    return votantes, round(votantes * 100 / pct)


def cuerpo(respuesta, donde):
    if respuesta.get("estado") != 200:
        raise ErrorCaptura(f"{donde}: la API respondió {respuesta.get('estado')}")
    texto = respuesta.get("cuerpo", "")
    if texto.lstrip().startswith("<"):
        raise ErrorCaptura(f"{donde}: la respuesta es una página HTML (¿bloqueo de la protección del sitio?), no JSON")
    try:
        datos = json.loads(texto)
    except json.JSONDecodeError:
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
        # La API da el código sin cero a la izquierda para las provincias de 01 a 09 ("8" y no "08").
        if pedida is None or str(pedida).zfill(2) != codigo:
            raise ErrorCaptura(f"{codigo}: la API devolvió la provincia {pedida!r}")
        censo = entero(resumen["totalCenso"]["numero"])
        votantes_cierre, censo_mesas = cierre(resumen)
        circunscripciones.append(
            {
                "codigo": codigo,
                "actualizadoEn": captura.get("actualizados", {}).get(codigo, captura["capturadoEn"]),
                "nombre": conocidas[codigo],
                "censo": censo,
                "censoEscrutado": censo if definitivo else None,
                "censoMesas": censo_mesas,
                "votantesCierre": votantes_cierre,
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
        if "estadisticas" in respuestas["nacional"]:
            est = cuerpo(respuestas["nacional"]["estadisticas"], "nacional estadisticas")
            nacional["candidaturas"] = candidaturas(est, "nacional estadisticas")
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
