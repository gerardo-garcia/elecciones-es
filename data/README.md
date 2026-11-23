# Datos

## `config/` (versionado)

| Fichero | Contenido | Origen |
|---|---|---|
| `circunscripciones.json` | 52 circunscripciones, códigos INE y diputados (suman 350) | Anexo del RD 806/2026 (BOE-A-2026-20742). Se regenera con `scripts/anexo_a_json.py` a partir de `https://www.boe.es/diario_boe/xml.php?id=BOE-A-2026-20742` |
| `candidaturas-proclamadas-2026.json` | Denominación y siglas de las 534 listas al Congreso, por circunscripción | Web oficial 29neleccionesgenerales.es, consulta del 2026-11-23. Sin nombres de personas |
| `cera-2023.json` | Peso del voto exterior (CERA) en 2023 por circunscripción: censo, votantes y votos válidos | Infoelectoral, generales de julio de 2023. Se regenera con `scripts/generales2023_a_json.py` (ver abajo) |
| `agrupaciones.json` | Agrupación de siglas de formaciones territoriales del mismo partido | **Primera propuesta, pendiente de revisión.** `pendienteDecision` marca lo que debe decidir una persona |

## `raw/` (ignorado por git)

Datos brutos descargados a mano, por ejemplo los ficheros de Infoelectoral de elecciones anteriores. El portal de
Infoelectoral rechaza a los clientes que no son un navegador (403, y su cortafuegos bloquea las rutas antiguas), y su
servidor no envía el certificado intermedio, así que `curl` falla la verificación TLS. Se descargan con un navegador
normal desde el área de descargas, <https://infoelectoral.interior.gob.es/es/elecciones-celebradas/area-de-descargas/>,
sin desactivar la verificación del certificado. Los ficheros son datos externos: solo se leen.

Para el contraste de 2023 hacen falta dos ficheros de las generales de julio de 2023:

- Resultados por circunscripción (incluye el voto CERA): `PROV_02_202307_1.xlsx`.
- Resultados por municipio (solo voto residente): `02_202307_1.xlsx`.

```sh
python3 -I scripts/generales2023_a_json.py RUTA/PROV_02_202307_1.xlsx RUTA/02_202307_1.xlsx
```

Genera `packages/engine/test/fixtures/generales-2023.json` y `data/config/cera-2023.json`. Requiere `openpyxl`. El CERA
de cada circunscripción no se publica por separado: es el total provincial menos la suma de sus municipios.

## `snapshots/` (ignorado por git)

Capturas del escrutinio en vivo, con marca de tiempo y hash.
