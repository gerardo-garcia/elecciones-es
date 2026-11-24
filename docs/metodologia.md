# Metodología

Cómo calcula el motor (`packages/engine`) y qué decisiones hay detrás. Si algo de aquí cambia, cambia el código y los tests en el mismo commit.

## Qué calcula

Para cada una de las 52 circunscripciones y en cada actualización del escrutinio:

1. **Extrapolación lineal por circunscripción.** Todos los votos escrutados (candidaturas y blancos) se multiplican por
   `censo / censo escrutado`. Se escala por el **% de censo escrutado**, no por el de mesas.
2. **Barrera.** En las circunscripciones proporcionales solo entran en el reparto las candidaturas con **al menos el 3 %
   de los votos válidos** de la circunscripción, **blancos incluidos** (LOREG, art. 163). El 5 % que se menciona a veces
   es de municipales y de algunas autonómicas, no del Congreso.
3. **D'Hondt.** Los escaños de la circunscripción (anexo del RD 806/2026) se reparten por cocientes. Si dos cocientes
   coinciden, el escaño es para la candidatura con más votos; si también empatan a votos, lo decide un sorteo y el
   motor lo marca (`empateSorteo`) en vez de elegir en silencio.
4. **Ceuta y Melilla.** Un diputado cada una, por mayoría simple: sin barrera ni D'Hondt (se implementa como D'Hondt
   de un escaño sobre todas las candidaturas).
5. **Resultado general.** Suma de los escaños de las 52 circunscripciones. Las circunscripciones sin ningún dato
   cuentan como escaños pendientes, no como cero.

> **Propiedad útil.** D'Hondt y la barrera son invariantes a multiplicar todos los votos por la misma constante. Por eso
> los escaños proyectados son exactamente los de D'Hondt sobre los votos ya escrutados; el factor solo cambia los votos
> absolutos que se muestran. Hay un test que lo comprueba. (Deja de valer en cuanto se suma el voto CERA, que no se
> extrapola: ver más abajo.)

## Voto por correo y voto exterior (CERA)

- **Voto por correo de los residentes en España: ya está en el escrutinio de las mesas.** Los sobres llegan a la mesa de
  cada elector, se introducen en la urna al cierre de colegios (20:00) y se cuentan junto con el resto, sin distinción.
  No hay nada que sumar aparte. Los votos por correo que llegan tarde no se cuentan.
- **Voto exterior (CERA, residentes ausentes): se escruta después y de golpe.** No pasa por las mesas de la noche
  electoral: lo cuentan las Juntas Electorales Provinciales en el escrutinio general (según la guía de La Moncloa, del 4
  al 7 de diciembre; fechas por confirmar con la Junta Electoral Central). Mientras tanto la proyección **no lo
  incluye** y la web debe decirlo.
- **Cuando llega, se suma tal cual, sin extrapolar** (`calcularCircunscripcion(..., cera)`), a los votos extrapolados de
  la circunscripción antes de aplicar la barrera y D'Hondt. `ceraIncluido` indica en qué situación está cada resultado.
- **Cuánto pesa (generales de julio de 2023).** 204.649 votos válidos CERA: el 0,83 % del total, con una participación
  del 8,95 % de su censo. Al sumarlo a los resultados de las mesas, el reparto solo cambia en **Madrid** (PSOE → PP:
  de 15/11 a 16/10, que es el resultado oficial). En las otras 51 circunscripciones no cambia nada.
- **Qué se hace con él antes de que llegue.** No se estima a quién votarán (los nombres de las candidaturas cambian de
  una elección a otra). Se calcula una cota de riesgo, `votosCeraNecesarios`: los votos CERA mínimos con los que el
  reparto de esa circunscripción podría cambiar si **todos** fueran a una sola candidatura. Si es mayor que los votos
  CERA esperados (`estimarVotosCera`: votos válidos CERA de 2023 × crecimiento del censo CERA × margen de 1,5 por si
  sube la participación), el CERA no puede decidir ese escaño. La tabla de disputa marca las filas donde sí podría.
