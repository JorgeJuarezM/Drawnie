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
// Turns document elements into SVG markup (for the screen and for export).
import { connectorGeometry, textBox, cylinderRy } from './geometry.js';
import { inkOutline, inkCenterline } from './ink.js';
import { wrapText, measure, FONT_FAMILY, LINE_HEIGHT } from './text.js';
import { resolveColor } from './palette.js';

const f = (n) => Math.round(n * 100) / 100;

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export function defsMarkup() {
  return `
    <filter id="ds" x="-20%" y="-20%" width="140%" height="150%" color-interpolation-filters="sRGB">
      <feDropShadow dx="0" dy="1.5" stdDeviation="2.5" flood-color="#0b1220" flood-opacity="0.12"/>
    </filter>
    <filter id="ds-lg" x="-20%" y="-20%" width="140%" height="150%" color-interpolation-filters="sRGB">
      <feDropShadow dx="0" dy="6" stdDeviation="7" flood-color="#0b1220" flood-opacity="0.16"/>
    </filter>`;
}

function textMarkup({ text, box, fontSize, color, align = 'center', valign = 'middle', bold = false, wrap = true }) {
  if (!text) return '';
  const lines = wrapText(text, wrap ? Math.max(box.w, 1) : Infinity, fontSize, bold);
  const lh = fontSize * LINE_HEIGHT;
  const total = lines.length * lh;
  const y0 = (valign === 'top' ? box.y : box.y + (box.h - total) / 2) + lh / 2;
  const anchor = align === 'left' ? 'start' : align === 'right' ? 'end' : 'middle';
  const ax = align === 'left' ? box.x : align === 'right' ? box.x + box.w : box.x + box.w / 2;
  const spans = lines
    .map((line, i) => (line ? `<tspan x="${f(ax)}" y="${f(y0 + i * lh)}">${esc(line)}</tspan>` : ''))
    .join('');
  return `<text font-family="${FONT_FAMILY}" font-size="${fontSize}" font-weight="${bold ? 600 : 400}" fill="${color}" text-anchor="${anchor}" dominant-baseline="central" pointer-events="none" xml:space="preserve">${spans}</text>`;
}

function shapeBody(el, fill, stroke, sw) {
  const { w, h } = el;
  const common = `fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round" pointer-events="all"`;
  switch (el.shape) {
    case 'ellipse':
      return `<ellipse cx="${f(w / 2)}" cy="${f(h / 2)}" rx="${f(w / 2)}" ry="${f(h / 2)}" ${common}/>`;
    case 'diamond':
      return `<path d="M${f(w / 2)} 0 L${f(w)} ${f(h / 2)} L${f(w / 2)} ${f(h)} L0 ${f(h / 2)} Z" ${common}/>`;
    case 'triangle':
      return `<path d="M${f(w / 2)} 0 L${f(w)} ${f(h)} L0 ${f(h)} Z" ${common}/>`;
    case 'hexagon':
      return `<path d="M${f(w * 0.25)} 0 L${f(w * 0.75)} 0 L${f(w)} ${f(h / 2)} L${f(w * 0.75)} ${f(h)} L${f(w * 0.25)} ${f(h)} L0 ${f(h / 2)} Z" ${common}/>`;
    case 'cylinder': {
      const ry = cylinderRy(el);
      const body = `M0 ${f(ry)} A${f(w / 2)} ${f(ry)} 0 0 1 ${f(w)} ${f(ry)} V${f(h - ry)} A${f(w / 2)} ${f(ry)} 0 0 1 0 ${f(h - ry)} Z`;
      const rim = `M0 ${f(ry)} A${f(w / 2)} ${f(ry)} 0 0 0 ${f(w)} ${f(ry)}`;
      return `<path d="${body}" ${common}/><path d="${rim}" fill="none" stroke="${stroke === 'none' ? 'rgba(0,0,0,.18)' : stroke}" stroke-width="${sw || 1}"/>`;
    }
    case 'pill': {
      const r = Math.min(w, h) / 2;
      return `<rect width="${f(w)}" height="${f(h)}" rx="${f(r)}" ${common}/>`;
    }
    case 'sticky':
      return `<rect width="${f(w)}" height="${f(h)}" rx="3" ${common}/>`;
    default: {
      const r = Math.min(12, w / 4, h / 4);
      return `<rect width="${f(w)}" height="${f(h)}" rx="${f(r)}" ${common}/>`;
    }
  }
}

/**
 * Returns { transform, markup } for an element.
 * ctx: { lookup, theme, editingId, assets }
 */
