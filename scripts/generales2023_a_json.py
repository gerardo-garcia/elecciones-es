#!/usr/bin/env python3
"""Genera, a partir de los ficheros oficiales de Infoelectoral de las elecciones generales de julio de 2023:

  - packages/engine/test/fixtures/generales-2023.json  (contraste del motor: votos y escaños oficiales)
  - data/config/cera-2023.json                         (peso del voto exterior CERA por circunscripción)

Entradas (se descargan a mano con un navegador, ver data/README.md):
  PROV_02_202307_1.xlsx  Resultados por circunscripción (incluye CERA)
  02_202307_1.xlsx       Resultados por municipio (solo voto residente, CER)

El voto CERA de cada circunscripción no se publica por separado: se obtiene como
    CERA = total de la circunscripción - suma de sus municipios.

Uso:  python3 -I scripts/generales2023_a_json.py RUTA/PROV_02_202307_1.xlsx RUTA/02_202307_1.xlsx
Requiere openpyxl. Los XLSX son datos externos: solo se leen, nunca se ejecutan.
Fuente de los datos: Ministerio del Interior, Infoelectoral (reutilización autorizada citando el origen).
"""
import json
import pathlib
import sys

import openpyxl

RAIZ = pathlib.Path(__file__).resolve().parent.parent
FUENTE = (
    "Ministerio del Interior, Infoelectoral: Congreso, julio 2023, resultados por circunscripción y por municipio "
    "(https://infoelectoral.interior.gob.es/es/elecciones-celebradas/area-de-descargas/). "
    "Reutilización autorizada citando el origen."
)


def filas(ruta):
    wb = openpyxl.load_workbook(ruta, read_only=True, data_only=True)
    return list(wb.worksheets[0].iter_rows(values_only=True))


def entero(valor):
    return int(valor or 0)


def main(ruta_prov, ruta_muni):
    P, M = filas(ruta_prov), filas(ruta_muni)

    # Cabecera de PROV: fila 4 = nombre del partido, fila 5 = siglas; columnas 15+ alternan Votos / Diputados.
    columnas = {}
    for j in range(15, len(P[5]), 2):
        columnas[j] = (P[3][j], P[4][j])
    siglas = [s for _, s in columnas.values()]
    if len(set(siglas)) != len(siglas):
        raise SystemExit("Siglas repetidas en el fichero: no se pueden usar como identificador")
    por_nombre = {nombre: s for nombre, s in columnas.values()}

    # MUNI: suma por provincia del voto residente (CER).
    nombres_muni = {j: M[4][j] for j in range(13, len(M[5])) if M[4][j]}
    cer = {}
    for r in M[6:]:
        if r[1] is None:
            continue
        d = cer.setdefault(int(r[1]), {"censo": 0, "votantes": 0, "blancos": 0, "votos": {}})
        d["censo"] += entero(r[7])
        d["votantes"] += entero(r[8])
        d["blancos"] += entero(r[11])
        for j, nombre in nombres_muni.items():
            s = por_nombre[nombre]
            d["votos"][s] = d["votos"].get(s, 0) + entero(r[j])

    circunscripciones = []
    cera_config = {}
    for r in P[6:]:
        if r[1] is None:
            continue
        cod = int(r[1])
        d = cer[cod]
        total = {columnas[j][1]: entero(r[j]) for j in columnas}
        oficial = {columnas[j][1]: entero(r[j + 1]) for j in columnas}
        cera_votos = {s: total[s] - d["votos"].get(s, 0) for s in total}
        if min(cera_votos.values()) < 0:
            raise SystemExit(f"Voto CERA negativo en la circunscripción {cod}: datos incoherentes")
        cera_blancos = entero(r[13]) - d["blancos"]
        if cera_blancos < 0:
            raise SystemExit(f"Blancos CERA negativos en la circunscripción {cod}")
        codigo = f"{cod:02d}"
        circunscripciones.append(
            {
                "codigo": codigo,
                "nombre": r[2],
                "escanos": sum(oficial.values()),
                "censoCER": entero(r[5]),
                "cer": {
                    "blancos": d["blancos"],
                    "votos": {s: v for s, v in d["votos"].items() if v},
                },
                "cera": {
                    "blancos": cera_blancos,
                    "votos": {s: v for s, v in cera_votos.items() if v},
                },
                "escanosOficiales": {s: n for s, n in oficial.items() if n},
            }
        )
        cera_config[codigo] = {
            "censoCera": entero(r[6]),
            "votantesCera": entero(r[9]),
            "votosValidosCera": sum(cera_votos.values()) + cera_blancos,
        }

    if len(circunscripciones) != 52:
        raise SystemExit(f"Se esperaban 52 circunscripciones y hay {len(circunscripciones)}")
    if sum(c["escanos"] for c in circunscripciones) != 350:
        raise SystemExit("Los escaños oficiales no suman 350")

    ruta_fixture = RAIZ / "packages/engine/test/fixtures/generales-2023.json"
    ruta_fixture.parent.mkdir(parents=True, exist_ok=True)
    ruta_fixture.write_text(
        json.dumps(
            {
                "_fuente": FUENTE,
                "_nota": "cer = voto residente (suma de municipios); cera = total de la circunscripción - cer. "
                "Solo se guardan candidaturas con votos. escanosOficiales = diputados oficiales por candidatura.",
                "circunscripciones": circunscripciones,
            },
            ensure_ascii=False,
            separators=(",", ":"),
        )
        + "\n",
        encoding="utf-8",
    )

    ruta_cera = RAIZ / "data/config/cera-2023.json"
    ruta_cera.write_text(
        json.dumps(
            {
                "_fuente": FUENTE,
                "_nota": "Peso del voto exterior (CERA) en 2023 por circunscripción: censo CERA, votantes CERA y votos válidos "
                "CERA (candidaturas + blancos). Se usa para estimar cuántos votos CERA llegarán en 2026.",
                "circunscripciones": cera_config,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(f"OK: {ruta_fixture.relative_to(RAIZ)} ({ruta_fixture.stat().st_size // 1024} KB) y {ruta_cera.relative_to(RAIZ)}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    main(sys.argv[1], sys.argv[2])