- **Contraste.** Los tests reproducen con los votos oficiales de 2023 (residentes + CERA) los escaños de las **52
  circunscripciones** y los 350 escaños. Los datos se obtienen de Infoelectoral y el CERA de cada circunscripción sale de
  restar a su total la suma de sus municipios; ver `scripts/generales2023_a_json.py` y `data/README.md`.

## Tabla de las 10 circunscripciones en disputa

Por circunscripción se calcula el **porcentaje de votos válidos que tendrían que cambiar de bando** para que el reparto
cambie, y se muestran las 10 con el porcentaje más bajo.

- **Por escaño.** A es la candidatura con el último escaño asignado (menor cociente adjudicado) y B la mejor sin
  escaño distinta de A. Votos que deben pasar de A a B:
  `x = [vA·(sB+1) − vB·sA] / (sA + sB + 1)`, con `sA`, `sB` sus escaños actuales. Sale de igualar
  `(vB + x)/(sB+1)` con `(vA − x)/sA`. En Ceuta y Melilla queda `(vA − vB)/2`.
- **Por barrera.** Para una candidatura bajo el 3 % que, al alcanzarlo, obtendría escaño: votos que le faltan para el
  3 %. Se ignora cómo afecta ese trasvase al resto.
- **Una fila por circunscripción:** la de menor porcentaje de las dos.
- Se mide sobre votos válidos, así que **no depende del factor de extrapolación**.
- La fórmula se contrasta en los tests con una búsqueda por fuerza bruta que mueve votos de uno en uno.
- **Riesgo CERA** (opcional, mientras el voto exterior no esté escrutado): cada fila indica los votos CERA necesarios
  para cambiar el reparto, los esperados y si el CERA podría decidirlo. Es una cota inferior: con menos votos CERA
  que la cota es imposible; con más, solo es posible.
- **Solo entran las circunscripciones donde aún puede haber vuelco** (`posibilidadVuelco`). Se comparan los votos
  reales que harían falta para cambiar el reparto con los que como mucho pueden llegar:
  - *Necesarios*: los de la cota de `votosCeraNecesarios` (todos a una sola candidatura, lo más favorable al cambio),
    pasados de votos proyectados a reales dividiendo por el factor de extrapolación.
  - *Pendientes*: los electores de las mesas sin escrutar (`censo − censo escrutado`, como si todos votaran) más, mientras
    no esté escrutado, el voto exterior esperado (`estimarVotosCera`; es una estimación, no una cota).
  - Si los pendientes no llegan a los necesarios, el reparto ya no puede cambiar y la circunscripción sale de la tabla.
    Con los pendientes justos se considera que aún puede haberlo. Una circunscripción que aún no da datos **no** se
    descarta (no se sabe), solo se omite.
  - Para el voto residente la cota es rigurosa: no puede descartar un cambio real. Se contrasta en los tests con 600
    escenarios adversos (todos los votos pendientes a una candidatura o repartidos) y con la simulación de 2023.
- **Qué pretende la tabla y qué no (decidido el 24-nov-2026).** No intenta recoger todos los cambios posibles, sino los
  más probables: es una herramienta para seguir la noche con tensión. Por eso se mantienen las **10 filas** y el orden
  por porcentaje de votos a mover, sin tener en cuenta cuánto censo falta por escrutar. **No lleva aviso de
  provisionalidad** (ya se sabe que lo es). En la simulación se probaron una sola vez (sin script que lo reproduzca)
  otras dos salidas, y se descartaron: reordenar por incertidumbre (mejoraba entre 0 y 7 puntos lo que recoge la tabla) y
  ampliar a 15 o 20 filas (recogía bastante más, pero con tablas más largas y filas menos probables).
