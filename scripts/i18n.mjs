#!/usr/bin/env node
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
// Herramientas de traducción al estilo gettext, sin dependencias:
//
//   node scripts/i18n.mjs            Extrae los textos (→ locales/drawnie.pot) y actualiza cada .po
//   node scripts/i18n.mjs --check    Informa de textos sin traducir o dudosos (sale con error si hay)
//   node scripts/i18n.mjs --add fr   Crea locales/fr.po a partir de la plantilla
//
// Funciones que se extraen del código:
//   t('Texto')  tc('contexto', 'Texto')  tn('Uno', 'Varios', n)  tnc('ctx', 'Uno', 'Varios', n)  N_('Texto')
// Y en el HTML: data-i18n, data-i18n-title, data-i18n-aria-label.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePOEntries, parseHeaders, CTX_SEP } from '../src/js/i18n-core.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOCALES = path.join(ROOT, 'locales');
const POT = path.join(LOCALES, 'drawnie.pot');
const SOURCE_LOCALE = 'en';
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

const SOURCES = [
  'main.js',
  'i18n.js',
  ...fs.readdirSync(path.join(ROOT, 'src/js')).filter((f) => f.endsWith('.js')).map((f) => `src/js/${f}`),
  'src/index.html',
];

/** Reglas de plural de gettext para crear archivos nuevos. */
const PLURAL_RULES = {
  default: 'nplurals=2; plural=(n != 1);',
  fr: 'nplurals=2; plural=(n > 1);',
  'pt-BR': 'nplurals=2; plural=(n > 1);',
  ja: 'nplurals=1; plural=0;', zh: 'nplurals=1; plural=0;', ko: 'nplurals=1; plural=0;',
  ru: 'nplurals=3; plural=(n%10==1 && n%100!=11 ? 0 : n%10>=2 && n%10<=4 && (n%100<10 || n%100>=20) ? 1 : 2);',
  pl: 'nplurals=3; plural=(n==1 ? 0 : n%10>=2 && n%10<=4 && (n%100<10 || n%100>=20) ? 1 : 2);',
};

// ---------- Extracción ----------

const KEYWORDS = { t: ['id'], N_: ['id'], tc: ['ctx', 'id'], tn: ['id', 'idPlural'], tnc: ['ctx', 'id', 'idPlural'] };
const CALL = /(?<![\w$.])(tnc|tn|tc|t|N_)\(\s*/g;

/** Lee un literal de cadena JS en src[i]. Devuelve { value, end } o null si no es literal simple. */
function readString(src, i) {
  const q = src[i];
  if (q !== "'" && q !== '"' && q !== '`') return null;
  let out = '';
  for (let j = i + 1; j < src.length; j++) {
    const c = src[j];
    if (c === '\\') {
      const n = src[++j];
      const map = { n: '\n', t: '\t', r: '\r', '0': '\0' };
      if (n === 'u') {
        const hex = src[j + 1] === '{' ? src.slice(j + 2, src.indexOf('}', j)) : src.slice(j + 1, j + 5);
        out += String.fromCodePoint(parseInt(hex, 16));
        j += src[j + 1] === '{' ? hex.length + 2 : 4;
      } else if (n === '\n') { /* continuación de línea */ } else out += map[n] ?? n;
      continue;
    }
    if (q === '`' && c === '$' && src[j + 1] === '{') return null; // plantilla con variables: no se extrae
    if (c === q) return { value: out, end: j + 1 };
    if (c === '\n' && q !== '`') return null;
    out += c;
  }
  return null;
}

function lineAt(src, index) {
  let n = 1;
  for (let i = 0; i < index; i++) if (src.charCodeAt(i) === 10) n++;
  return n;
}

function extractJS(file, src, add) {
  CALL.lastIndex = 0;
  let m;
  while ((m = CALL.exec(src))) {
    const fields = KEYWORDS[m[1]];
    let i = CALL.lastIndex;
    const entry = {};
    let ok = true;
    for (let k = 0; k < fields.length; k++) {
      const str = readString(src, i);
      if (!str) { ok = false; break; }
      entry[fields[k]] = str.value;
      i = str.end;
      if (k < fields.length - 1) {
        const comma = /^\s*,\s*/.exec(src.slice(i));
        if (!comma) { ok = false; break; }
        i += comma[0].length;
      }
    }
    if (ok && entry.id) add(entry, `${file}:${lineAt(src, m.index)}`);
  }
}

function decodeEntities(s) {
  return s.replace(/&(amp|lt|gt|quot|#39);/g, (_, e) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" })[e]);
}

function extractHTML(file, src, add) {
  const re = /data-i18n(?:-title|-aria-label)?="([^"]*)"/g;
  let m;
  while ((m = re.exec(src))) if (m[1]) add({ id: decodeEntities(m[1]) }, `${file}:${lineAt(src, m.index)}`);
}

function extract() {
  const found = new Map();
  const add = (entry, ref) => {
    const key = entry.ctx ? entry.ctx + CTX_SEP + entry.id : entry.id;
    const prev = found.get(key);
    if (prev) {
      prev.refs.push(ref);
      if (entry.idPlural && !prev.idPlural) prev.idPlural = entry.idPlural;
    } else found.set(key, { ctx: entry.ctx ?? null, id: entry.id, idPlural: entry.idPlural ?? null, refs: [ref] });
  };
  for (const file of SOURCES) {
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
    if (file.endsWith('.html')) extractHTML(file, src, add);
    else extractJS(file, src, add);
  }
  return [...found.values()];
}

// ---------- Escritura de .po ----------

function quote(s) {
  const esc = (x) => x.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\t/g, '\\t').replace(/\r/g, '\\r').replace(/\n/g, '\\n');
  const parts = s.split(/(?<=\n)/);
  if (parts.length <= 1 || (parts.length === 2 && parts[1] === '')) return `"${esc(s)}"`;
  return ['""', ...parts.filter(Boolean).map((p) => `"${esc(p)}"`)].join('\n');
}

