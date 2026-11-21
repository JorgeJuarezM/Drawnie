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
// Idiomas en el proceso principal: carga los .po de locales/, elige el idioma
// y recuerda la preferencia del usuario.
const { app } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const LOCALES_DIR = path.join(__dirname, 'locales');
const SOURCE_LOCALE = 'en'; // idioma de los msgid

let core = null;
let catalog = { locale: SOURCE_LOCALE, pluralForms: '', messages: {} };
let translator = null;
let preference = 'system';

const prefsPath = () => path.join(app.getPath('userData'), 'preferences.json');

function readPrefs() {
  try {
    return JSON.parse(fs.readFileSync(prefsPath(), 'utf8')) || {};
  } catch {
    return {};
  }
}

function writePrefs(patch) {
  const next = { ...readPrefs(), ...patch };
  try {
    fs.mkdirSync(path.dirname(prefsPath()), { recursive: true });
    fs.writeFileSync(prefsPath(), JSON.stringify(next, null, 2));
  } catch { /* sin permisos: se usará la preferencia solo en esta sesión */ }
}

/** Códigos de los .po disponibles (es, en, pt-BR…). */
function available() {
  try {
    return fs.readdirSync(LOCALES_DIR).filter((f) => f.endsWith('.po')).map((f) => f.slice(0, -3)).sort();
  } catch {
    return [SOURCE_LOCALE];
  }
}

/** Busca el mejor .po para una lista de idiomas tipo "es-MX", "en-US". */
function match(candidates) {
  const locales = available();
  const norm = (s) => s.toLowerCase().replace('_', '-');
  for (const c of candidates.filter(Boolean)) {
    const exact = locales.find((l) => norm(l) === norm(c));
    if (exact) return exact;
    const base = norm(c).split('-')[0];
    const partial = locales.find((l) => norm(l).split('-')[0] === base);
    if (partial) return partial;
  }
  return SOURCE_LOCALE;
}

function systemLocale() {
  const list = typeof app.getPreferredSystemLanguages === 'function' ? app.getPreferredSystemLanguages() : [];
  return match([...list, app.getLocale()]);
}

function loadCatalog(locale) {
  try {
    const text = fs.readFileSync(path.join(LOCALES_DIR, `${locale}.po`), 'utf8');
    const { pluralForms, messages } = core.parsePO(text);
    return { locale, pluralForms, messages };
  } catch {
    return { locale: SOURCE_LOCALE, pluralForms: '', messages: {} };
  }
}

function activate() {
  const locale = preference === 'system' ? systemLocale() : match([preference]);
  catalog = loadCatalog(locale);
  translator = core.createTranslator(catalog);
}

/** Carga el núcleo (módulo ES compartido con la interfaz) y el idioma guardado. */
async function init() {
  core = await import(pathToFileURL(path.join(__dirname, 'src', 'js', 'i18n-core.js')).href);
  const saved = readPrefs().language;
  preference = typeof saved === 'string' ? saved : 'system';
  activate();
}

/** Cambia el idioma ('system' o un código). Devuelve el catálogo nuevo. */
function setPreference(value) {
  preference = value === 'system' || available().includes(value) ? value : 'system';
  writePrefs({ language: preference });
  activate();
  return catalog;
}

/** Nombre del idioma escrito en ese mismo idioma: "Español", "English". */
function nativeName(locale) {
  try {
    const name = new Intl.DisplayNames([locale], { type: 'language' }).of(locale);
    return name.charAt(0).toLocaleUpperCase(locale) + name.slice(1);
  } catch {
    return locale;
  }
}

module.exports = {
  init,
  setPreference,
  available,
  nativeName,
  getPreference: () => preference,
  getCatalog: () => catalog,
  getLocale: () => catalog.locale,
  t: (...a) => translator.t(...a),
  tc: (...a) => translator.tc(...a),
  tn: (...a) => translator.tn(...a),
};
