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
// Secure bridge between the main process and the UI.
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('drawnie', {
  platform: process.platform,
  // Translation catalog for the active language (requested synchronously at startup).
  i18n: ipcRenderer.sendSync('i18n:catalog'),
  onLocaleChange: (handler) => ipcRenderer.on('i18n:changed', (_e, catalog) => handler(catalog)),
  save: (content, { saveAs = false, suggestedName } = {}) =>
    ipcRenderer.invoke('file:save', { content, saveAs, suggestedName }),
  exportFile: (format, data, suggestedName) =>
    ipcRenderer.invoke('file:export', { format, data, suggestedName }),
  open: () => ipcRenderer.send('app:open'),
  openDropped: (file) => ipcRenderer.send('app:open-path', webUtils.getPathForFile(file)),
  nativeEdit: (command) => ipcRenderer.send('edit:native', command),
  readClipboard: () => ipcRenderer.invoke('clipboard:read'),
  writeClipboard: (text) => ipcRenderer.send('clipboard:write', text),
  setTheme: (mode) => ipcRenderer.send('theme:set', mode),
  setDocState: (state) => ipcRenderer.send('doc:state', state),
  confirmClose: () => ipcRenderer.send('win:close-confirmed'),
  onMenu: (handler) => ipcRenderer.on('menu', (_e, command) => handler(command)),
  onFileLoad: (handler) => ipcRenderer.on('file:load', (_e, payload) => handler(payload)),
});