function writeEntry(e, { obsolete = false } = {}) {
  const lines = [];
  for (const c of e.comments || []) lines.push(c ? `# ${c}` : '#');
  if (!obsolete && e.refs?.length) lines.push(`#: ${e.refs.join(' ')}`);
  const flags = (e.flags || []).filter((f) => f !== 'obsolete');
  if (flags.length) lines.push(`#, ${flags.join(', ')}`);
  const fields = [];
  if (e.ctx) fields.push(`msgctxt ${quote(e.ctx)}`);
  fields.push(`msgid ${quote(e.id)}`);
  if (e.idPlural) {
    fields.push(`msgid_plural ${quote(e.idPlural)}`);
    e.strs.forEach((s, i) => fields.push(`msgstr[${i}] ${quote(s ?? '')}`));
  } else fields.push(`msgstr ${quote(e.strs[0] ?? '')}`);
  const body = fields.join('\n');
  lines.push(obsolete ? body.split('\n').map((l) => `#~ ${l}`).join('\n') : body);
  return lines.join('\n');
}

function headerText(headers) {
  return Object.entries(headers).map(([k, v]) => `${k}: ${v}\n`).join('');
}

function writePO(file, { headers, comments = [], entries, obsolete = [] }) {
  const header = { id: '', strs: [headerText(headers)], comments, refs: [], flags: [] };
  const blocks = [writeEntry(header), ...entries.map((e) => writeEntry(e)), ...obsolete.map((e) => writeEntry(e, { obsolete: true }))];
  fs.writeFileSync(file, blocks.join('\n\n') + '\n');
}

const nplurals = (headers) => Number(/nplurals\s*=\s*(\d+)/.exec(headers['Plural-Forms'] || '')?.[1] || 2);
const keyOf = (e) => (e.ctx ? e.ctx + CTX_SEP + e.id : e.id);

// ---------- Comandos ----------

function poFiles() {
  return fs.readdirSync(LOCALES).filter((f) => f.endsWith('.po')).sort();
}

function readPO(file) {
  const all = parsePOEntries(fs.readFileSync(file, 'utf8'), { obsolete: true });
  const head = all.find((e) => e.id === '' && !e.ctx);
  return {
    headers: parseHeaders(head?.strs[0]),
    comments: head?.comments || [],
    entries: all.filter((e) => e !== head),
  };
}

