# Drawnie

Pizarra infinita para crear diagramas sencillos y bonitos, inspirada en Freeform de macOS. Hecha con Electron, sin frameworks: el lienzo es SVG puro.

## Características

- **Lienzo infinito** con cuadrícula de puntos, desplazamiento (rueda, trackpad, espacio + arrastrar, dos dedos) y zoom (pellizco, ⌘/Ctrl + rueda).
- **Formas**: rectángulo, píldora, elipse, rombo, triángulo, hexágono y base de datos, con 11 estilos de color armoniosos y sombra suave.
- **Notas adhesivas** y **texto libre** (doble clic en el lienzo para escribir).
- **Conectores** que se pegan a las formas y las siguen: curvos, rectos o en ángulo; con flechas, línea discontinua y etiqueta de texto.
- **Conexión rápida**: al seleccionar una forma aparecen cuatro “+”. Haz clic para crear una forma gemela conectada, o arrastra para conectar con otra.
- **Lápiz digital**: trazo con grosor según la presión, suavizado, resaltador y borrador (incluido el extremo borrador de lápices como Surface Pen o Wacom).
  - *El lápiz siempre dibuja* (activado por defecto): con la herramienta Selección, el lápiz dibuja y el ratón o el dedo seleccionan.
  - Cuando se detecta un lápiz, el dedo selecciona y desplaza, y se ignora la palma mientras el lápiz toca la pantalla.
- Guías de alineación al mover, redimensionar varios elementos a la vez, orden de capas, duplicar con ⌥/Alt + arrastrar.
- Imágenes: arrastrar y soltar, pegar o insertar desde la barra.
- Deshacer y rehacer, copiar y pegar entre pizarras, exportar a **PNG** o **SVG**.
- Archivos `.drawnie` (JSON) asociados a la app, varias ventanas, modo claro y oscuro automáticos.

## Desarrollo

```bash
npm install
npm start
```

> Si `npm start` falla con `Cannot find module 'electron'` dentro de VS Code, es porque la variable `ELECTRON_RUN_AS_NODE` está definida en ese entorno. Ejecuta `env -u ELECTRON_RUN_AS_NODE npm start` o usa una terminal normal.

## Distribución

```bash
npm run dist:mac   # .dmg y .zip para Apple Silicon (arm64) e Intel (x64)
npm run dist:win   # instalador NSIS para x64 y arm64
npm run dist       # ambos
```

Los paquetes quedan en `dist/`.

- **Icono**: se genera desde `build/icon.svg` con `npm run icon`, que escribe `build/icon.png`. electron-builder crea a partir de él el `.icns` y el `.ico`.
- **Firma en macOS**: sin certificado, la app no queda firmada y Gatekeeper la bloquea la primera vez (clic derecho → Abrir). Para distribuirla, define `CSC_LINK` / `CSC_KEY_PASSWORD` y configura la notarización (`APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`).
- **Windows desde macOS**: el instalador NSIS se puede generar desde macOS. Para firmarlo con Authenticode conviene compilar en Windows o en CI.

## Atajos

| Tecla | Acción | Tecla | Acción |
|---|---|---|---|
| V | Seleccionar | P | Pluma |
| H / Espacio | Mover lienzo | M | Resaltador |
| R / O | Rectángulo / Elipse | E | Borrador |
| S | Nota adhesiva | Enter | Editar texto |
| T | Texto | Supr / ⌫ | Eliminar |
| A | Conector | Flechas | Mover (⇧ = 10 px) |
| ⌘/Ctrl + D | Duplicar | ⌘/Ctrl + 0 / 1 | 100 % / Ajustar |
| ⌘/Ctrl + ] / [ | Adelante / Atrás | ⌘/Ctrl + ⇧ + E | Exportar PNG |

Mantén ⇧ para conservar proporciones y ⌘/Ctrl para desactivar las guías al mover.

## Estructura

```
main.js            Proceso principal: ventanas, menú nativo, archivos, portapapeles
preload.js         Puente seguro (contextIsolation + sandbox)
src/index.html     Interfaz
src/styles.css     Estilos (claro/oscuro)
src/js/app.js      Estado, herramientas, gestos, historial, inspector
src/js/render.js   Elementos → SVG (pantalla y exportación)
src/js/geometry.js Marcos, anclajes y trazado de conectores
src/js/ink.js      Trazos sensibles a la presión
src/js/text.js     Medición y ajuste de texto
src/js/palette.js  Colores y medidas
src/js/icons.js    Iconos
```
