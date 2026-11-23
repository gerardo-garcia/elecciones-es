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

| Orden de llegada | Censo escrutado | Circunscripciones con reparto distinto del final (mediana / máx.) | De ellas, fuera de la tabla de disputa (máx.) | Minuto en que se estabiliza (mediana / máx.) |
|---|---|---|---|---|
| aleatorio | 50 % | 10 / 15 | 9 | 240 / 285 |
|  | 75 % | 6 / 13 | 7 |  |
|  | 90 % | 3 / 5 | 1 |  |
|  | 95 % | 1 / 4 | 0 |  |
|  | 99 % | 1 / 2 | 0 |  |
| rurales-primero | 50 % | 12 / 15 | 10 | 182,5 / 250 |
|  | 75 % | 6 / 9 | 5 |  |
|  | 90 % | 1 / 4 | 2 |  |
|  | 95 % | 0 / 2 | 0 |  |
|  | 99 % | 0 / 1 | 0 |  |
| urbanos-primero | 50 % | 17,5 / 20 | 13 | 240 / 285 |
|  | 75 % | 11 / 12 | 6 |  |
|  | 90 % | 5 / 6 | 1 |  |
|  | 95 % | 2 / 3 | 1 |  |
|  | 99 % | 1 / 2 | 0 |  |

(«Minuto» = minutos desde las 20:00, cuando ya están todas las circunscripciones con datos y ningún reparto cambia
después. «Censo escrutado» es el nacional, con las 52 circunscripciones dando datos.)

Qué se desprende, **sobre la simulación**:

- Hasta que se supera el 90 % del censo, el reparto de bastantes circunscripciones todavía cambia (hasta 15-20 de 52 a
  mitad de escrutinio). La web tiene que enseñar siempre el % escrutado y no presentar esas cifras como firmes.
- **La tabla de las 10 circunscripciones en disputa se queda corta al principio:** con el 50 % del censo deja fuera
  hasta 9-13 de las que acabarán cambiando y con el 75 %, hasta 5-7, porque ordena por votos a mover sin tener en
  cuenta que, con poco censo escrutado, la proyección es menos fiable. A partir del 90-95 % ya las recoge casi todas
  (se le escapan 0-2). Sería razonable ordenar también por distancia relativa a la incertidumbre de la muestra
  (pendiente de decidir).
- Si los municipios grandes llegan antes, la proyección a mitad de noche es peor que con orden aleatorio.

## Limitaciones conocidas

- **La extrapolación lineal supone que lo pendiente se parece a lo escrutado.** Al principio de la noche puede fallar
  (el orden del escrutinio no es aleatorio). Por eso cada panel debe mostrar el % de censo escrutado.
- **Voto exterior (CERA).** Hasta el escrutinio general la proyección no lo incluye y puede mover algún escaño
  (en 2023 movió uno, en Madrid). La web debe avisarlo y marcar las circunscripciones donde podría decidir.
  Las fechas del escrutinio general son las de la guía de La Moncloa, sin confirmar oficialmente.
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
