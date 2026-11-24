#!/usr/bin/env python3
"""Genera el mapa de las 52 circunscripciones del Congreso a partir de Natural Earth (dominio público):

  apps/web/src/data/mapa-circunscripciones.json
    { ancho, alto, canarias: [x, y, ancho, alto],
      circunscripciones: { "01": { d: "M x y x y ... Z", centro: [x, y], caja: [x0, y0, x1, y1] }, ... } }

Entrada (se descarga a mano, ver data/README.md):
  ne_10m_admin_1_states_provinces.zip   https://naciscdn.org/naturalearth/10m/cultural/ne_10m_admin_1_states_provinces.zip

Las 52 circunscripciones del Congreso son las 50 provincias (Baleares y cada provincia canaria, enteras) más Ceuta y
Melilla, y Natural Earth trae justo esas 52 entidades para España (adm0_a3 = ESP).

Pasos: proyección cónica conforme de Lambert (Canarias, con la suya propia y la misma escala, en un recuadro abajo a
la izquierda), simplificación Douglas-Peucker, descarte de islotes minúsculos y cálculo de un punto interior
(el más alejado del borde) donde colocar los símbolos del mapa.

Uso:  python3 -I scripts/mapa_circunscripciones.py RUTA/ne_10m_admin_1_states_provinces.zip
El ZIP es un dato externo: solo se lee (se interpreta a mano el formato DBF/SHP), nunca se ejecuta ni se extrae a disco.
"""
import io
import json
import math
import pathlib
import struct
import sys
import zipfile

sys.setrecursionlimit(20000)

RAIZ = pathlib.Path(__file__).resolve().parent.parent
SALIDA = RAIZ / "apps/web/src/data/mapa-circunscripciones.json"
BASE = "ne_10m_admin_1_states_provinces"

# ISO 3166-2 (Natural Earth) → código INE de la circunscripción.
INE = {
    "ES-VI": "01", "ES-AB": "02", "ES-A": "03", "ES-AL": "04", "ES-AV": "05", "ES-BA": "06", "ES-PM": "07",
    "ES-B": "08", "ES-BU": "09", "ES-CC": "10", "ES-CA": "11", "ES-CS": "12", "ES-CR": "13", "ES-CO": "14",
    "ES-C": "15", "ES-CU": "16", "ES-GI": "17", "ES-GR": "18", "ES-GU": "19", "ES-SS": "20", "ES-H": "21",
    "ES-HU": "22", "ES-J": "23", "ES-LE": "24", "ES-L": "25", "ES-LO": "26", "ES-LU": "27", "ES-M": "28",
    "ES-MA": "29", "ES-MU": "30", "ES-NA": "31", "ES-OR": "32", "ES-O": "33", "ES-P": "34", "ES-GC": "35",
    "ES-PO": "36", "ES-SA": "37", "ES-TF": "38", "ES-S": "39", "ES-SG": "40", "ES-SE": "41", "ES-SO": "42",
    "ES-T": "43", "ES-TE": "44", "ES-TO": "45", "ES-V": "46", "ES-VA": "47", "ES-BI": "48", "ES-ZA": "49",
    "ES-Z": "50", "ES-CE": "51", "ES-ML": "52",
}
CANARIAS = {"35", "38"}

ANCHO = 1000.0  # ancho del mapa principal, en unidades del viewBox
TOLERANCIA = 0.6  # Douglas-Peucker, en unidades del viewBox (≈ 0,6 km)
AREA_MINIMA = 1.2  # un anillo con menos área (unidades²) se descarta, salvo el mayor de cada circunscripción
MARGEN = 8.0


# --- Lectura de DBF y SHP -----------------------------------------------------------------------------------

def leer_dbf(datos):
    n, cabecera, longitud = struct.unpack("<IHH", datos[4:12])
    campos, pos = [], 32
    while datos[pos] != 0x0D:
        campos.append((datos[pos:pos + 11].split(b"\0")[0].decode("ascii"), datos[pos + 16]))
        pos += 32
    filas = []
    for i in range(n):
        reg = datos[cabecera + i * longitud: cabecera + (i + 1) * longitud]
        o, fila = 1, {}
        for nombre, tam in campos:
            fila[nombre] = reg[o:o + tam].decode("utf-8", "replace").strip(" \0")
            o += tam
        filas.append(fila)
    return filas


def leer_poligonos(datos, indices):
    """Anillos [(x, y), ...] de cada registro pedido (tipo 5, polígono). El formato es little-endian salvo el
    encabezado de cada registro."""
    pos, registros = 100, []
    while pos < len(datos):
        _, palabras = struct.unpack(">ii", datos[pos:pos + 8])
        registros.append((pos + 8, palabras * 2))
        pos += 8 + palabras * 2
    salida = {}
    for i in indices:
        ini, _ = registros[i]
        tipo = struct.unpack("<i", datos[ini:ini + 4])[0]
        if tipo != 5:
            raise SystemExit(f"Se esperaba un polígono (tipo 5) y el registro {i} es de tipo {tipo}")
        partes, puntos = struct.unpack("<ii", datos[ini + 36:ini + 44])
        inicios = struct.unpack(f"<{partes}i", datos[ini + 44:ini + 44 + 4 * partes]) + (puntos,)
        base = ini + 44 + 4 * partes
        xy = struct.unpack(f"<{2 * puntos}d", datos[base:base + 16 * puntos])
        pts = list(zip(xy[0::2], xy[1::2]))
        salida[i] = [pts[inicios[k]:inicios[k + 1]] for k in range(partes)]
    return salida


