#!/usr/bin/env python3
"""Publica el escrutinio recibido en la rama `datos-vivo` del repositorio. NUNCA toca `main`.

Lee `.datos-vivo/escrutinio.json` y `.datos-vivo/serie.jsonl` (los escribe receptor.py) y, si han cambiado, los sube a
la rama `datos-vivo` como un único commit que se reescribe cada vez (la rama no acumula historia: la evolución del
recuento ya va dentro de `serie.jsonl`, y los crudos se quedan en local). La web lee los datos en el navegador directamente de
esa rama (raw.githubusercontent.com), así que NO hace falta ningún workflow para que lleguen. Opcionalmente (`--lanzar`)
se lanza `pages.yml` sobre `main` (`gh workflow run`) para refrescar la copia de respaldo que sirve Pages. Hace falta `gh` con sesión iniciada.

Se trabaja en un clon propio dentro de `.datos-vivo/publicacion`, así que el árbol de trabajo del proyecto no se toca.
El único destino posible del empuje es `refs/heads/datos-vivo`: está fijado en el código.

Uso:  python3 -I scripts/infoelectoral/publicar.py [--una-vez] [--ensayo] [--lanzar] [--intervalo 300] [--datos .datos-vivo] [--remoto URL]
"""

import argparse
import json
import subprocess
import sys
import time
from pathlib import Path

RAMA = 'datos-vivo'
FICHEROS = ('escrutinio.json', 'serie.jsonl')
RAIZ = Path(__file__).resolve().parents[2]


class ErrorPublicacion(Exception):
    pass


def git(cwd, *args, comprobar=True):
    r = subprocess.run(['git', *args], cwd=cwd, capture_output=True, text=True)
    if comprobar and r.returncode != 0:
        raise ErrorPublicacion(f"git {' '.join(args)}: {r.stderr.strip() or r.stdout.strip()}")
    return r


def url_remoto():
    return git(RAIZ, 'remote', 'get-url', 'origin').stdout.strip()


def validar(datos, ensayo=False):
    """El escrutinio que se publica tiene que ser legible y completo, o no se publica nada."""
    ruta = datos / 'escrutinio.json'
    try:
        e = json.loads(ruta.read_text(encoding='utf-8'))
    except (OSError, ValueError) as ex:
        raise ErrorPublicacion(f'{ruta}: no se puede leer ({ex})')
    conv = e.get('convocatoria') or {}
    if not ensayo and not (conv.get('tipo') == 2 and str(conv.get('id', '')).startswith('2026')):
        raise ErrorPublicacion(f"la convocatoria {conv.get('id')!r} no es la de 2026: no se publica (para un ensayo, --ensayo)")
    if e.get('version') != 1 or not e.get('completa') or len(e.get('circunscripciones', [])) != 52:
        raise ErrorPublicacion('el escrutinio no es completo (versión 1 y 52 circunscripciones): no se publica')
    serie = datos / 'serie.jsonl'
    if serie.exists():
        for n, linea in enumerate(serie.read_text(encoding='utf-8').splitlines(), 1):
            try:
                json.loads(linea)
            except ValueError:
                raise ErrorPublicacion(f'{serie}: línea {n} no es JSON')
    return e


def preparar_clon(clon, remoto):
    if not (clon / '.git').exists():
        clon.mkdir(parents=True, exist_ok=True)
        git(clon, 'init', '-q')
        git(clon, 'checkout', '-q', '--orphan', RAMA)
    git(clon, 'config', 'user.name', 'Publicador de datos en vivo')
    git(clon, 'config', 'user.email', 'datos-vivo@users.noreply.github.com')
    if git(clon, 'remote', comprobar=False).stdout.split() == []:
        git(clon, 'remote', 'add', 'origin', remoto)
    else:
        git(clon, 'remote', 'set-url', 'origin', remoto)


def publicar(datos, clon, remoto, ensayo=False):
    """Devuelve True si ha subido algo, False si no había cambios."""
    e = validar(datos, ensayo)
    preparar_clon(clon, remoto)
    for f in FICHEROS:
        origen = datos / f
        if origen.exists():
            (clon / f).write_bytes(origen.read_bytes())
    git(clon, 'add', '-A')
    if git(clon, 'status', '--porcelain').stdout.strip() == '' and git(clon, 'rev-parse', '--verify', '-q', 'HEAD', comprobar=False).returncode == 0:
        return False
    mensaje = f"datos: escrutinio de {e.get('capturadoEn', '?')}"
    # Un único commit: se reescribe con --amend (o se crea el primero).
    if git(clon, 'rev-parse', '--verify', '-q', 'HEAD', comprobar=False).returncode == 0:
        git(clon, 'commit', '-q', '--amend', '--no-edit', '-m', mensaje)
    else:
        git(clon, 'commit', '-q', '-m', mensaje)
    # Destino fijado: solo la rama de datos. El empuje forzado es necesario porque se reescribe el commit.
    git(clon, 'push', '-q', '--force', 'origin', f'HEAD:refs/heads/{RAMA}')
    return True


def lanzar_construccion():
    """Pide a GitHub que reconstruya la web desde main (pages.yml recoge la rama de datos)."""
    r = subprocess.run(['gh', 'workflow', 'run', 'pages.yml', '--ref', 'main'], cwd=RAIZ, capture_output=True, text=True)
    if r.returncode != 0:
        raise ErrorPublicacion(f'se subieron los datos, pero no se pudo lanzar la construcción: {r.stderr.strip()}')


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--datos', default=str(RAIZ / '.datos-vivo'))
    ap.add_argument('--remoto', default=None, help='URL del remoto (por defecto, el origin de este repositorio)')
    ap.add_argument('--intervalo', type=int, default=300, help='segundos entre publicaciones (mínimo 120)')
    ap.add_argument('--una-vez', action='store_true')
    ap.add_argument('--ensayo', action='store_true', help='permite publicar otra convocatoria (p. ej. 2023); la web la ignora salvo con ?ensayo')
    ap.add_argument('--lanzar', action='store_true', help='tras subir, lanza pages.yml sobre main (refresca la copia de respaldo)')
    a = ap.parse_args(argv)
    if a.intervalo < 120:
        ap.error('--intervalo: mínimo 120 s (no tiene sentido más a menudo: GitHub guarda en caché la copia de raw 5 min)')
    datos = Path(a.datos)
    clon = datos / 'publicacion'
    remoto = a.remoto or url_remoto()
    while True:
        marca = time.strftime('%H:%M:%S')
        try:
            subido = publicar(datos, clon, remoto, a.ensayo)
            if subido and a.lanzar:
                lanzar_construccion()
            print(f'{marca} {"publicado" if subido else "sin cambios"}', flush=True)
        except ErrorPublicacion as ex:
            print(f'{marca} NO publicado: {ex}', file=sys.stderr, flush=True)
            if a.una_vez:
                return 1
        if a.una_vez:
            return 0
        time.sleep(a.intervalo)


if __name__ == '__main__':
    sys.exit(main())
