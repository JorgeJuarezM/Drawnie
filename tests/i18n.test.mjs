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
// Tests for the translation core: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parsePO, parsePOEntries, compilePlural, createTranslator } from '../src/js/i18n-core.js';

const SAMPLE = `
# Translator comment
msgid ""
msgstr ""
"Language: es\\n"
"Plural-Forms: nplurals=2; plural=(n != 1);\\n"

#: app.js:1
msgid "Save"
msgstr "Guardar"

msgctxt "verb"
msgid "Open"
msgstr "Abrir"

msgid "Open"
msgstr "Abierto"

#, fuzzy
msgid "Draft"
msgstr "Borrador dudoso"

msgid "Empty"
msgstr ""

msgid "{n} shape"
msgid_plural "{n} shapes"
msgstr[0] "{n} forma"
msgstr[1] "{n} formas"

msgid ""
"Line one\\n"
"Line two"
msgstr ""
"Línea uno\\n"
"Línea dos"

msgid "Say \\"hi\\""
msgstr "Di \\"hola\\""

#~ msgid "Old"
#~ msgstr "Viejo"
`;

test('parses headers, contexts, plurals and multiline strings', () => {
  const cat = parsePO(SAMPLE);
  const { t, tc, tn } = createTranslator(cat);
  assert.equal(cat.headers.Language, 'es');
  assert.equal(t('Save'), 'Guardar');
  assert.equal(t('Open'), 'Abierto');
  assert.equal(tc('verb', 'Open'), 'Abrir');
  assert.equal(tn('{n} shape', '{n} shapes', 1), '1 forma');
  assert.equal(tn('{n} shape', '{n} shapes', 5), '5 formas');
  assert.equal(t('Line one\nLine two'), 'Línea uno\nLínea dos');
  assert.equal(t('Say "hi"'), 'Di "hola"');
});

test('ignores fuzzy, empty and obsolete entries; falls back to the original', () => {
  const { t, tn } = createTranslator(parsePO(SAMPLE));
  assert.equal(t('Draft'), 'Draft');
  assert.equal(t('Empty'), 'Empty');
  assert.equal(t('Old'), 'Old');
  assert.equal(tn('{n} item', '{n} items', 1), '1 item');
  assert.equal(tn('{n} item', '{n} items', 3), '3 items');
});

test('returns obsolete entries on request', () => {
  const all = parsePOEntries(SAMPLE, { obsolete: true });
  const old = all.find((e) => e.id === 'Old');
  assert.ok(old.flags.includes('obsolete'));
  assert.equal(old.strs[0], 'Viejo');
});

test('replaces {placeholders}', () => {
  const { t } = createTranslator({});
  assert.equal(t('Hello {name}', { name: 'Ana' }), 'Hello Ana');
  assert.equal(t('Keep {missing}'), 'Keep {missing}');
});

test('plural rules of several languages', () => {
  const ru = compilePlural('nplurals=3; plural=(n%10==1 && n%100!=11 ? 0 : n%10>=2 && n%10<=4 && (n%100<10 || n%100>=20) ? 1 : 2);');
  assert.deepEqual([1, 2, 5, 11, 21, 22, 25].map(ru), [0, 1, 2, 2, 0, 1, 2]);
  const fr = compilePlural('nplurals=2; plural=(n > 1);');
  assert.deepEqual([0, 1, 2].map(fr), [0, 0, 1]);
  const ja = compilePlural('nplurals=1; plural=0;');
  assert.equal(ja(7), 0);
  const broken = compilePlural('nplurals=2; plural=(n !!! 1);');
  assert.equal(broken(1), 0);
  assert.equal(broken(2), 1);
});

test('project catalogs are complete and use the same placeholders', () => {
  for (const f of ['es', 'en']) {
    const text = fs.readFileSync(new URL(`../locales/${f}.po`, import.meta.url), 'utf8');
    const entries = parsePOEntries(text).filter((e) => e.id);
    assert.ok(entries.length > 50, `${f}.po has too few entries`);
    for (const e of entries) {
      assert.ok(e.strs.every(Boolean), `${f}.po: missing translation for ${JSON.stringify(e.id)}`);
      const vars = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join();
      for (const s of e.strs) assert.equal(vars(s), vars(e.id), `${f}.po: placeholders differ in ${JSON.stringify(e.id)}`);
    }
  }
});
