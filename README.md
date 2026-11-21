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
- **Español e inglés**, con traducciones en archivos `.po` (gettext). El idioma se cambia en *Visualización → Idioma* sin reiniciar; por defecto se usa el del sistema.

## Desarrollo

```bash
npm install
npm start
npm test          # pruebas del sistema de traducciones
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

## Traducciones

Los textos siguen el modelo de gettext: en el código se escriben en inglés y cada idioma tiene su archivo `.po` en `locales/`. Se pueden editar con cualquier editor de texto o con herramientas como Poedit, Weblate o Crowdin.

```
locales/drawnie.pot   Plantilla con todos los textos (generada, no editar)
locales/es.po         Español
locales/en.po         Inglés (permite ajustar la redacción sin tocar el código)
```

En el código:

```js
import { t, tc, tn, N_ } from './i18n.js';   // en main.js: const { t } = i18n

t('Save')                                // texto simple
t('Could not save: {error}', { error })  // con variables
tc('verb', 'Open')                       // con contexto (msgctxt)
tn('{n} shape', '{n} shapes', count)     // plurales según Plural-Forms
N_('Rectangle')                          // solo marca para extraer; se traduce después con t()
```

En el HTML se usan atributos: `data-i18n` (texto), `data-i18n-title` y `data-i18n-aria-label`.

Flujo de trabajo:

```bash
npm run i18n              # extrae los textos y actualiza drawnie.pot y cada .po (como xgettext + msgmerge)
npm run i18n:check        # lista lo que falta por traducir; sale con error si hay pendientes
npm run i18n -- --add fr  # crea locales/fr.po para un idioma nuevo (como msginit)
```

- Los textos nuevos aparecen en los `.po` con `msgstr ""`. Mientras no se traduzcan, se muestra el original en inglés.
- Las entradas marcadas `#, fuzzy` se ignoran hasta que se revisen.
- Los textos que desaparecen del código se conservan al final como obsoletos (`#~`). Si vuelven, se recupera su traducción.
- Un idioma nuevo aparece solo en el menú *Idioma* en cuanto existe su `.po`.
- La preferencia de idioma se guarda en `preferences.json`, dentro de la carpeta de datos de la app.

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
i18n.js            Idioma activo, carga de los .po y preferencia guardada
locales/           Traducciones (.pot y .po)
scripts/i18n.mjs   Extracción y actualización de traducciones
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
src/js/i18n.js     Traducciones en la interfaz (t, tn, tc, data-i18n)
src/js/i18n-core.js Lectura de .po, plurales y formato (compartido)
```
