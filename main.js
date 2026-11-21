/*
 * Drawnie - a whiteboard for simple, beautiful diagrams.
 * Copyright (C) 2026 Jorge Juarez <contacto@jorgejuarez.net>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 *
 * Additional attribution terms apply; see the NOTICE file.
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
// Proceso principal de Drawnie: ventanas, menú nativo y acceso a archivos.
const { app, BrowserWindow, Menu, dialog, ipcMain, nativeTheme, shell, clipboard } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');

const isMac = process.platform === 'darwin';
const FILE_FILTERS = [{ name: 'Pizarra de Drawnie', extensions: ['drawnie'] }];

/** Estado por ventana: ruta del archivo y si hay cambios sin guardar. */
const windowState = new Map();
/** Archivos que el SO pidió abrir antes de que la app estuviera lista. */
const pendingFiles = [];

function createWindow(filePath = null) {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 720,
    minHeight: 480,
    show: false,
    title: 'Drawnie',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1c1c1e' : '#f7f7f5',
    ...(isMac
      ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 16, y: 16 } }
      : { autoHideMenuBar: false }),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  windowState.set(win.id, { filePath: null, dirty: false, closing: false });

  win.loadFile(path.join(__dirname, 'src', 'index.html'), {
    query: { platform: process.platform },
  });

  win.once('ready-to-show', () => win.show());

  win.webContents.once('did-finish-load', () => {
    if (filePath) openFileInWindow(win, filePath);
  });

  // Los enlaces externos se abren en el navegador del sistema.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  win.on('close', (event) => {
    const state = windowState.get(win.id);
    if (!state || state.closing || !state.dirty) return;
    event.preventDefault();
    const choice = dialog.showMessageBoxSync(win, {
      type: 'question',
      buttons: ['Guardar', 'No guardar', 'Cancelar'],
      defaultId: 0,
      cancelId: 2,
      message: '¿Quieres guardar los cambios de esta pizarra?',
      detail: 'Si no guardas, los cambios se perderán.',
    });
    if (choice === 0) {
      win.webContents.send('menu', 'save-and-close');
    } else if (choice === 1) {
      state.closing = true;
      win.close();
    }
  });

  win.on('closed', () => windowState.delete(win.id));
  return win;
}

async function openFileInWindow(win, filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    const state = windowState.get(win.id);
    if (state) state.filePath = filePath;
    win.webContents.send('file:load', { filePath, content });
    app.addRecentDocument(filePath);
  } catch (err) {
    dialog.showErrorBox('No se pudo abrir el archivo', String(err.message || err));
  }
}

/** Abre un archivo reutilizando la ventana si está vacía, o en una nueva. */
async function openFile(filePath, preferredWin) {
  const target = preferredWin && !preferredWin.isDestroyed() ? preferredWin : null;
  if (target) {
    const isEmpty = await target.webContents
      .executeJavaScript('window.drawnieIsEmpty && window.drawnieIsEmpty()')
      .catch(() => false);
    const state = windowState.get(target.id);
    if (isEmpty && state && !state.filePath) {
      openFileInWindow(target, filePath);
      target.focus();
      return;
    }
  }
  createWindow(filePath);
}

function focusedWin() {
  return BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0] || null;
}

function send(command) {
  const win = focusedWin();
  if (win) win.webContents.send('menu', command);
}

async function promptOpen() {
  const win = focusedWin();
  const result = await dialog.showOpenDialog(win, {
    properties: ['openFile'],
    filters: FILE_FILTERS,
  });
  if (!result.canceled && result.filePaths[0]) openFile(result.filePaths[0], win);
}

