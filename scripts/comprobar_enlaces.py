#!/usr/bin/env python3
"""Comprueba si siguen disponibles los enlaces de un registro de encuestas (data/encuestas/*.json).

Uso:  python3 -I scripts/comprobar_enlaces.py data/encuestas/encuestas-2026-11-23.json

Para cada encuesta pide con curl su `url` (la fuente) y su `urlDatos` y muestra el estado HTTP actual junto al que tenía
al guardar el registro. Solo informa: no cambia el registro. curl se usa con el agente de usuario por defecto y verifica
el certificado (no hay -k).
"""
import datetime
import json
import subprocess
import sys


def estado(url):
    if not url.startswith("https://"):
        return "URL no https"
    r = subprocess.run(
        ["curl", "-s", "-o", "/dev/null", "-L", "--max-time", "25", "-w", "%{http_code}", "--", url],
        capture_output=True, text=True,
    )
    return r.stdout.strip() or f"error curl {r.returncode}"


def main(ruta):
    with open(ruta, encoding="utf-8") as f:
        registro = json.load(f)
    print(f"Comprobación del {datetime.datetime.now().astimezone().isoformat(timespec='seconds')} "
          f"(registro guardado el {registro['comprobacion']['fecha']})\n")
    cambios = 0
    for e in registro["encuestas"]:
        print(f"{e['id']}  ({e['instituto']} / {e['encargadoPor'] or 'organismo público'}, publicada {e['publicada']})")
        for clave in ("url", "urlDatos"):
            if clave == "urlDatos" and e["urlDatos"] == e["url"]:
                continue
            ahora = estado(e[clave])
            antes = str(e["comprobacion"]["estado"])
            if clave in e.get("noConcluyente", []):
                marca = "no concluyente (el sitio bloquea a curl de forma intermitente: abrirlo en un navegador)"
            elif ahora == antes:
                marca = "igual"
            else:
                marca = f"CAMBIA (antes {antes})"
                cambios += 1
            print(f"   {clave:9} {ahora}  {marca}  {e[clave]}")
    print(f"\n{cambios} enlace(s) con estado distinto al del registro.")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    main(sys.argv[1])
