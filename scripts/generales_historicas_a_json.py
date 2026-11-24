#!/usr/bin/env python3
"""Genera, a partir de los ficheros de datos abiertos de Infoelectoral, los resultados oficiales por circunscripción de
las tres últimas elecciones generales para el histórico de la web:

  data/historico/generales-2019-04.json   28 de abril de 2019
  data/historico/generales-2019-11.json   10 de noviembre de 2019
  data/historico/generales-2023-07.json   23 de julio de 2023

Entradas (se descargan a mano con un navegador, ver data/README.md):
  Elecciones-Congreso.xlsx               Censo, votos y escaños de todas las generales, por provincia
  Elecciones-Congreso-cargos-electos.xlsx  Diputados electos (se usa para obtener las siglas exactas)

Los resultados provinciales ya incluyen el voto exterior (CERA): son los del escrutinio general definitivo.

Uso:  python3 -I scripts/generales_historicas_a_json.py RUTA/Elecciones-Congreso.xlsx RUTA/Elecciones-Congreso-cargos-electos.xlsx
Requiere openpyxl. Los XLSX son datos externos: solo se leen, nunca se ejecutan.
Fuente de los datos: Ministerio del Interior, Infoelectoral (reutilización autorizada citando el origen).
"""
import collections
import datetime
import json
import pathlib
import re
import sys

import openpyxl

RAIZ = pathlib.Path(__file__).resolve().parent.parent
SALIDA = RAIZ / "data" / "historico"
FUENTE = (
    "Ministerio del Interior, Infoelectoral: datos abiertos, Congreso de los Diputados, resultados por provincia "
    "(https://infoelectoral.interior.gob.es/es/elecciones-celebradas/area-de-descargas/). "
    "Reutilización autorizada citando el origen."
)

ELECCIONES = {
    "2019-04": datetime.date(2019, 4, 28),
    "2019-11": datetime.date(2019, 11, 10),
    "2023-07": datetime.date(2023, 7, 23),
}
PRIMERA_PROVINCIA, N_PROVINCIAS = 4, 52  # columnas 4..55 de la hoja; la 56 es el total nacional


def filas(ruta):
    wb = openpyxl.load_workbook(ruta, read_only=True, data_only=True)
    return list(wb.worksheets[0].iter_rows(values_only=True))


def entero(valor):
    return int(valor or 0)


def siglas_de(encabezado, conocidas):
    """«NOMBRE - SIGLAS»: tanto el nombre como las siglas pueden llevar « - », así que primero se busca entre las
    candidaturas con escaño (cuyas siglas da el fichero de electos) y, si no, se corta por el último « - »."""
    for siglas, nombre in conocidas.items():
        if encabezado == f"{nombre} - {siglas}":
            return siglas, nombre
    if " - " in encabezado:
        nombre, siglas = encabezado.rsplit(" - ", 1)
        return siglas.strip(), nombre.strip()
    return encabezado.strip(), encabezado.strip()


