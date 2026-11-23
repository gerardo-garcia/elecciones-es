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
> absolutos que se muestran. Hay un test que lo comprueba.

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

## Limitaciones conocidas

- **La extrapolación lineal supone que lo pendiente se parece a lo escrutado.** Al principio de la noche puede fallar
  (el orden del escrutinio no es aleatorio). Por eso cada panel debe mostrar el % de censo escrutado.
- **Voto exterior (CERA).** Está por verificar cómo y cuándo se incorpora al escrutinio y si puede mover el último
  escaño. Hasta entonces, la web debe avisar de que la proyección no lo incluye.
- **Fuente en vivo sin definir.** Interior distribuye el escrutinio provisional a medios acreditados (URL, usuario y
  contraseña por correo, ficheros ASCII con separadores). No se ha encontrado una API pública documentada.
- **Siglas.** `data/config/agrupaciones.json` usa las siglas de las listas proclamadas (BOE). Las del feed de
  resultados pueden diferir; las que no coincidan no se pierden: cuentan por separado y hay que revisarlas.

## Fases de la portada

| Fase | Desde | Qué muestra |
|---|---|---|
| `previa` | siempre | encuestas, noticias y aviso del recuento en directo |
| `recuento` | 28-nov 00:00 (día de reflexión) | estado del recuento |
| `analisis` | se fija a mano (`inicioAnalisis`) | análisis, ya estático |

**Decisión pendiente:** el recuento arranca en el día de reflexión (como en el planteamiento inicial). Si se prefiere
el 29-nov, basta con cambiar `inicioRecuento` en `apps/web/src/lib/calendario.ts`.

`inicioAnalisis` no se activa solo: se rellena cuando el recuento sea efectivo.

## Veda de encuestas

La LOREG (art. 69.7) prohíbe publicar, difundir o reproducir sondeos en los 5 días anteriores a la votación, hasta el
cierre de los colegios. Al ser domingo, empieza el martes 24 a las 00:00. La portada no enlaza encuestas durante la veda:
se omiten al construir y el script de cliente las retira si la página se construyó antes. Esto es una lectura
razonable de la norma, no asesoramiento jurídico: conviene revisarla.

## Fuentes

- RD 806/2026, de 5 de octubre (BOE-A-2026-20742): convocatoria y escaños por circunscripción.
- Guía de La Moncloa sobre el 29N (06/11/2026): horarios, escrutinio general (4–7 dic), constitución de las Cortes.
- Web oficial de las elecciones, <https://29neleccionesgenerales.es/>: candidaturas proclamadas al Congreso.
