# Elecciones España

Seguimiento de las elecciones en España. Primer hito: **elecciones generales del 29 de noviembre de 2026**.

- **Antes de las elecciones:** encuestas, noticias y aviso del recuento en directo.
- **Desde el cierre de colegios (20:00 del 29N) hasta el fin del recuento:** escaños, mapas por circunscripción y las 10
  circunscripciones donde un escaño puede cambiar de manos.
- **Después:** análisis de resultados, que pasa al histórico.

La portada cambia sola de fase según la fecha. Método y decisiones: [`docs/metodologia.md`](docs/metodologia.md).

## Estructura

```
packages/engine   Motor electoral (TypeScript puro, sin I/O): D'Hondt, barrera, extrapolación, tabla de disputa,
                  simulador de una noche electoral y backtest
apps/web          Web estática (Astro): portada por fases, paneles del recuento y página de simulación
data/config       Escaños por circunscripción, candidaturas proclamadas, agrupación de siglas
data/simulacion   Resultados de 2023 por municipio, para simular una noche electoral
scripts           Utilidades de datos
docs              Metodología
```

## Desarrollo

Requiere Node ≥ 22 y pnpm 12 (`corepack enable`).

```sh
pnpm install
pnpm test        # motor (157 tests) y web (63 tests)
pnpm typecheck
pnpm dev         # http://localhost:4321
pnpm build       # apps/web/dist
```

Previsualizar la portada en otro momento:

```sh
AHORA_FORZADA=2026-11-25T12:00:00+01:00 pnpm build   # en plena veda de encuestas
AHORA_FORZADA=2026-11-29T21:00:00+01:00 pnpm build   # fase de recuento
```

## Publicación

GitHub Pages desde Actions (`.github/workflows/pages.yml`). Hay que activar **Settings → Pages → Source: GitHub
Actions**. Con dominio propio, definir las variables de repo `SITE_URL` y `BASE_PATH=/`.

## Anuncios (Google AdSense)

La web está preparada para mostrar anuncios, pero **no muestra ni carga nada de terceros mientras no haya ID de AdSense**.
Un banner al pie de cada página (con el hueco reservado y el rótulo «Publicidad») y, en pantallas de 1.400 px o más, dos
laterales de 160 × 600 fijos junto a la columna de contenido. Se configuran con variables de repo, como `SITE_URL`
(Settings → Secrets and variables → Actions → Variables):

| Variable | Valor |
|---|---|
| `ADSENSE_CLIENT` | ID de editor, `ca-pub-XXXXXXXXXXXXXXXX`. Sin él, no hay nada. **Solo con él, modo verificación** (ver abajo) |
| `ADSENSE_SLOT_PIE` | ID del bloque de anuncios del pie |
| `ADSENSE_SLOT_LATERAL` | ID del bloque de los laterales |
| `ADSENSE_LATERALES` | `false` para quitar los laterales (entonces no hace falta su bloque) |

**Modo verificación.** AdSense comprueba que el sitio es tuyo con la etiqueta `meta` y `ads.txt`. Definiendo solo
`ADSENSE_CLIENT`, la web los emite y nada más: sin script de Google, sin anuncios y sin cookies. Sirve para dar de alta el
sitio en AdSense antes de tener los bloques de anuncios. Cuando AdSense lo apruebe, se definen los dos `ADSENSE_SLOT_*`.

Con anuncios, **la web no se construye** si faltan nombre, domicilio o contacto en `apps/web/src/data/titular.json`:
se publican en `/privacidad/` (aviso legal, art. 10 de la LSSI). La política de privacidad cambia sola según haya o no
anuncios. `ads.txt` se genera con el ID de editor. El consentimiento lo gestiona Google (AdSense → Privacy & messaging);
el pie ofrece «Preferencias de publicidad» solo si Google expone ese mensaje. Detalles en `docs/metodologia.md`.

Pasos que solo puede hacer el titular: crear la cuenta de AdSense, añadir el sitio, esperar su revisión y activar el
mensaje de consentimiento; apuntar el dominio (CNAME a `<usuario>.github.io`, dominio en Settings → Pages,
`SITE_URL=https://dominio` y `BASE_PATH=/`); y, si el sitio es un subdominio, comprobar si Google necesita la línea
`subdomain=` en el `ads.txt` del dominio principal.

## Estado

Hecho: motor con tests, datos oficiales de circunscripciones y candidaturas, agrupación de siglas, voto exterior (CERA),
simulador de una noche electoral con datos de 2023 y backtest del motor, portada de las tres fases (recuento y análisis
aún son marcadores de posición), paneles del recuento (sectores, mapas, tabla de disputa) y su modo de simulación, publicado
como «Ejemplo de recuento» (`/simulacion/`) dentro del histórico (`/historico/`), y CI/Pages.

Pendiente: fuente de datos en vivo, ingesta en Actions, conectar los paneles a esa fuente en la fase de recuento,
histórico y blog de encuestas.