function updateAll() {
  const template = extract();
  fs.mkdirSync(LOCALES, { recursive: true });
  writePO(POT, {
    comments: ['Plantilla de traducciones de Drawnie. Generada con: npm run i18n', 'No la edites a mano; crea o actualiza los .po.'],
    headers: {
      'Project-Id-Version': `Drawnie ${pkg.version}`,
      'MIME-Version': '1.0',
      'Content-Type': 'text/plain; charset=UTF-8',
      'Content-Transfer-Encoding': '8bit',
      'Plural-Forms': 'nplurals=INTEGER; plural=EXPRESSION;',
    },
    entries: template.map((e) => ({ ...e, strs: e.idPlural ? ['', ''] : [''] })),
  });
  console.log(`locales/drawnie.pot: ${template.length} textos`);

  for (const f of poFiles()) {
    const file = path.join(LOCALES, f);
    const locale = f.slice(0, -3);
    const po = readPO(file);
    const old = new Map(po.entries.map((e) => [keyOf(e), e]));
    const n = nplurals(po.headers);
    let added = 0;
    const entries = template.map((tpl) => {
      const prev = old.get(keyOf(tpl));
      old.delete(keyOf(tpl));
      const isSource = locale.split('-')[0] === SOURCE_LOCALE;
      let strs;
      if (prev) {
        strs = tpl.idPlural ? Array.from({ length: n }, (_, i) => prev.strs[i] ?? '') : [prev.strs[0] ?? ''];
      } else {
        added++;
        strs = tpl.idPlural ? Array.from({ length: n }, () => '') : [''];
      }
      // En el idioma de origen, lo que falte se rellena con el propio texto (como msgen).
      if (isSource) strs = strs.map((s, i) => s || (tpl.idPlural && i > 0 ? tpl.idPlural : tpl.id));
      return {
        ...tpl,
        strs,
        comments: prev?.comments || [],
        flags: (prev?.flags || []).filter((fl) => fl !== 'obsolete'),
      };
    });
    const obsolete = [...old.values()].filter((e) => e.strs.some(Boolean));
    po.headers['Project-Id-Version'] = `Drawnie ${pkg.version}`;
    writePO(file, { headers: po.headers, comments: po.comments, entries, obsolete });
    console.log(`locales/${f}: ${added} nuevos, ${obsolete.length} obsoletos`);
  }
}

function check() {
  let problems = 0;
  for (const f of poFiles()) {
    const { entries } = readPO(path.join(LOCALES, f));
    const live = entries.filter((e) => !e.flags.includes('obsolete'));
    const missing = live.filter((e) => !e.strs.length || e.strs.some((s) => !s));
    const fuzzy = live.filter((e) => e.flags.includes('fuzzy'));
    const done = live.length - missing.length - fuzzy.length;
    console.log(`${f}: ${done}/${live.length} traducidos${missing.length ? `, ${missing.length} sin traducir` : ''}${fuzzy.length ? `, ${fuzzy.length} dudosos` : ''}`);
    for (const e of [...missing, ...fuzzy]) console.log(`   - ${e.ctx ? `[${e.ctx}] ` : ''}${JSON.stringify(e.id)}`);
    problems += missing.length + fuzzy.length;
  }
  process.exitCode = problems ? 1 : 0;
}

function addLocale(code) {
  if (!code || !/^[a-z]{2,3}(-[A-Za-z0-9]+)?$/.test(code)) {
    console.error('Uso: npm run i18n -- --add <código>   (p. ej. fr, pt-BR)');
    process.exit(1);
  }
  const file = path.join(LOCALES, `${code}.po`);
  if (fs.existsSync(file)) {
    console.error(`locales/${code}.po ya existe`);
    process.exit(1);
  }
  writePO(file, {
    comments: [`Traducción de Drawnie: ${code}`],
    headers: {
      'Project-Id-Version': `Drawnie ${pkg.version}`,
      Language: code,
      'MIME-Version': '1.0',
      'Content-Type': 'text/plain; charset=UTF-8',
      'Content-Transfer-Encoding': '8bit',
      'Plural-Forms': PLURAL_RULES[code] || PLURAL_RULES[code.split('-')[0]] || PLURAL_RULES.default,
    },
    entries: [],
  });
  updateAll();
  console.log(`Creado locales/${code}.po. Revisa "Plural-Forms" en la cabecera si el idioma lo necesita.`);
}

const args = process.argv.slice(2);
if (args.includes('--check')) check();
else if (args.includes('--add')) addLocale(args[args.indexOf('--add') + 1]);
else updateAll();