- **Cómo se presenta (`construirTablaDisputa`).** La tabla indica que corresponde al **x % del censo escrutado en toda
  España** (`porcentajeEscrutadoGlobal`, de `porcentajeCensoNacional`) y cada fila muestra el **% escrutado de su
  circunscripción** (`porcentajeCenso`). Tiene tres estados (los textos están en `apps/web/src/lib/recuento/tabla.ts`):
  - `normal`: hasta 10 filas, sin nota. Al principio de la noche tiene menos filas porque faltan datos, pero no es
    `reducida`: ese estado solo lo provocan circunscripciones descartadas.
  - `reducida`: ya hay circunscripciones descartadas y quedan menos de 10 con opción de vuelco (con 52, más de 42
    descartadas). Nota: *«La tabla tiene N filas en lugar de 10: en M circunscripciones los votos que faltan por escrutar ya no
    bastan para cambiar el reparto.»* (con una fila: *«La tabla tiene una fila…»*).
  - `sin-vuelco`: ninguna circunscripción puede ya cambiar de reparto. **No se muestra la tabla** y aparece: *«Ya no se
    incluye la tabla de circunscripciones en disputa: no hay opción de vuelco en ninguna circunscripción.»*
  - **El escaño que cambia** se muestra como *«PSOE → PP»* (origen → destino), cada candidatura con el color de su
    agrupación y su nombre al lado (el color nunca va solo). La frase completa («Un escaño de PSOE pasaría a PP») queda
    solo para lectores de pantalla. Si es por barrera se añade «Entra al alcanzar el 3 %», y si no hay una candidatura
    concreta que pierda el escaño el origen es «Otra candidatura», en gris. El motor añade a cada fila el grupo de las
    dos candidaturas (`VistaFilaDisputa`) para que la web no necesite conocer las agrupaciones. En pantallas estrechas
    origen y destino se apilan.
  - **Aviso «solo el voto exterior»**: una fila lleva *«Solo el voto exterior, que se escruta días después, podría
    cambiarlo»* cuando los votos de residentes que faltan ya no bastan para el cambio y solo lo permite sumar el voto
    exterior esperado. Mientras los residentes por sí solos pueden cambiarlo, el aviso no informa de nada y no sale.
  - En 2023, con el recuento residente completo y el voto exterior aún sin escrutar, la tabla conserva solo las
    circunscripciones que el CERA podría decidir (Madrid entre ellas, que de hecho cambió); al sumar el CERA, queda
    `sin-vuelco` (test).

## Simulación de una noche electoral y backtest

Para construir y probar la web sin la fuente en vivo (`simulacion.ts`) y para medir cuánto se equivoca la proyección
(`backtest.ts`), el motor reproduce una noche electoral a partir de los resultados oficiales de las generales de 2023
por municipio (`data/simulacion/generales-2023-municipios.json`: 8.131 municipios, 60.314 mesas, solo voto residente).
Produce lo mismo que entregará la fuente real: un `Escrutinio` por circunscripción (censo, censo escrutado, blancos y
votos por candidatura) en cada instante. Es **un modelo, no una reconstrucción de lo que pasó esa noche**:

- **Los datos oficiales no llegan al nivel de mesa** (no los hemos encontrado). Cada municipio se reparte a partes
  iguales entre sus mesas, con enteros y sin perder ni inventar ni un voto. Dentro de un municipio no hay diferencias
  entre mesas, así que la proyección sale **más fácil que la real**: las cifras de abajo son un suelo optimista.
- **El orden de llegada de los municipios de cada provincia es una hipótesis:** `aleatorio` (una muestra al azar),
  `rurales-primero` (de menor a mayor población, con ruido) o `urbanos-primero` (al revés, prueba de estrés).
- **La velocidad del escrutinio es una curva inventada** (Weibull): cada provincia empieza con un retraso y una
  velocidad propios. Con los valores por defecto el escrutinio ronda el 45 % del censo a las 21:30, el 94 % a las
  23:00 y el 99 % a medianoche. No es una medición de ninguna noche real; se cambiará cuando haya datos reales.
- Todo es determinista: misma semilla, misma noche (`crearAzar`, mulberry32).
- El escrutinio final de la simulación reproduce los votos oficiales de cada circunscripción; con el CERA sumado, los
  350 escaños de 2023 (test).

**Backtest.** Compara la proyección de cada instante con el resultado final **de la misma simulación** (100 % del
censo residente, sin CERA): mide el error de la extrapolación, no el del voto exterior que llega después. Resultados
con 20 noches simuladas (semillas 1-20) por orden de llegada; se regenera con
`INFORME_BACKTEST=1 pnpm --filter @elecciones/engine exec vitest run test/informe-backtest.test.ts`:

