# Noche electoral: recuento en directo

Cadena de datos: **navegador (pestaña de Infoelectoral, bucle)** → **receptor local** → `.datos-vivo/` →
**publicador** → rama `datos-vivo` → **la web lee la rama** (cada minuto, desde `raw.githubusercontent.com`; copia de
respaldo en `/datos-vivo/` del propio sitio). Ningún workflow interviene en el camino de los datos.

## Antes (con margen, no el mismo día)

1. Confirmar en el visor el código de la convocatoria del 29N. El bucle usa `202611` por defecto (el código es `AAAAMM`,
   como `202307`), pero el 26-nov todavía no estaba en la lista de convocatorias: comprobarlo cuando aparezca. Si es otro,
   escribir en la consola antes de pegar el bucle: `INFOELECTORAL_ID = 'XXXXXX'`. Tipo 2 = Congreso.
2. Ensayo completo con `202307` (2023; en la consola, antes de pegar el bucle: `INFOELECTORAL_ID = '202307'`) de principio a fin, incluida la lectura de la web con `/recuento/?ensayo`
   (sin `?ensayo` la web ignora lo publicado antes del cierre de colegios).
3. Máquina de la noche: enchufada, sin suspensión, con red estable, sesión de `gh` y de `git` con permiso de escritura
   en `datos-vivo`. Pestaña de Infoelectoral visible (no minimizada: el navegador frena las pestañas ocultas).
4. Dejar fuera datos de ensayos: empezar con un directorio limpio (`rm -rf .datos-vivo`). **Los datos de un ensayo con
   2023 nunca se usan para 2026**: el publicador se niega a subir una convocatoria que no sea de 2026 (salvo
   `--ensayo`) y la web ignora cualquier dato que no sea del Congreso de 2026 capturado tras el cierre (salvo `?ensayo`).

## Arranque (antes de las 20:00; tres terminales)

```sh
python3 -I scripts/infoelectoral/receptor.py            # SIN --definitivo
python3 -I scripts/infoelectoral/publicar.py            # cada 5 min; añadir --lanzar si se quiere refrescar la copia de Pages
```

Y en la consola (F12) de la pestaña de `https://infoelectoral.interior.gob.es/`, pegar `scripts/infoelectoral/bucle.cjs`.
Firefox pide una vez permiso para hablar con `127.0.0.1`: aceptar. Una vuelta son 108 peticiones, una cada 5 s (~9 min).
`estadoInfoelectoral()` muestra vueltas, posición y fallos; `detenerInfoelectoral()` lo para.

## Si algo falla

- **El bucle dice «PARADO»** (3 fallos seguidos: espera 2 min, 10 min y para): abrir el visor en esa pestaña y ver si carga;
  si carga, volver a pegar el bucle. No reintentar en ráfaga ni cambiar de IP o de cliente.
- **El receptor rechaza territorios** (se ven en la consola como `rechazadas`): mirar `.datos-vivo/rechazados/`.
- **La web muestra «el dato tiene N minutos»**: el publicador o el bucle están parados. Los datos de `raw` tardan hasta
  5 minutos en llegar por la caché de GitHub.
- **`raw` no responde**: la web usa sola la copia de `/datos-vivo/`; para refrescarla, `gh workflow run pages.yml --ref main`.

## Solo datos de 2026

La web no usa ningún dato de otra elección. Si a la fuente le falta algo, la circunscripción queda sin datos y la web lo
dice («No tenemos datos suficientes…»):

- **Censo de las mesas** (sin voto exterior): el conversor lo deduce de `votantesCierre` (número y porcentaje) de cada
  provincia. Sin él, no hay datos de esa circunscripción.
- **Censo escrutado**: la API no lo da (comprobado en el ensayo del 26-nov). Se estima como votantes escrutados ÷
  participación al cierre de los colegios de esta elección, y la web avisa de que es una estimación. Sin participación al
  cierre, no hay datos.
- **Voto exterior (CERA)**: no se estima el pendiente; la tabla de disputa no avisa de los escaños que solo podría mover él.

Fuente: Ministerio del Interior (Infoelectoral). Hay que citarla y mostrar la hora de actualización (ya lo hace la web).