def main(ruta_resultados, ruta_electos):
    F = filas(ruta_resultados)
    E = filas(ruta_electos)
    cab = F[3]
    provincias = []
    for j in range(PRIMERA_PROVINCIA, PRIMERA_PROVINCIA + N_PROVINCIAS):
        codigo, nombre = str(cab[j]).split(" - ", 1)
        provincias.append((f"{int(codigo):02d}", nombre.strip()))
    if cab[PRIMERA_PROVINCIA + N_PROVINCIAS] != "Total Escaños Nacional":
        raise SystemExit("Formato inesperado: falta la columna «Total Escaños Nacional»")

    SALIDA.mkdir(parents=True, exist_ok=True)
    for clave, fecha in ELECCIONES.items():
        mias = {}
        for r in F[4:]:
            if r[0] and r[0].date() == fecha and r[3] not in mias:
                mias[r[3]] = r  # Electores, Votantes, Votos válidos...: una sola fila cada uno
        if not mias:
            raise SystemExit(f"No hay datos de {fecha} en {ruta_resultados}")

        # Electos: (provincia, siglas) -> diputados, y siglas -> nombre de la candidatura.
        electos = collections.Counter()
        conocidas = {}
        for r in E[4:]:
            if r[0] and r[0].date() == fecha:
                electos[(f"{int(r[3]):02d}", str(r[7]).strip())] += 1
                conocidas.setdefault(str(r[7]).strip(), str(r[6]).strip())

        # Un mismo encabezado puede salir en varias filas (en 2023, Frente Obrero, Caminando Juntos y PCTE, cada una
        # con sus provincias): se suman, no se sobrescriben.
        votos_h, escanos_h = collections.defaultdict(list), collections.defaultdict(list)
        for r in F[4:]:
            if not (r[0] and r[0].date() == fecha):
                continue
            m = re.match(r"^(Votos|Escaños) \((.*)\)$", str(r[3]), re.S)
            if m:
                (votos_h if m.group(1) == "Votos" else escanos_h)[m.group(2)].append(r)
        if set(votos_h) != set(escanos_h):
            raise SystemExit(f"{clave}: candidaturas con votos y con escaños no coinciden")

        nombres = {}
        circunscripciones = []
        for i, (codigo, nombre) in enumerate(provincias):
            j = PRIMERA_PROVINCIA + i
            cands = collections.OrderedDict()  # siglas -> [votos, escanos]
            for h, rv in votos_h.items():
                v, e = sum(entero(x[j]) for x in rv), sum(entero(x[j]) for x in escanos_h[h])
                if v == 0 and e == 0:
                    continue
                siglas, nom = siglas_de(h, conocidas)
                nombres.setdefault(siglas, nom)
                previo = cands.setdefault(siglas, [0, 0])
                previo[0] += v
                previo[1] += e
            blancos = entero(mias["Votos en blanco"][j])
            a_cands = entero(mias["Votos a candidaturas"][j])
            if sum(v for v, _ in cands.values()) != a_cands:
                raise SystemExit(f"{clave} {nombre}: la suma de votos por candidatura no es «Votos a candidaturas»")
            if entero(mias["Votos válidos"][j]) != a_cands + blancos:
                raise SystemExit(f"{clave} {nombre}: votos válidos ≠ candidaturas + blancos")
            for siglas, (v, e) in cands.items():
                if e != electos[(codigo, siglas)]:
                    raise SystemExit(f"{clave} {nombre} {siglas}: {e} escaños en resultados y {electos[(codigo, siglas)]} electos")
            escanos = sum(e for _, e in cands.values())
            if escanos != sum(n for (c, _), n in electos.items() if c == codigo):
                raise SystemExit(f"{clave} {nombre}: escaños ≠ diputados electos")
            circunscripciones.append(
                {
                    "codigo": codigo,
                    "nombre": nombre,
                    "escanos": escanos,
                    "electores": entero(mias["Electores"][j]),
                    "votantes": entero(mias["Votantes"][j]),
                    "nulos": entero(mias["Votos nulos"][j]),
                    "blancos": blancos,
                    # Solo las candidaturas con votos, de más a menos: [siglas, votos, escaños]
                    "candidaturas": [
                        [s, v, e] for s, (v, e) in sorted(cands.items(), key=lambda kv: (-kv[1][0], kv[0]))
                    ],
                }
            )

        total = sum(c["escanos"] for c in circunscripciones)
        oficial = sum(entero(x[PRIMERA_PROVINCIA + N_PROVINCIAS]) for filas_h in escanos_h.values() for x in filas_h)
        if total != oficial or total != 350:
            raise SystemExit(f"{clave}: {total} escaños (columna de total nacional: {oficial}); se esperaban 350")

        salida = {
            "_fuente": FUENTE,
            "_nota": (
                "Resultados definitivos por provincia, con el voto exterior (CERA) incluido. candidaturas = "
                "[siglas, votos, escaños] de las que tuvieron votos. Las candidaturas con las mismas siglas en una "
                "provincia (con nombres en otra lengua) se suman."
            ),
            "fecha": fecha.isoformat(),
            "nombres": dict(sorted(nombres.items())),
            "circunscripciones": circunscripciones,
        }
        destino = SALIDA / f"generales-{clave}.json"
        destino.write_text(json.dumps(salida, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
        print(f"{destino.relative_to(RAIZ)}: {total} escaños, {len(nombres)} siglas, {destino.stat().st_size // 1024} KB")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    main(sys.argv[1], sys.argv[2])