export function elementSVG(el, ctx) {
  const { theme } = ctx;
  const editing = ctx.editingId === el.id;

  if (el.type === 'shape') {
    const fill = resolveColor(el.fill, theme);
    const sw = el.strokeWidth ?? 1.5;
    const stroke = sw > 0 && el.stroke !== 'none' ? resolveColor(el.stroke, theme) : 'none';
    const sticky = el.shape === 'sticky';
    const filter = fill === 'none' || el.shadow === false ? '' : ` filter="url(#${sticky ? 'ds-lg' : 'ds'})"`;
    let markup = `<g${filter}>${shapeBody(el, fill, stroke, sw)}</g>`;
    if (!editing) {
      markup += textMarkup({
        text: el.text,
        box: textBox(el),
        fontSize: el.fontSize,
        color: resolveColor(el.textColor, theme),
        align: el.align || (sticky ? 'left' : 'center'),
        valign: sticky ? 'top' : 'middle',
        bold: el.bold,
      });
    }
    return { transform: `translate(${f(el.x)} ${f(el.y)})`, markup };
  }

  if (el.type === 'text') {
    let markup = `<rect width="${f(el.w)}" height="${f(el.h)}" fill="transparent" pointer-events="all"/>`;
    if (!editing) {
      markup += textMarkup({
        text: el.text,
        box: { x: 0, y: 0, w: el.w, h: el.h },
        fontSize: el.fontSize,
        color: resolveColor(el.color, theme),
        align: el.align || 'left',
        valign: 'top',
        bold: el.bold,
        wrap: !el.autoWidth,
      });
    }
    return { transform: `translate(${f(el.x)} ${f(el.y)})`, markup };
  }

  if (el.type === 'ink') {
    const color = resolveColor(el.color, theme);
    const center = inkCenterline(el.points);
    const hit = `<path d="${center}" fill="none" stroke="transparent" stroke-width="${f(el.size + 10)}" stroke-linecap="round" stroke-linejoin="round" pointer-events="stroke"/>`;
    let markup;
    if (el.kind === 'highlighter') {
      const blend = theme.dark ? 'screen' : 'multiply';
      markup = `<path d="${center}" fill="none" stroke="${color}" stroke-width="${el.size}" stroke-linecap="round" stroke-linejoin="round" opacity="0.5" style="mix-blend-mode:${blend}" pointer-events="none"/>`;
    } else {
      markup = `<path d="${inkOutline(el.points, el.size)}" fill="${color}" pointer-events="none"/>`;
    }
    return { transform: `translate(${f(el.x)} ${f(el.y)})`, markup: markup + hit };
  }

  if (el.type === 'image') {
    const href = ctx.assets[el.asset] || '';
    const markup = `<g filter="url(#ds)"><image href="${esc(href)}" xlink:href="${esc(href)}" width="${f(el.w)}" height="${f(el.h)}" preserveAspectRatio="none"/></g><rect width="${f(el.w)}" height="${f(el.h)}" fill="transparent" pointer-events="all"/>`;
    return { transform: `translate(${f(el.x)} ${f(el.y)})`, markup };
  }

  if (el.type === 'connector') {
    const g = connectorGeometry(el, ctx.lookup);
    const color = resolveColor(el.color, theme);
    const sw = el.width || 2;
    const dash = el.dashed ? ` stroke-dasharray="${f(sw * 3)} ${f(sw * 2.5)}"` : '';
    let markup = `<path d="${g.d}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"${dash} pointer-events="none"/>`;
    for (const head of g.heads) {
      markup += `<path d="${head}" fill="${color}" stroke="${color}" stroke-width="1" stroke-linejoin="round" pointer-events="none"/>`;
    }
    markup += `<path d="${g.d}" fill="none" stroke="transparent" stroke-width="${Math.max(16, sw + 12)}" stroke-linecap="round" pointer-events="stroke"/>`;
    if (el.text && !editing) {
      const fs = el.fontSize || 14;
      const lines = String(el.text).split('\n');
      const tw = Math.max(...lines.map((l) => measure(l, fs, el.bold))) + 16;
      const th = lines.length * fs * LINE_HEIGHT + 8;
      const box = { x: g.mid.x - tw / 2, y: g.mid.y - th / 2, w: tw, h: th };
      markup += `<rect x="${f(box.x)}" y="${f(box.y)}" width="${f(tw)}" height="${f(th)}" rx="${f(Math.min(10, th / 2))}" fill="${theme.bg}" pointer-events="all"/>`;
      markup += textMarkup({ text: el.text, box, fontSize: fs, color, align: 'center', bold: el.bold, wrap: false });
    }
    return { transform: null, markup };
  }

  return { transform: null, markup: '' };
}

/** Standalone SVG document with the given elements. */
export function buildExportSVG(elements, bounds, ctx, background) {
  const body = elements
    .map((el) => {
      const { transform, markup } = elementSVG(el, { ...ctx, editingId: null });
      return `<g${transform ? ` transform="${transform}"` : ''}>${markup}</g>`;
    })
    .join('\n');
  const { x, y, w, h } = bounds;
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${f(w)}" height="${f(h)}" viewBox="${f(x)} ${f(y)} ${f(w)} ${f(h)}">
<defs>${defsMarkup()}</defs>
${background ? `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="${background}"/>` : ''}
${body}
</svg>`;
}
