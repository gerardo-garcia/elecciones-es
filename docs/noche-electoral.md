# Noche electoral: recuento en directo

Cadena de datos: **navegador (pestaña de Infoelectoral, bucle)** → **receptor local** → `.datos-vivo/` →
**publicador** → rama `datos-vivo` → **la web lee la rama** (cada minuto, desde `raw.githubusercontent.com`; copia de
respaldo en `/datos-vivo/` del propio sitio). Ningún workflow interviene en el camino de los datos.

## Sin nadie delante (lo previsto para el 29N)

La pestaña de Infoelectoral la abre un **Firefox Developer Edition** (en `~/.local/opt/firefox-dev`, descargado de
Mozilla con firma comprobada) con un perfil propio (`~/.local/share/elecciones-es/firefox-bucle`) y una extensión
pequeña sin firmar que carga el bucle en las páginas de Infoelectoral, como si se pegara en la consola. No es un navegador
automatizado: no hay WebDriver ni control remoto, y no se oculta nada al sitio. Lo prepara
`scripts/infoelectoral/desatendido/firefox.py`.

Unidades de systemd de usuario (`scripts/infoelectoral/desatendido/systemd/`, copiadas en `~/.config/systemd/user/`):

| Temporizador | Hora | Qué hace |
|---|---|---|
| `elecciones-29n.timer` | 29-nov 19:45 | arranca receptor (sin `--definitivo`), publicador (cada 2 min) y Firefox con el bucle |
| `elecciones-portada.timer` | 29-nov 20:06 | `gh workflow run pages.yml --ref main`: la portada pasa a recuento aunque falle el cron |
| `elecciones-fin.timer` | 30-nov 03:00 | cierra Firefox (para el bucle) |

- El bucle no pide nada antes de las 20:00 y busca solo la convocatoria de 2026 (mira la lista cada 2 min hasta que
  aparezca). Su registro va a `.datos-vivo/registro.log`; la salida de Firefox, a `journalctl --user -u elecciones-firefox`.
- Receptor y publicador se reinician solos si se caen; Firefox también si termina con error.
- **Requisitos**: la sesión gráfica abierta (la pantalla puede estar bloqueada) y el ordenador encendido. Si se reinicia o
  se cierra la sesión, no hay bucle.
- **Riesgo**: si Cloudflare pide marcar una casilla, nadie la marca: el bucle falla, para y lo reintenta cada 20 min, y la
  web dice que no hay datos.
- En el perfil: extensiones sin firmar, sin pantallas de bienvenida, sin frenar temporizadores y sin la comprobación de
  red local de Firefox (que pediría permiso para enviar a `127.0.0.1` y nadie podría aceptarlo).

Ver el estado: `systemctl --user list-timers 'elecciones-*'` y `systemctl --user status 'elecciones-*'`.
Pararlo todo: `systemctl --user stop elecciones-29n.target elecciones-firefox elecciones-publicador elecciones-receptor`.

Ensayo desatendido con 2023 (sin publicar; el receptor en otra carpeta y parado el de la noche):

```sh
python3 -I scripts/infoelectoral/receptor.py --salida /tmp/ensayo &
python3 -I scripts/infoelectoral/desatendido/firefox.py --ensayo
```

## Con alguien delante (alternativa)

1. Ensayo con `202307` (en la consola, antes de pegar el bucle: `INFOELECTORAL_ID = '202307'`) de principio a fin,
   incluida la lectura de la web con `/recuento/?ensayo` (sin `?ensayo` la web ignora lo publicado antes del cierre).
2. Máquina enchufada, sin suspensión, con red estable, sesión de `gh` y de `git` con permiso de escritura en
   `datos-vivo`. Pestaña de Infoelectoral visible (no minimizada: el navegador frena las pestañas ocultas).
3. Dejar fuera datos de ensayos: empezar con un directorio limpio (`rm -rf .datos-vivo`). **Los datos de un ensayo con
   2023 nunca se usan para 2026**: el publicador se niega a subir una convocatoria que no sea de 2026 (salvo
   `--ensayo`) y la web ignora cualquier dato que no sea del Congreso de 2026 capturado tras el cierre (salvo `?ensayo`).
4. Antes de las 20:00:

```sh
python3 -I scripts/infoelectoral/receptor.py            # SIN --definitivo
python3 -I scripts/infoelectoral/publicar.py            # cada 5 min; añadir --lanzar si se quiere refrescar la copia de Pages
```

Y en la consola (F12) de la pestaña de `https://infoelectoral.interior.gob.es/`, pegar `scripts/infoelectoral/bucle.cjs`.
Firefox pide una vez permiso para hablar con `127.0.0.1`: aceptar. Una vuelta son 108 peticiones, una cada 5 s (~9 min).
`estadoInfoelectoral()` muestra vueltas, posición y fallos; `detenerInfoelectoral()` lo para.

## Si algo falla

- **El bucle dice «PARADO»** (3 fallos seguidos: espera 2 min, 10 min y para): abrir el visor en esa pestaña y ver si carga;
  si carga, volver a pegar el bucle (sin nadie delante, lo reintenta solo cada 20 min). No reintentar en ráfaga ni cambiar de IP o de cliente.
- **El receptor rechaza territorios** (se ven en la consola o en `registro.log` como `rechazadas`): mirar `.datos-vivo/rechazados/`.
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