| Orden de llegada | Censo escrutado | Circunscripciones con reparto distinto del final (mediana / máx.) | De ellas, fuera de la tabla de disputa (máx.) | Minuto en que se estabiliza (mediana / máx.) | % de censo al que la tabla se reduce / se queda sin filas (mediana) |
|---|---|---|---|---|---|
| aleatorio | 50 % | 10 / 15 | 9 | 240 / 285 | 99,5 % / 100 % |
|  | 75 % | 6 / 13 | 7 |  |  |
|  | 90 % | 3 / 5 | 1 |  |  |
|  | 95 % | 1 / 4 | 0 |  |  |
|  | 99 % | 1 / 2 | 0 |  |  |
| rurales-primero | 50 % | 12 / 15 | 10 | 182,5 / 250 | 99,5 % / 100 % |
|  | 75 % | 6 / 9 | 5 |  |  |
|  | 90 % | 1 / 4 | 2 |  |  |
|  | 95 % | 0 / 2 | 0 |  |  |
|  | 99 % | 0 / 1 | 0 |  |  |
| urbanos-primero | 50 % | 17,5 / 20 | 13 | 240 / 285 | 99,4 % / 100 % |
|  | 75 % | 11 / 12 | 6 |  |  |
|  | 90 % | 5 / 6 | 1 |  |  |
|  | 95 % | 2 / 3 | 1 |  |  |
|  | 99 % | 1 / 2 | 0 |  |  |

(«Minuto» = minutos desde las 20:00, cuando ya están todas las circunscripciones con datos y ningún reparto cambia
después. «Censo escrutado» es el nacional, con las 52 circunscripciones dando datos.)

Qué se desprende, **sobre la simulación**:

- Hasta que se supera el 90 % del censo, el reparto de bastantes circunscripciones todavía cambia (hasta 15-20 de 52 a
  mitad de escrutinio). La web tiene que enseñar siempre el % escrutado y no presentar esas cifras como firmes.
- **La tabla de las 10 circunscripciones en disputa se queda corta al principio:** con el 50 % del censo deja fuera
  hasta 9-13 de las que acabarán cambiando y con el 75 %, hasta 5-7, porque ordena por votos a mover sin tener en
  cuenta que, con poco censo escrutado, la proyección es menos fiable. A partir del 90-95 % ya las recoge casi todas
  (se le escapan 0-2). Qué se hace con ello: ver el apartado de la tabla, más arriba.
- Si los municipios grandes llegan antes, la proyección a mitad de noche es peor que con orden aleatorio.
- **El criterio de vuelco no descartó ningún cambio real** (sin CERA; en 20 noches por orden, cada 2 minutos: 0 de unas 57.000
  observaciones de una circunscripción con reparto distinto del final; el informe aborta si descarta alguno). Pero
  descarta muy tarde: **la tabla mantiene sus filas hasta el ~99,5 % del censo** y solo entonces se reduce, y se queda
  sin filas al llegar al 100 %. Con el 90 % del censo escrutado hay una mediana de 6-8 circunscripciones descartadas, y
  con el 99 %, 37-38. Usar la participación observada en lugar de «vota todo el censo pendiente» (medido una vez, con
  margen de 1 a 1,5) apenas lo adelanta: la tabla se reduce igualmente hacia el 99,2-99,5 %.

## Paneles del recuento y modo de simulación

La web no calcula nada: dibuja una `VistaRecuento` (datos planos que construye el motor con `construirVista`; se puede
guardar como JSON). Los paneles son funciones puras de esa vista (`apps/web/src/lib/recuento`, con tests), así que los
mismos dibujos sirven para la simulación y, cuando exista, para la fuente en vivo (un `recuento.json` generado por Actions).

- **Paneles:** resumen (% de censo escrutado y escaños asignados), dos sectores de escaños (por formación y con las
  formaciones de un mismo partido sumadas, con su texto `incluye`), dos mapas (grupo más votado de cada circunscripción y
  círculos de escaños por formación), tabla de disputa y tabla de las 52 circunscripciones.
- **Color.** Un color por agrupación (`apps/web/src/data/colores.json`); las formaciones de un mismo grupo se distinguen
  aclarando el tono. El color nunca va solo: todo lleva su nombre y su cifra. El «ganador» de una circunscripción es el
  grupo con más votos proyectados, no el de más escaños (con pocos escaños los empates son habituales).
