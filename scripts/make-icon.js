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
// Genera build/icon.png (1024×1024) a partir de build/icon.svg usando Electron.
// Uso: npm run icon
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const svgPath = path.join(__dirname, '..', 'build', 'icon.svg');
const outPath = path.join(__dirname, '..', 'build', 'icon.png');

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1024,
    height: 1024,
    show: false,
    transparent: true,
    frame: false,
    webPreferences: { offscreen: true },
  });
  const svg = fs.readFileSync(svgPath, 'utf8');
  const html = `<html><body style="margin:0;background:transparent">${svg}</body></html>`;
  win.webContents.once('paint', () => {});
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  await new Promise((r) => setTimeout(r, 500));
  const image = await win.webContents.capturePage({ x: 0, y: 0, width: 1024, height: 1024 });
  const resized = image.getSize().width === 1024 ? image : image.resize({ width: 1024, height: 1024 });
  fs.writeFileSync(outPath, resized.toPNG());
  console.log(`Icono generado: ${outPath} (${resized.getSize().width}×${resized.getSize().height})`);
  app.quit();
});
