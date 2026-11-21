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
// Traducciones en la interfaz. El catálogo lo entrega el proceso principal.
import { createTranslator, N_ } from './i18n-core.js';

const api = window.drawnie;
let catalog = api?.i18n || { locale: 'en', pluralForms: '', messages: {} };
let tr = createTranslator(catalog);
const listeners = new Set();

export const t = (id, vars) => tr.t(id, vars);
export const tc = (ctx, id, vars) => tr.tc(ctx, id, vars);
export const tn = (one, many, n, vars) => tr.tn(one, many, n, vars);
export { N_ };
export const getLocale = () => catalog.locale;

/**
 * Traduce el HTML estático:
 *   data-i18n="Texto"          → textContent
 *   data-i18n-title="Texto"    → title
 *   data-i18n-aria-label="…"   → aria-label
 */
export function translateDOM(root = document) {
  document.documentElement.lang = catalog.locale;
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle);
  for (const el of root.querySelectorAll('[data-i18n-aria-label]')) el.setAttribute('aria-label', t(el.dataset.i18nAriaLabel));
}

/** Avisa cuando el usuario cambia de idioma desde el menú. */
export function onLocaleChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

api?.onLocaleChange?.((next) => {
  catalog = next;
  tr = createTranslator(catalog);
  translateDOM();
  for (const fn of listeners) fn(catalog.locale);
});

translateDOM();