- **Mapa.** Natural Earth (dominio público) proyectado con una cónica conforme de Lambert; Canarias en un recuadro con la
  misma escala; Ceuta y Melilla, minúsculas, se dibujan como un círculo con rótulo. Ver `data/README.md`.
- **Ejemplo de recuento (`/simulacion/`).** Está en el histórico (`/historico/`, que luego guardará las elecciones pasadas) y
  enlazado desde la cabecera y el pie de todas las páginas. Reproduce una noche con los datos de 2023 (ver el apartado anterior). El build
  precalcula una vista cada 5 minutos para cada orden de llegada (`noche-<orden>.json`, ≈1,6 MB cada uno, ≈100 KB
  comprimidos) y la página los reproduce con deslizador, play/pausa, velocidad y orden. Lleva un aviso fijo de que **no son
  resultados de 2026**. Sin JavaScript se ve el momento de las 21:30. En 2023 se usan los escaños y siglas de 2023, con
  dos alias (Junts y Coalición Canaria) y sin el texto `incluye` de 2026.
- **Vista previa en la portada y en el histórico.** La portada de la fase previa y la tarjeta del histórico reutilizan los
  mismos dibujos (diagrama de sectores y mapa del grupo más votado) con el momento con el que se abre el ejemplo (las
  21:30 de la noche simulada), calculado en el build. Siempre van etiquetados como «Ejemplo», con datos de 2023.
- **Hemiciclo.** `lib/recuento/hemiciclo.ts` dibuja los 350 escaños en arcos concéntricos, ordenados de izquierda a
  derecha. La portada lo muestra sin repartir, con la línea de la mayoría absoluta (176) en el centro; sin grupos todo es
  gris y con grupos colorea los escaños de izquierda a derecha, para poder usarlo también con datos del recuento.
- **Qué se ve al final de la simulación.** Con el 100 % de los residentes escrutado y el CERA esperado, la tabla de
  disputa conserva 10 filas, todas con el aviso «solo el voto exterior»: en la simulación nunca llega a los estados
  `reducida` ni `sin-vuelco` (esos estados están cubiertos por tests con datos fabricados, y por el backtest sin CERA).

## Anuncios

- **Qué hay y dónde.** Banner adaptable al pie de cada página y dos laterales de 160 × 600 desde 1.400 px de ancho
  (columna de 60 rem + 2 × 160 px + márgenes), fijos al hacer scroll y ocultos por debajo. Nunca dentro de un panel ni de
  la tabla. Cada bloque lleva el rótulo «Publicidad». Los laterales no piden anuncio si no caben (`scripts/anuncios.ts`).
- **Inactivo por defecto.** Sin `ADSENSE_CLIENT` no se carga ningún script de terceros, no hay cookies y `ads.txt` es un
  comentario. Solo con `ADSENSE_CLIENT` (**modo verificación**) se añade la etiqueta `<meta name="google-adsense-account">` y
  `ads.txt` con el ID de editor, que es lo que AdSense usa para verificar el sitio; sigue sin haber script, anuncios ni cookies,
  y no se exigen los datos del titular (sí hacen falta antes de pedir la revisión, porque AdSense espera ver un aviso legal). Una configuración a medias o mal escrita hace fallar la construcción en lugar de publicar un anuncio roto.
- **Titular obligatorio.** Con anuncios hay actividad económica y la LSSI exige identificar al titular; sin sus datos
  (`titular.json`) la web no se construye.
- **Consentimiento.** Google exige un gestor de consentimiento certificado para servir anuncios personalizados en la UE
  y el Reino Unido (desde el 16-ene-2024); se usa el de AdSense («Privacy & messaging»), que se configura en su panel y
  se carga con el mismo script de AdSense. El botón «Preferencias de publicidad» solo aparece si Google ofrece el mensaje
  de revocación (`googlefc.showRevocationMessage`); **no está comprobado con una cuenta real**.
- **Sin comprobar todavía (necesitan cuenta y dominio):** que AdSense acepte el sitio, que cargue el mensaje de
  consentimiento, el botón de preferencias y si `ads.txt` debe repetirse en `jerrygit.com` con `subdomain=`.
