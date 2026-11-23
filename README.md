# Elecciones España

Seguimiento de las elecciones en España. Primer hito: **elecciones generales del 29 de noviembre de 2026**.

- **Antes de las elecciones:** encuestas, noticias y aviso del recuento en directo.
- **Del día de reflexión al fin del recuento:** escaños, mapas por circunscripción y las 10 circunscripciones donde un
  escaño puede cambiar de manos.
- **Después:** análisis de resultados, que pasa al histórico.

La portada cambia sola de fase según la fecha. Método y decisiones: [`docs/metodologia.md`](docs/metodologia.md).

## Estructura

```
packages/engine   Motor electoral (TypeScript puro, sin I/O): D'Hondt, barrera, extrapolación, tabla de disputa
apps/web          Web estática (Astro): portada por fases
data/config       Escaños por circunscripción, candidaturas proclamadas, agrupación de siglas
scripts           Utilidades de datos
docs              Metodología
```

## Desarrollo

Requiere Node ≥ 22 y pnpm 12 (`corepack enable`).

```sh
pnpm install
pnpm test        # motor (52 tests) y web (17 tests)
pnpm typecheck
pnpm dev         # http://localhost:4321
pnpm build       # apps/web/dist
```

Previsualizar la portada en otro momento:

```sh
AHORA_FORZADA=2026-11-25T12:00:00+01:00 pnpm build   # en plena veda de encuestas
AHORA_FORZADA=2026-11-28T12:00:00+01:00 pnpm build   # fase de recuento
```

## Publicación

GitHub Pages desde Actions (`.github/workflows/pages.yml`). Hay que activar **Settings → Pages → Source: GitHub
Actions**. Con dominio propio, definir las variables de repo `SITE_URL` y `BASE_PATH=/`.

## Estado

Hecho: motor con tests, datos oficiales de circunscripciones y candidaturas, propuesta de agrupación de siglas, portada
de las tres fases (recuento y análisis aún son marcadores de posición) y CI/Pages.

Pendiente: fuente de datos en vivo, ingesta en Actions, paneles del recuento (sectores, mapas, tabla), modo de simulación
y backtest, histórico y blog de encuestas.
