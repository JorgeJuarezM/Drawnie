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
// gettext-style translation core: .po parsing, plurals and formatting.
// No dependencies and no disk access: used by the main process, the UI and the scripts.

/** Standard gettext separator between context (msgctxt) and msgid. */
export const CTX_SEP = '\u0004';

const keyOf = (ctx, id) => (ctx ? ctx + CTX_SEP + id : id);

function unescapePO(s) {
  return s.replace(/\\(["\\abfnrtv]|[0-7]{1,3})/g, (_, c) => {
    const map = { '"': '"', '\\': '\\', a: '\x07', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t', v: '\v' };
    return c in map ? map[c] : String.fromCharCode(parseInt(c, 8));
  });
}

/**
 * Parses a .po file and returns its entries as they are, with comments and flags.
 * Obsolete entries (#~) are skipped unless { obsolete: true } is passed,
 * in which case they are included with the "obsolete" flag.
 */
export function parsePOEntries(text, { obsolete = false } = {}) {
  const entries = [];
  let cur = null;
  let field = null; // { name, index }

  const start = () => {
    if (!cur) cur = { ctx: null, id: null, idPlural: null, strs: [], flags: [], comments: [], extracted: [], refs: [] };
    return cur;
  };
  const flush = () => {
    if (cur && cur.id !== null) entries.push(cur);
    cur = null;
    field = null;
  };
  const append = (value) => {
    if (!cur || !field) return;
    if (field.name === 'msgstr') cur.strs[field.index] = (cur.strs[field.index] ?? '') + value;
    else cur[field.name] = (cur[field.name] ?? '') + value;
  };

  for (const raw of text.split(/\r?\n/)) {
    let line = raw.trim();
    if (!line) { flush(); continue; }
    let isObsolete = false;
    if (line.startsWith('#~')) {
      if (!obsolete) continue;
      line = line.slice(2).trim();
      isObsolete = true;
    }
    if (line.startsWith('#')) {
      // A comment after msgstr starts a new entry.
      if (cur && cur.id !== null && field) flush();
      const e = start();
      if (line.startsWith('#,')) e.flags.push(...line.slice(2).split(',').map((f) => f.trim()).filter(Boolean));
      else if (line.startsWith('#:')) e.refs.push(...line.slice(2).trim().split(/\s+/).filter(Boolean));
      else if (line.startsWith('#.')) e.extracted.push(line.slice(2).trim());
      else if (!line.startsWith('#|')) e.comments.push(line.slice(1).replace(/^ /, ''));
      continue;
    }
    const m = line.match(/^(msgctxt|msgid_plural|msgid|msgstr(?:\[(\d+)\])?)\s+"(.*)"$/);
    if (m) {
      const [, kw, idx, value] = m;
      if ((kw === 'msgctxt' || kw === 'msgid') && cur && cur.id !== null && field?.name !== 'ctx') flush();
      const e = start();
      if (kw === 'msgctxt') field = { name: 'ctx' };
      else if (kw === 'msgid') field = { name: 'id' };
      else if (kw === 'msgid_plural') field = { name: 'idPlural' };
      else field = { name: 'msgstr', index: idx ? Number(idx) : 0 };
      if (field.name !== 'msgstr') e[field.name] = '';
      if (isObsolete && !e.flags.includes('obsolete')) e.flags.push('obsolete');
      append(unescapePO(value));
      continue;
    }
    const cont = line.match(/^"(.*)"$/);
    if (cont) append(unescapePO(cont[1]));
  }
  flush();
  return entries;
}

/** Turns the header text ("Key: value\n…") into an object. */
export function parseHeaders(text) {
  const headers = {};
  for (const line of String(text || '').split('\n')) {
    const i = line.indexOf(':');
    if (i > 0) headers[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return headers;
}

/**
 * Parses a .po file into a catalog ready for translating:
 * { headers, pluralForms, messages: { key: [msgstr, …] } }.
 * Empty translations and those flagged "fuzzy" are ignored.
 */
export function parsePO(text) {
  const entries = parsePOEntries(text);
  const messages = {};
  let headers = {};
  for (const e of entries) {
    if (e.id === '' && !e.ctx) {
      headers = parseHeaders(e.strs[0]);
      continue;
    }
    if (e.flags.includes('fuzzy')) continue;
    if (!e.strs.some((s) => s)) continue;
    messages[keyOf(e.ctx, e.id)] = e.strs;
  }
  return { headers, pluralForms: headers['Plural-Forms'] || '', messages };
}

// ---------- Plurals ----------
// The "Plural-Forms" expression is C (e.g. "n != 1" or the Russian one).
// It is evaluated by a small parser: no eval, which the CSP forbids.

const TOKEN = /\s*(\d+|n|&&|\|\||[=!<>]=|[-+*/%<>!?:()])/y;

function tokenize(src) {
  const tokens = [];
  TOKEN.lastIndex = 0;
  let m;
  while (TOKEN.lastIndex < src.length && (m = TOKEN.exec(src))) tokens.push(m[1]);
  if (src.slice(TOKEN.lastIndex).trim()) throw new Error(`Invalid Plural-Forms: ${src}`);
  return tokens;
}

const BINARY = [
  ['||'], ['&&'], ['==', '!='], ['<', '>', '<=', '>='], ['+', '-'], ['*', '/', '%'],
];
const OPS = {
  '||': (a, b) => +(a || b), '&&': (a, b) => +(a && b), '==': (a, b) => +(a === b), '!=': (a, b) => +(a !== b),
  '<': (a, b) => +(a < b), '>': (a, b) => +(a > b), '<=': (a, b) => +(a <= b), '>=': (a, b) => +(a >= b),
  '+': (a, b) => a + b, '-': (a, b) => a - b, '*': (a, b) => a * b,
  '/': (a, b) => (b ? Math.trunc(a / b) : 0), '%': (a, b) => (b ? a % b : 0),
};

function parseExpr(tokens) {
  let i = 0;
  const peek = () => tokens[i];
  const next = () => tokens[i++];
  const expect = (t) => { if (next() !== t) throw new Error(`Expected "${t}" in Plural-Forms`); };

  const ternary = () => {
    const cond = binary(0);
    if (peek() !== '?') return cond;
    next();
    const a = ternary();
    expect(':');
    const b = ternary();
    return (n) => (cond(n) ? a(n) : b(n));
  };
  const binary = (level) => {
    if (level >= BINARY.length) return unary();
    let left = binary(level + 1);
    while (BINARY[level].includes(peek())) {
      const op = OPS[next()];
      const l = left, r = binary(level + 1);
      left = (n) => op(l(n), r(n));
    }
    return left;
  };
  const unary = () => {
    if (peek() === '!') { next(); const v = unary(); return (n) => +!v(n); }
    if (peek() === '-') { next(); const v = unary(); return (n) => -v(n); }
    return primary();
  };
  const primary = () => {
    const t = next();
    if (t === '(') { const v = ternary(); expect(')'); return v; }
    if (t === 'n') return (n) => n;
    if (/^\d+$/.test(t ?? '')) { const c = Number(t); return () => c; }
    throw new Error(`Unexpected token in Plural-Forms: ${t}`);
  };

  const fn = ternary();
  if (i !== tokens.length) throw new Error('Trailing text in Plural-Forms');
  return fn;
}

/** Returns a function n → msgstr[] index. Defaults to the English rule. */
export function compilePlural(pluralForms) {
  const fallback = (n) => (n === 1 ? 0 : 1);
  const m = /plural\s*=\s*([^;]+)/.exec(pluralForms || '');
  if (!m) return fallback;
  try {
    const fn = parseExpr(tokenize(m[1]));
    return (n) => Number(fn(Math.abs(Math.trunc(n)))) || 0;
  } catch {
    return fallback;
  }
}

// ---------- Translator ----------

/** Replaces {name} with vars.name. Placeholders without a value are left as they are. */
export function format(str, vars) {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (all, k) => (k in vars ? String(vars[k]) : all));
}

/**
 * Creates the translation functions from a catalog { messages, pluralForms }.
 *  t(msgid, vars)                    → gettext
 *  tc(context, msgid, vars)          → pgettext
 *  tn(singular, plural, n, vars)     → ngettext ({n} is available in the text)
 *  tnc(context, singular, plural, n, vars)
 * When a translation is missing, the original (English) text is used.
 */
export function createTranslator(catalog = {}) {
  const messages = catalog.messages || {};
  const plural = compilePlural(catalog.pluralForms);

  const tc = (ctx, id, vars) => format(messages[keyOf(ctx, id)]?.[0] || id, vars);
  const tnc = (ctx, one, many, n, vars) => {
    const strs = messages[keyOf(ctx, one)];
    const str = strs?.[plural(n)] || (n === 1 ? one : many);
    return format(str, { n, ...vars });
  };
  return {
    t: (id, vars) => tc(null, id, vars),
    tc,
    tn: (one, many, n, vars) => tnc(null, one, many, n, vars),
    tnc,
  };
}

/** Marks a string for extraction without translating it yet (gettext_noop). */
export const N_ = (id) => id;
