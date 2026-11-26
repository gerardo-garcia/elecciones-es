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
4. Dejar fuera datos de ensayos: empezar con un directorio limpio (`rm -rf .datos-vivo`).

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

## Incógnitas que solo se resuelven con datos reales

- Si la API da el censo escrutado mientras se cuenta. Si no, la web lo **estima** con la participación de 2023 y lo avisa.
- Si `censo` sigue incluyendo el voto exterior (CERA): la web lo resta con el CERA de 2023.

Fuente: Ministerio del Interior (Infoelectoral). Hay que citarla y mostrar la hora de actualización (ya lo hace la web).