function buildMenu() {
  const template = [
    ...(isMac
      ? [{
          label: app.name,
          submenu: [
            { role: 'about', label: 'Acerca de Drawnie' },
            { type: 'separator' },
            { role: 'services', label: 'Servicios' },
            { type: 'separator' },
            { role: 'hide', label: 'Ocultar Drawnie' },
            { role: 'hideOthers', label: 'Ocultar otros' },
            { role: 'unhide', label: 'Mostrar todo' },
            { type: 'separator' },
            { role: 'quit', label: 'Salir de Drawnie' },
          ],
        }]
      : []),
    {
      label: 'Archivo',
      submenu: [
        { label: 'Nueva pizarra', accelerator: 'CmdOrCtrl+N', click: () => createWindow() },
        { label: 'Abrir…', accelerator: 'CmdOrCtrl+O', click: promptOpen },
        ...(isMac ? [{ role: 'recentDocuments', label: 'Abrir recientes', submenu: [{ role: 'clearRecentDocuments', label: 'Borrar menú' }] }] : []),
        { type: 'separator' },
        { label: 'Guardar', accelerator: 'CmdOrCtrl+S', click: () => send('save') },
        { label: 'Guardar como…', accelerator: 'CmdOrCtrl+Shift+S', click: () => send('save-as') },
        { type: 'separator' },
        { label: 'Exportar como PNG…', accelerator: 'CmdOrCtrl+Shift+E', click: () => send('export-png') },
        { label: 'Exportar como SVG…', click: () => send('export-svg') },
        { type: 'separator' },
        isMac ? { role: 'close', label: 'Cerrar ventana' } : { role: 'quit', label: 'Salir' },
      ],
    },
    {
      label: 'Edición',
      submenu: [
        { label: 'Deshacer', accelerator: 'CmdOrCtrl+Z', click: () => send('undo') },
        { label: 'Rehacer', accelerator: isMac ? 'Cmd+Shift+Z' : 'Ctrl+Y', click: () => send('redo') },
        { type: 'separator' },
        { label: 'Cortar', accelerator: 'CmdOrCtrl+X', click: () => send('cut') },
        { label: 'Copiar', accelerator: 'CmdOrCtrl+C', click: () => send('copy') },
        { label: 'Pegar', accelerator: 'CmdOrCtrl+V', click: () => send('paste') },
        { label: 'Duplicar', accelerator: 'CmdOrCtrl+D', click: () => send('duplicate') },
        { label: 'Eliminar', click: () => send('delete') },
        { type: 'separator' },
        { label: 'Seleccionar todo', accelerator: 'CmdOrCtrl+A', click: () => send('select-all') },
        { type: 'separator' },
        { label: 'Traer al frente', accelerator: 'CmdOrCtrl+Shift+]', click: () => send('bring-front') },
        { label: 'Traer adelante', accelerator: 'CmdOrCtrl+]', click: () => send('bring-forward') },
        { label: 'Enviar atrás', accelerator: 'CmdOrCtrl+[', click: () => send('send-backward') },
        { label: 'Enviar al fondo', accelerator: 'CmdOrCtrl+Shift+[', click: () => send('send-back') },
      ],
    },
    {
      label: 'Visualización',
      submenu: [
        { label: 'Acercar', accelerator: 'CmdOrCtrl+=', click: () => send('zoom-in') },
        { label: 'Alejar', accelerator: 'CmdOrCtrl+-', click: () => send('zoom-out') },
        { label: 'Tamaño real', accelerator: 'CmdOrCtrl+0', click: () => send('zoom-reset') },
        { label: 'Ajustar al contenido', accelerator: 'CmdOrCtrl+1', click: () => send('zoom-fit') },
        { type: 'separator' },
        { label: 'Mostrar cuadrícula', accelerator: "CmdOrCtrl+'", click: () => send('toggle-grid') },
        { label: 'El lápiz siempre dibuja', click: () => send('toggle-pen-autodraw') },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Pantalla completa' },
        { role: 'toggleDevTools', label: 'Herramientas de desarrollo' },
      ],
    },
    {
      label: 'Ventana',
      submenu: [
        { role: 'minimize', label: 'Minimizar' },
        { role: 'zoom', label: 'Zoom' },
        ...(isMac ? [{ type: 'separator' }, { role: 'front', label: 'Traer todo al frente' }] : []),
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---------- IPC ----------

ipcMain.handle('file:save', async (event, { content, saveAs, suggestedName }) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const state = windowState.get(win.id);
  let filePath = state?.filePath;
  if (!filePath || saveAs) {
    const result = await dialog.showSaveDialog(win, {
      defaultPath: filePath || `${suggestedName || 'Pizarra'}.drawnie`,
      filters: FILE_FILTERS,
    });
    if (result.canceled || !result.filePath) return null;
    filePath = result.filePath;
  }
  await fs.writeFile(filePath, content, 'utf8');
  if (state) state.filePath = filePath;
  app.addRecentDocument(filePath);
  return filePath;
});

ipcMain.handle('file:export', async (event, { format, data, suggestedName }) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showSaveDialog(win, {
    defaultPath: `${suggestedName || 'Pizarra'}.${format}`,
    filters: [{ name: format.toUpperCase(), extensions: [format] }],
  });
  if (result.canceled || !result.filePath) return null;
  const buffer = format === 'png' ? Buffer.from(data, 'base64') : Buffer.from(data, 'utf8');
  await fs.writeFile(result.filePath, buffer);
  return result.filePath;
});

ipcMain.on('doc:state', (event, { dirty, title }) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  const state = windowState.get(win.id);
  if (state) state.dirty = dirty;
  win.setTitle(`${title}${dirty && !isMac ? ' •' : ''} — Drawnie`);
  if (isMac) {
    win.setDocumentEdited(dirty);
    if (state?.filePath) win.setRepresentedFilename(state.filePath);
  }
});

ipcMain.on('win:close-confirmed', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  const state = windowState.get(win.id);
  if (state) state.closing = true;
  win.close();
});

