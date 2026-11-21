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
// Text measuring and wrapping so that SVG and the editor match.

export const FONT_FAMILY = "-apple-system, BlinkMacSystemFont, 'Segoe UI Variable Text', 'Segoe UI', system-ui, sans-serif";
export const LINE_HEIGHT = 1.3;

const ctx = document.createElement('canvas').getContext('2d');
const widthCache = new Map();

function fontString(size, bold) {
  return `${bold ? 600 : 400} ${size}px ${FONT_FAMILY}`;
}

export function measure(text, size, bold = false) {
  const key = `${size}|${bold ? 1 : 0}|${text}`;
  let w = widthCache.get(key);
  if (w === undefined) {
    ctx.font = fontString(size, bold);
    w = ctx.measureText(text).width;
    if (widthCache.size > 5000) widthCache.clear();
    widthCache.set(key, w);
  }
  return w;
}

/** Splits the text into lines that fit in maxWidth (keeps manual line breaks). */
export function wrapText(text, maxWidth, size, bold = false) {
  const out = [];
  for (const paragraph of String(text ?? '').split('\n')) {
    if (!Number.isFinite(maxWidth)) {
      out.push(paragraph);
      continue;
    }
    const words = paragraph.split(/(\s+)/);
    let line = '';
    for (const word of words) {
      const candidate = line + word;
      if (measure(candidate, size, bold) <= maxWidth || line === '') {
        if (measure(candidate, size, bold) > maxWidth && line === '') {
          // Word longer than the box: break it by characters.
          let chunk = '';
          for (const ch of word) {
            if (measure(chunk + ch, size, bold) > maxWidth && chunk) {
              out.push(chunk);
              chunk = ch;
            } else chunk += ch;
          }
          line = chunk;
        } else line = candidate;
      } else {
        out.push(line.trimEnd());
        line = word.trimStart();
      }
    }
    out.push(line.trimEnd());
  }
  return out;
}

/** Recomputes the width/height of a free text element. */
export function fitText(el) {
  const lh = el.fontSize * LINE_HEIGHT;
  if (el.autoWidth) {
    const lines = String(el.text ?? '').split('\n');
    const w = Math.max(24, ...lines.map((l) => measure(l, el.fontSize, el.bold))) + 4;
    return { ...el, w, h: Math.max(1, lines.length) * lh };
  }
  const lines = wrapText(el.text, el.w, el.fontSize, el.bold);
  return { ...el, h: Math.max(1, lines.length) * lh };
}
