#!/usr/bin/env python3
"""Abre Firefox, sin nadie delante, con el bucle de Infoelectoral cargado (scripts/infoelectoral/bucle.cjs).

  python3 -I scripts/infoelectoral/desatendido/firefox.py [--ensayo] [--inicio ISO] [--perfil DIR] [--firefox RUTA]

Es un Firefox normal, sin automatizar: no se activa WebDriver ni el control remoto, ni se oculta nada al sitio. Lo único
distinto de pegar el bucle en la consola es que lo carga una pequeña extensión propia, sin firmar. Por eso hace falta
Firefox Developer Edition, que deja instalar extensiones sin firmar (la versión normal no). Usa un perfil propio, aparte
del navegador de diario.

  - El bucle se ejecuta en las páginas de https://infoelectoral.interior.gob.es/ como si se hubiera pegado en la consola,
    con las mismas pausas (una petición cada 5 s), y envía las lecturas al receptor local (127.0.0.1:8765).
  - No pide nada antes de `--inicio` (por defecto, las 20:00 del 29N). Busca solo la convocatoria de 2026.
  - Lo que anota el bucle va también al receptor (`registro.log` en su carpeta de salida).
  - `--ensayo`: convocatoria de julio de 2023 y arranque inmediato. El receptor debe escribir en otra carpeta y no hay
    que publicar nada.

Este proceso es el de Firefox: se queda en primer plano hasta que Firefox se cierra (así lo puede vigilar systemd).
"""
import argparse
import json
import os
import pathlib
import sys
import time
import zipfile

AQUI = pathlib.Path(__file__).resolve().parent
BUCLE = AQUI.parent / "bucle.cjs"
ID_EXTENSION = "bucle-infoelectoral@elecciones-es.local"
URL = "https://infoelectoral.interior.gob.es/"
INICIO_29N = "2026-11-29T20:00:00+01:00"
FIREFOX = pathlib.Path.home() / ".local/opt/firefox-dev/firefox"
PERFIL = pathlib.Path.home() / ".local/share/elecciones-es/firefox-bucle"

PREFERENCIAS = {
    # Extensión propia sin firmar (solo lo admiten Developer Edition, Nightly y ESR) e instalada sin preguntar.
    "xpinstall.signatures.required": False,
    "extensions.autoDisableScopes": 0,
    "extensions.enabledScopes": 15,
    # Sin pantallas de bienvenida ni restaurar sesiones viejas.
    "browser.shell.checkDefaultBrowser": False,
    "browser.aboutwelcome.enabled": False,
    "browser.sessionstore.resume_from_crash": False,
    "browser.startup.page": 0,
    "datareporting.policy.dataSubmissionEnabled": False,
    "toolkit.telemetry.reportingpolicy.firstRun": False,
    "app.update.auto": False,
    # Que los temporizadores del bucle no se retrasen si la ventana queda detrás de otra.
    "dom.timeout.enable_budget_timer_throttling": False,
    # Infoelectoral tiene que poder enviar al receptor local (127.0.0.1) sin que Firefox pida permiso: no hay nadie
    # para aceptarlo. Solo en este perfil.
    "network.lna.enabled": False,
    "network.lna.blocking": False,
    # Lo que saldría en la consola va a la salida de Firefox (el registro de systemd), para poder revisarlo.
    "devtools.console.stdout.content": True,
    "browser.dom.window.dump.enabled": True,
}


def configuracion(ensayo, inicio):
    ajustes = {
        "INFOELECTORAL_REGISTRO": True,
        "INFOELECTORAL_INICIO": None if ensayo else inicio,
    }
    if ensayo:
        ajustes["INFOELECTORAL_ID"] = "202307"
    return "".join(f"globalThis.{k} = {json.dumps(v)};\n" for k, v in ajustes.items() if v is not None)


def construir_extension(destino, ensayo, inicio):
    version = time.strftime("1.%Y%m%d.%H%M%S")
    manifiesto = {
        # Versión 2: el permiso del sitio se concede al instalar (en la 3 queda opcional y nadie podría aceptarlo).
        "manifest_version": 2,
        "name": "Bucle de Infoelectoral (elecciones-es)",
        "version": version,
        "description": "Lee el escrutinio de Infoelectoral y lo envía al receptor local.",
        "browser_specific_settings": {"gecko": {"id": ID_EXTENSION, "strict_min_version": "128.0"}},
        "permissions": ["https://infoelectoral.interior.gob.es/*"],
        "content_scripts": [
            {
                "matches": ["https://infoelectoral.interior.gob.es/*"],
                "js": ["bucle.js"],
                "run_at": "document_idle",
            }
        ],
    }
    codigo = configuracion(ensayo, inicio) + BUCLE.read_text(encoding="utf-8")
    destino.parent.mkdir(parents=True, exist_ok=True)
    tmp = destino.with_suffix(".tmp")
    with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("manifest.json", json.dumps(manifiesto, ensure_ascii=False, indent=1))
        z.writestr("bucle.js", codigo)
    os.replace(tmp, destino)
    return version


def preparar_perfil(perfil, ensayo, inicio):
    perfil.mkdir(parents=True, exist_ok=True)
    lineas = [f'user_pref("{k}", {json.dumps(v)});' for k, v in PREFERENCIAS.items()]
    (perfil / "user.js").write_text("\n".join(lineas) + "\n", encoding="utf-8")
    return construir_extension(perfil / "extensions" / f"{ID_EXTENSION}.xpi", ensayo, inicio)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--ensayo", action="store_true", help="convocatoria de 2023 y arranque inmediato")
    ap.add_argument("--inicio", default=INICIO_29N, help=f"cuándo empieza a pedir datos (por defecto {INICIO_29N})")
    ap.add_argument("--perfil", default=str(PERFIL))
    ap.add_argument("--firefox", default=str(FIREFOX))
    ap.add_argument("--solo-preparar", action="store_true", help="prepara el perfil y la extensión, sin abrir Firefox")
    a = ap.parse_args(argv)
    firefox = pathlib.Path(a.firefox)
    if not a.solo_preparar and not firefox.exists():
        ap.error(f"no está Firefox Developer Edition en {firefox}")
    perfil = pathlib.Path(a.perfil)
    version = preparar_perfil(perfil, a.ensayo, a.inicio)
    modo = "ENSAYO (2023, ahora)" if a.ensayo else f"convocatoria de 2026, desde {a.inicio}"
    print(f"Extensión {version} en {perfil}: {modo}", flush=True)
    if a.solo_preparar:
        return 0
    os.execv(str(firefox), [str(firefox), "--no-remote", "--profile", str(perfil), URL])


if __name__ == "__main__":
    sys.exit(main())