ipcMain.on('app:open', () => promptOpen());

// Tema elegido desde la interfaz: afecta a todas las ventanas.
ipcMain.on('theme:set', (_event, mode) => {
  if (['light', 'dark', 'system'].includes(mode)) nativeTheme.themeSource = mode;
});

ipcMain.on('app:open-path', (event, filePath) => {
  if (typeof filePath === 'string' && filePath.endsWith('.drawnie')) {
    openFile(filePath, BrowserWindow.fromWebContents(event.sender));
  }
});

// Comandos de edición nativos (cuando se está escribiendo texto).
const NATIVE_EDIT = new Set(['undo', 'redo', 'cut', 'copy', 'paste', 'selectAll']);
ipcMain.on('edit:native', (event, command) => {
  if (NATIVE_EDIT.has(command)) event.sender[command]();
});

ipcMain.handle('clipboard:read', () => {
  const image = clipboard.readImage();
  return {
    text: clipboard.readText(),
    image: image.isEmpty() ? null : image.toDataURL(),
  };
});

ipcMain.on('clipboard:write', (_event, text) => {
  if (typeof text === 'string') clipboard.writeText(text);
});

// ---------- Ciclo de vida ----------

// macOS: doble clic en un archivo .drawnie.
app.on('open-file', (event, filePath) => {
  event.preventDefault();
  if (app.isReady()) openFile(filePath, focusedWin());
  else pendingFiles.push(filePath);
});

// Windows: una sola instancia; los archivos llegan por argv.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const file = argv.find((a) => a.endsWith('.drawnie'));
    if (file) openFile(file, focusedWin());
    else {
      const win = focusedWin();
      if (win) {
        if (win.isMinimized()) win.restore();
        win.focus();
      }
    }
  });

  app.whenReady().then(() => {
    app.setName('Drawnie');
    buildMenu();
    if (!isMac) {
      const file = process.argv.slice(1).find((a) => a.endsWith('.drawnie'));
      if (file) pendingFiles.push(path.resolve(file));
    }
    if (pendingFiles.length) pendingFiles.splice(0).forEach((f) => createWindow(f));
    else createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (!isMac) app.quit();
  });
}
