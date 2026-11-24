# Datos

## `config/` (versionado)

| Fichero | Contenido | Origen |
|---|---|---|
| `circunscripciones.json` | 52 circunscripciones, códigos INE y diputados (suman 350) | Anexo del RD 806/2026 (BOE-A-2026-20742). Se regenera con `scripts/anexo_a_json.py` a partir de `https://www.boe.es/diario_boe/xml.php?id=BOE-A-2026-20742` |
| `candidaturas-proclamadas-2026.json` | Denominación y siglas de las 534 listas al Congreso, por circunscripción | Web oficial 29neleccionesgenerales.es, consulta del 2026-11-23. Sin nombres de personas |
| `cera-2023.json` | Peso del voto exterior (CERA) en 2023 por circunscripción: censo, votantes y votos válidos | Infoelectoral, generales de julio de 2023. Se regenera con `scripts/generales2023_a_json.py` (ver abajo) |
| `agrupaciones.json` | Agrupación de siglas de formaciones territoriales del mismo partido | Revisada y aprobada el 23-nov-2026. `incluye` es el texto que acompaña al grupo en gráficos y tablas cuando suma partidos distintos; `pendienteDecision` marcaría lo que debe decidir una persona (ahora nada) |

## `simulacion/` (versionado)

| Fichero | Contenido | Origen |
|---|---|---|
| `generales-2023-municipios.json` | Un registro por municipio (8.131) de las generales de julio de 2023, solo voto residente: provincia, mesas, censo, blancos y votos por partido (índice en la lista `partidos`), y `escanos` (escaños de cada circunscripción en 2023, código INE → diputados, suman 350). 418 KB | Infoelectoral, resultados por municipio. Se regenera con `scripts/generales2023_a_json.py` |

Sirve para simular una noche electoral, para el backtest del motor y para la página `/simulacion/` de la web (ver
`docs/metodologia.md`). No hay datos a nivel de mesa: cada municipio se reparte a partes iguales entre sus mesas.

## `encuestas/` (versionado)

Registro de encuestas con su fuente, fechas de campo, muestra y cifras, y el estado de cada enlace cuando se recogieron
(`encuestas-2026-11-23.json`). Indica en cada una si las cifras se leyeron en el documento original o en una página que
las recoge. Las que se enlazan en la portada están en `apps/web/src/data/enlaces.json`, donde toda encuesta lleva fecha.
`python3 -I scripts/comprobar_enlaces.py data/encuestas/encuestas-2026-11-23.json` vuelve a pedir los enlaces y compara.

## Mapa de las circunscripciones

`apps/web/src/data/mapa-circunscripciones.json` es el mapa de las 52 circunscripciones del Congreso (50 provincias, con
Baleares y cada provincia canaria enteras, más Ceuta y Melilla), generado a partir de **Natural Earth**
(Admin 1 – States, Provinces, 1:10m, v5.1.1, dominio público; <https://www.naturalearthdata.com/>). Se descarga a mano
<https://naciscdn.org/naturalearth/10m/cultural/ne_10m_admin_1_states_provinces.zip> y:

```sh
python3 -I scripts/mapa_circunscripciones.py RUTA/ne_10m_admin_1_states_provinces.zip
```

Solo con la biblioteca estándar; el ZIP es un dato externo y se lee sin extraerlo. Proyecta con una cónica conforme de
Lambert, simplifica el contorno (≈ 0,6 km) y deja Canarias, con la misma escala, en un recuadro. Se descartó el
conjunto NUTS3 de Eurostat (GISCO) porque su licencia es solo para uso no comercial y exige atribución específica.

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

Genera `packages/engine/test/fixtures/generales-2023.json`, `data/config/cera-2023.json` y
`data/simulacion/generales-2023-municipios.json`. Requiere `openpyxl`. El CERA
de cada circunscripción no se publica por separado: es el total provincial menos la suma de sus municipios.

## `snapshots/` (ignorado por git)

Capturas del escrutinio en vivo, con marca de tiempo y hash.