- **Alojamiento.** Las normas de GitHub Pages no prohíben los anuncios de forma expresa, pero tampoco permiten sitios
  dirigidos principalmente a transacciones comerciales; un sitio de contenido con anuncios queda en zona gris.
- La política de privacidad (`/privacidad/`) no ha pasado por un abogado.

## Limitaciones conocidas

- **La extrapolación lineal supone que lo pendiente se parece a lo escrutado.** Al principio de la noche puede fallar
  (el orden del escrutinio no es aleatorio). Por eso cada panel debe mostrar el % de censo escrutado.
- **Voto exterior (CERA).** Hasta el escrutinio general la proyección no lo incluye y puede mover algún escaño
  (en 2023 movió uno, en Madrid). La web debe avisarlo y marcar las circunscripciones donde podría decidir.
  Las fechas del escrutinio general son las de la guía de La Moncloa, sin confirmar oficialmente.
- **El «vuelco posible» es una cota prudente.** Supone que todos los electores de las mesas sin escrutar votan, y que
  lo hacen a una sola candidatura: por eso nunca descarta un cambio real, pero mantiene en la tabla circunscripciones
  donde el cambio es prácticamente imposible. La parte del voto exterior sí es una estimación (con margen).
- **Fuente en vivo sin definir.** Interior distribuye el escrutinio provisional a medios acreditados (URL, usuario y
  contraseña por correo, ficheros ASCII con separadores). No se ha encontrado una API pública documentada.
- **Siglas.** `data/config/agrupaciones.json` usa las siglas de las listas proclamadas (BOE). Las del feed de
  resultados pueden diferir; las que no coincidan no se pierden: cuentan por separado y hay que revisarlas.
- **Agrupaciones aprobadas (23-nov-2026).** Además de las marcas territoriales de un mismo partido (PSC, PSE-EE… con el
  PSOE), se suman dos grupos de partidos distintos: **FA+COMP+UPC** (Frente Amplio con Comuns, Aramés y CHA, Compromís
  y Unidad del Pueblo Canario) y **PP**, que incluye UPN-PP (coalición en Navarra). Cada uno lleva un texto `incluye`
  que los gráficos y tablas deben mostrar junto al nombre. La agrupación solo afecta a las sumas del resumen nacional:
  el reparto de cada circunscripción se hace por candidatura, sin agrupar.

## Fases de la portada

| Fase | Desde | Qué muestra |
|---|---|---|
| `previa` | siempre | encuestas, noticias y aviso del recuento en directo |
| `recuento` | 29-nov 20:00 (cierre de colegios) | recuento en directo |
| `analisis` | se fija a mano (`inicioAnalisis`) | análisis, ya estático |

`inicioAnalisis` no se activa solo: se rellena cuando el recuento sea efectivo.

## Veda de encuestas

La LOREG (art. 69.7) prohíbe publicar, difundir o reproducir sondeos en los 5 días anteriores a la votación, hasta el
cierre de los colegios. Al ser domingo, empieza el martes 24 a las 00:00. La portada no enlaza encuestas durante la veda:
se omiten al construir y el script de cliente las retira si la página se construyó antes. Antes de la veda se enlazan
encuestas ya publicadas, siempre con su fecha (un test lo exige); no hay ninguna URL de encuesta en el HTML de la veda.
Que una fuente siga en línea durante la veda no prueba que la norma permita enlazarla. Esto es una lectura
razonable de la norma, no asesoramiento jurídico: conviene revisarla.

## Fuentes

- RD 806/2026, de 5 de octubre (BOE-A-2026-20742): convocatoria y escaños por circunscripción.
- Guía de La Moncloa sobre el 29N (06/11/2026): horarios, escrutinio general (4–7 dic), constitución de las Cortes.
- Web oficial de las elecciones, <https://29neleccionesgenerales.es/>: candidaturas proclamadas al Congreso.
- Ministerio del Interior, Infoelectoral, <https://infoelectoral.interior.gob.es/>: resultados oficiales de las generales
  de julio de 2023 (por circunscripción y por municipio), con los que se contrasta el motor. Reutilización autorizada
  citando el origen (Ley 37/2007).