# --- Geometría ----------------------------------------------------------------------------------------------

def lambert(lon0, lat0, lat1, lat2):
    r = lambda g: math.radians(g)
    n = math.log(math.cos(r(lat1)) / math.cos(r(lat2))) / math.log(
        math.tan(math.pi / 4 + r(lat2) / 2) / math.tan(math.pi / 4 + r(lat1) / 2)
    )
    f = math.cos(r(lat1)) * math.tan(math.pi / 4 + r(lat1) / 2) ** n / n
    rho = lambda lat: f / math.tan(math.pi / 4 + r(lat) / 2) ** n
    rho0 = rho(lat0)

    def proyectar(lon, lat):
        t = n * r(lon - lon0)
        return rho(lat) * math.sin(t), rho0 - rho(lat) * math.cos(t)  # y hacia el norte

    return proyectar


def area_con_signo(anillo):
    return sum(x1 * y2 - x2 * y1 for (x1, y1), (x2, y2) in zip(anillo, anillo[1:] + anillo[:1])) / 2


def douglas_peucker(pts, tolerancia):
    """Simplifica un anillo cerrado (sin repetir el primer punto al final)."""
    if len(pts) <= 4:
        return pts
    ciclo = pts + [pts[0]]

    def distancia(p, a, b):
        (x, y), (x1, y1), (x2, y2) = p, a, b
        dx, dy = x2 - x1, y2 - y1
        if dx == 0 and dy == 0:
            return math.hypot(x - x1, y - y1)
        t = max(0.0, min(1.0, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)))
        return math.hypot(x - (x1 + t * dx), y - (y1 + t * dy))

    def tramo(i, j):
        """Puntos que se conservan entre i y j, incluido i y excluido j."""
        mayor, k = 0.0, -1
        for m in range(i + 1, j):
            d = distancia(ciclo[m], ciclo[i], ciclo[j])
            if d > mayor:
                mayor, k = d, m
        if mayor <= tolerancia:
            return [ciclo[i]]
        return tramo(i, k) + tramo(k, j)

    # El anillo se parte por su punto más alejado del primero, para no depender de dónde empiece.
    lejos = max(range(len(pts)), key=lambda m: math.hypot(pts[m][0] - pts[0][0], pts[m][1] - pts[0][1]))
    salida = tramo(0, lejos) + tramo(lejos, len(pts))
    return salida if len(salida) >= 3 else pts


def dentro(p, anillo):
    x, y = p
    c = False
    for (x1, y1), (x2, y2) in zip(anillo, anillo[1:] + anillo[:1]):
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            c = not c
    return c


def distancia_al_borde(p, anillo):
    x, y = p
    mejor = float("inf")
    for (x1, y1), (x2, y2) in zip(anillo, anillo[1:] + anillo[:1]):
        dx, dy = x2 - x1, y2 - y1
        l2 = dx * dx + dy * dy
        t = 0.0 if l2 == 0 else max(0.0, min(1.0, ((x - x1) * dx + (y - y1) * dy) / l2))
        mejor = min(mejor, math.hypot(x - (x1 + t * dx), y - (y1 + t * dy)))
    return mejor


def punto_interior(anillo):
    """Punto del anillo más alejado de su borde (búsqueda en rejilla que se afina cuatro veces)."""
    xs, ys = [p[0] for p in anillo], [p[1] for p in anillo]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    mejor, valor = ((x0 + x1) / 2, (y0 + y1) / 2), -1.0
    for _ in range(4):
        pasos = 14
        for i in range(pasos + 1):
            for j in range(pasos + 1):
                p = (x0 + (x1 - x0) * i / pasos, y0 + (y1 - y0) * j / pasos)
                if not dentro(p, anillo):
                    continue
                d = distancia_al_borde(p, anillo)
                if d > valor:
                    mejor, valor = p, d
        ancho, alto = (x1 - x0) / pasos * 2, (y1 - y0) / pasos * 2
        x0, x1, y0, y1 = mejor[0] - ancho, mejor[0] + ancho, mejor[1] - alto, mejor[1] + alto
    return mejor


