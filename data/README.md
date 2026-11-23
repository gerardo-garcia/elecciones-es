# Datos

## `config/` (versionado)

| Fichero | Contenido | Origen |
|---|---|---|
| `circunscripciones.json` | 52 circunscripciones, códigos INE y diputados (suman 350) | Anexo del RD 806/2026 (BOE-A-2026-20742). Se regenera con `scripts/anexo_a_json.py` a partir de `https://www.boe.es/diario_boe/xml.php?id=BOE-A-2026-20742` |
| `candidaturas-proclamadas-2026.json` | Denominación y siglas de las 534 listas al Congreso, por circunscripción | Web oficial 29neleccionesgenerales.es, consulta del 2026-11-23. Sin nombres de personas |
| `agrupaciones.json` | Agrupación de siglas de formaciones territoriales del mismo partido | **Primera propuesta, pendiente de revisión.** `pendienteDecision` marca lo que debe decidir una persona |

## `raw/` (ignorado por git)

Datos brutos descargados a mano, por ejemplo los ficheros de Infoelectoral de elecciones anteriores. El portal de
Infoelectoral devuelve 403 a los clientes que no son un navegador, así que hay que bajarlos desde un navegador y dejarlos
aquí.

## `snapshots/` (ignorado por git)

Capturas del escrutinio en vivo, con marca de tiempo y hash.
