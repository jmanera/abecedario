# Abecedario

Juego de palabras contra el reloj para tablet Android: una definición por cada letra, de la A a la Z
con la Ñ. La respuesta empieza por esa letra o, cuando se indica, la contiene. Es una página web
(`app/assets/`) envuelta en una app Android mínima con un WebView a pantalla completa. Funciona sin
conexión.

## Instalar en la tablet

Con la tablet conectada por USB y la depuración USB activada:

```bash
./build.sh
adb install -r Abecedario.apk
```

`build.sh` pasa primero las pruebas (`node tools/test.js`) y compila sin Gradle (usa `aapt2`,
`javac`, `d8` y `apksigner` del SDK en `~/Android/Sdk`). La primera vez crea `release.keystore`
(no se sube al repo): guárdalo, porque para actualizar la app sin desinstalarla (y sin perder
estadísticas ni la partida guardada) hay que firmar siempre con la misma clave.

## Qué incluye

- Banco propio de 517 definiciones (entre 14 y 24 por letra), pensado para toda la familia.
- Rueda con las 27 letras: azul pendiente, verde acierto, rojo fallo; la actual, en amarillo.
- Teclado en pantalla con Ñ. Las tildes no importan al responder.
- «Paso» deja la letra para la siguiente vuelta. Al fallar se ve la respuesta y el reloj se para.
- Tiempo de 2, 3, 4 o 5 minutos, o sin límite. Se puede plantar desde el menú.
- Al terminar, todas las respuestas con su definición y lo que se contestó en los fallos.
- Abecedario del día con racha; partida por número; en los demás se evitan las respuestas
  que han salido en las últimas partidas.
- Estadísticas: jugados, mejor marca, media de aciertos y abecedarios completos.
- Temas claro y oscuro; opción de mostrar el número de letras.
- La partida se guarda sola y se recupera en pausa. El botón atrás de Android pausa la partida.

## Estructura

| Ruta | Contenido |
| --- | --- |
| `app/assets/banco.js` | Definiciones: `LETRA\|E o C\|Respuesta[/otra forma]\|Definición`. |
| `app/assets/gen.js` | Elige una definición por letra y comprueba las respuestas (se prueba con Node). |
| `app/assets/app.js` | Interfaz: rueda, teclado, reloj, ventanas, ajustes, estadísticas y guardado. |
| `app/src/.../MainActivity.java` | Envoltorio Android (WebView). |
| `tools/test.js` | Comprueba el banco (que cada respuesta empiece por o contenga su letra, que la definición no la diga, repetidas) y 500 abecedarios. |

Para añadir definiciones basta con escribir más líneas en `banco.js`: `E` si la respuesta empieza
por la letra y `C` si solo la contiene. Las formas alternativas que se aceptan van separadas por `/`.

## Probar en el ordenador

```bash
python3 -m http.server 8768 -d app/assets
```

Y abrir `http://localhost:8768`. Con teclado físico: escribir, Intro para responder (vacío, para
pasar), Esc para pausar.