def main(ruta_zip):
    z = zipfile.ZipFile(ruta_zip)
    filas = leer_dbf(z.read(BASE + ".dbf"))
    espana = [i for i, f in enumerate(filas) if f["adm0_a3"] == "ESP"]
    codigos = {i: INE[filas[i]["iso_3166_2"]] for i in espana}
    if sorted(codigos.values()) != sorted(set(INE.values())) or len(espana) != 52:
        raise SystemExit("Natural Earth no trae las 52 circunscripciones esperadas")
    crudos = leer_poligonos(z.read(BASE + ".shp"), espana)

    # Proyección: la península, Baleares, Ceuta y Melilla con una; Canarias con otra centrada en el archipiélago.
    principal = lambert(-3.5, 40.0, 36.0, 43.5)
    canarias = lambert(-15.8, 28.4, 27.0, 30.0)
    puntos = {}  # código → [anillos proyectados (y hacia el norte, aún sin escalar)]
    for i, anillos in crudos.items():
        cod = codigos[i]
        proy = canarias if cod in CANARIAS else principal
        puntos[cod] = [[proy(lon, lat) for lon, lat in a[:-1]] for a in anillos]

    # Escala: el mapa principal mide ANCHO de ancho.
    ppal = [p for c, rs in puntos.items() if c not in CANARIAS for r in rs for p in r]
    minx, maxx = min(p[0] for p in ppal), max(p[0] for p in ppal)
    miny, maxy = min(p[1] for p in ppal), max(p[1] for p in ppal)
    escala = (ANCHO - 2 * MARGEN) / (maxx - minx)

    # Recuadro de Canarias: abajo a la izquierda, por debajo del extremo sur de Andalucía, Ceuta y Melilla.
    can = [p for c in CANARIAS for r in puntos[c] for p in r]
    cminx, cmaxx = min(p[0] for p in can), max(p[0] for p in can)
    cminy, cmaxy = min(p[1] for p in can), max(p[1] for p in can)
    cw, ch = (cmaxx - cminx) * escala, (cmaxy - cminy) * escala
    hueco = 14.0
    # El recuadro va justo debajo de Ceuta (el punto más al sur de lo que hay a su izquierda).
    sur_ceuta = max(MARGEN + (maxy - p[1]) * escala for r in puntos["51"] for p in r)
    recuadro_x, recuadro_y = MARGEN, sur_ceuta + 1.5 * hueco
    alto = recuadro_y + ch + 2 * hueco + MARGEN

    def a_pantalla(cod, p):
        if cod in CANARIAS:
            return (recuadro_x + hueco + (p[0] - cminx) * escala, recuadro_y + hueco + (cmaxy - p[1]) * escala)
        return (MARGEN + (p[0] - minx) * escala, MARGEN + (maxy - p[1]) * escala)

    salida = {}
    for cod in sorted(puntos):
        anillos = [[a_pantalla(cod, p) for p in r] for r in puntos[cod]]
        # Los anillos exteriores van en sentido horario en el shapefile (área con signo negativa con y hacia el norte
        # se vuelve positiva al voltear): se descartan los huecos y se queda con los exteriores.
        exteriores = [a for a in anillos if area_con_signo(a) > 0] or anillos
        exteriores.sort(key=lambda a: -abs(area_con_signo(a)))
        mayor = exteriores[0]
        conservados = [mayor] + [a for a in exteriores[1:] if abs(area_con_signo(a)) >= AREA_MINIMA]
        simples = [douglas_peucker(a, TOLERANCIA) for a in conservados]
        d = " ".join("M" + " ".join(f"{x:.1f} {y:.1f}" for x, y in a) + " Z" for a in simples)
        cx, cy = punto_interior(simples[0])
        xs = [x for a in simples for x, _ in a]
        ys = [y for a in simples for _, y in a]
        salida[cod] = {
            "d": d,
            "centro": [round(cx, 1), round(cy, 1)],
            "caja": [round(min(xs), 1), round(min(ys), 1), round(max(xs), 1), round(max(ys), 1)],
        }

    resultado = {
        "_fuente": "Natural Earth v" + z.read(BASE + ".VERSION.txt").decode().strip() + ", Admin 1 – States, Provinces, 1:10m "
        "(https://www.naturalearthdata.com/), dominio público. Simplificado y reproyectado con scripts/mapa_circunscripciones.py.",
        "_nota": "Proyección cónica conforme de Lambert; Canarias, con la misma escala, dentro del recuadro. Un trazo "
        "por circunscripción (código INE), con un punto interior para colocar símbolos y su caja.",
        "ancho": round(ANCHO, 1),
        "alto": round(alto, 1),
        "canarias": [round(recuadro_x, 1), round(recuadro_y, 1), round(cw + 2 * hueco, 1), round(ch + 2 * hueco, 1)],
        "circunscripciones": salida,
    }
    SALIDA.parent.mkdir(parents=True, exist_ok=True)
    SALIDA.write_text(json.dumps(resultado, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    vertices = sum(d["d"].count(" ") // 2 for d in salida.values())
    print(f"OK: {SALIDA.relative_to(RAIZ)} ({SALIDA.stat().st_size // 1024} KB, ~{vertices} vértices, {ANCHO:.0f}×{alto:.0f})")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    main(sys.argv[1])
