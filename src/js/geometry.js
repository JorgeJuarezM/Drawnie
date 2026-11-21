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
// Geometría: marcos, anclajes de conectores y trazado de líneas.

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const norm = (v) => {
  const l = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / l, y: v.y / l };
};
const f = (n) => Math.round(n * 100) / 100;

const SIDE_DIR = { top: { x: 0, y: -1 }, right: { x: 1, y: 0 }, bottom: { x: 0, y: 1 }, left: { x: -1, y: 0 } };

export function isBoxElement(el) {
  return el && (el.type === 'shape' || el.type === 'text' || el.type === 'image');
}

/** Marco lógico de un elemento (el que se usa para mover y redimensionar). */
export function frameOf(el, lookup) {
  if (el.type === 'connector') return connectorGeometry(el, lookup).bounds;
  return { x: el.x, y: el.y, w: el.w, h: el.h };
}

/** Área visible del elemento (incluye el grosor del trazo). */
export function hitBoundsOf(el, lookup) {
  if (el.type === 'ink') {
    const p = el.size / 2 + 2;
    return { x: el.x - p, y: el.y - p, w: el.w + p * 2, h: el.h + p * 2 };
  }
  return frameOf(el, lookup);
}

export function unionRects(rects) {
  if (!rects.length) return null;
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const r of rects) {
    x1 = Math.min(x1, r.x);
    y1 = Math.min(y1, r.y);
    x2 = Math.max(x2, r.x + r.w);
    y2 = Math.max(y2, r.y + r.h);
  }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

export const rectsIntersect = (a, b) =>
  a.x <= b.x + b.w && a.x + a.w >= b.x && a.y <= b.y + b.h && a.y + a.h >= b.y;

export const rectContains = (r, p, pad = 0) =>
  p.x >= r.x - pad && p.x <= r.x + r.w + pad && p.y >= r.y - pad && p.y <= r.y + r.h + pad;

export function rectFromPoints(a, b) {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}

export function distToSegment(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2 : 0;
  t = clamp(t, 0, 1);
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Zona interior donde se escribe el texto de una forma (coordenadas locales). */
export function textBox(el) {
  const { w, h } = el;
  switch (el.shape) {
    case 'ellipse':
      return { x: w * 0.15, y: h * 0.15, w: w * 0.7, h: h * 0.7 };
    case 'diamond':
      return { x: w * 0.2, y: h * 0.22, w: w * 0.6, h: h * 0.56 };
    case 'triangle':
      return { x: w * 0.24, y: h * 0.42, w: w * 0.52, h: h * 0.52 };
    case 'hexagon':
      return { x: w * 0.18, y: 8, w: w * 0.64, h: h - 16 };
    case 'cylinder': {
      const ry = cylinderRy(el);
      return { x: 10, y: ry * 2 + 4, w: w - 20, h: h - ry * 3 - 8 };
    }
    case 'sticky':
      return { x: 18, y: 16, w: w - 36, h: h - 32 };
    case 'pill':
      return { x: Math.min(h / 3, w / 4), y: 8, w: w - Math.min(h / 3, w / 4) * 2, h: h - 16 };
    default:
      return { x: 12, y: 10, w: w - 24, h: h - 20 };
  }
}

export const cylinderRy = (el) => Math.min(el.h * 0.14, el.w * 0.2, 18);

// ---------- Conectores ----------

function chooseSide(s, p) {
  const cx = s.x + s.w / 2, cy = s.y + s.h / 2;
  const dx = (p.x - cx) / Math.max(s.w, 1);
  const dy = (p.y - cy) / Math.max(s.h, 1);
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'bottom' : 'top';
}

function shapeAnchor(s, side, gap = 5) {
  const cx = s.x + s.w / 2, cy = s.y + s.h / 2;
  const inset = s.shape === 'triangle' ? s.w / 4 : 0;
  switch (side) {
    case 'top': return { x: cx, y: s.y - gap };
    case 'bottom': return { x: cx, y: s.y + s.h + gap };
    case 'left': return { x: s.x + inset - gap, y: cy };
    default: return { x: s.x + s.w - inset + gap, y: cy };
  }
}

function attached(end, lookup) {
  const s = end && end.id ? lookup(end.id) : null;
  return s && isBoxElement(s) ? s : null;
}

function refPoint(end, lookup) {
  const s = attached(end, lookup);
  if (s) return { x: s.x + s.w / 2, y: s.y + s.h / 2 };
  return { x: end.x ?? 0, y: end.y ?? 0 };
}

function resolveEnd(end, other, lookup) {
  const s = attached(end, lookup);
  if (s) {
    const side = chooseSide(s, refPoint(other, lookup));
    return { ...shapeAnchor(s, side), side };
  }
  return { x: end.x ?? 0, y: end.y ?? 0, side: null };
}

function elbowPoints(a, b) {
  const horiz = (end, other) =>
    end.side ? end.side === 'left' || end.side === 'right' : Math.abs(other.x - end.x) >= Math.abs(other.y - end.y);
  const ah = horiz(a, b), bh = horiz(b, a);
  if (ah && bh) {
    const mx = (a.x + b.x) / 2;
    return [a, { x: mx, y: a.y }, { x: mx, y: b.y }, b];
  }
  if (!ah && !bh) {
    const my = (a.y + b.y) / 2;
    return [a, { x: a.x, y: my }, { x: b.x, y: my }, b];
  }
  if (ah) return [a, { x: b.x, y: a.y }, b];
  return [a, { x: a.x, y: b.y }, b];
}

function roundedPolyline(raw, radius) {
  const pts = raw.filter((p, i) => i === 0 || dist(p, raw[i - 1]) > 0.5);
  if (pts.length < 2) return `M${f(raw[0].x)} ${f(raw[0].y)}`;
  let d = `M${f(pts[0].x)} ${f(pts[0].y)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1], cur = pts[i], next = pts[i + 1];
    const r = Math.min(radius, dist(prev, cur) / 2, dist(cur, next) / 2);
    const inDir = norm({ x: cur.x - prev.x, y: cur.y - prev.y });
    const outDir = norm({ x: next.x - cur.x, y: next.y - cur.y });
    d += ` L${f(cur.x - inDir.x * r)} ${f(cur.y - inDir.y * r)} Q${f(cur.x)} ${f(cur.y)} ${f(cur.x + outDir.x * r)} ${f(cur.y + outDir.y * r)}`;
  }
  const last = pts[pts.length - 1];
  return `${d} L${f(last.x)} ${f(last.y)}`;
}

function arrowHead(tip, dir, len) {
  const w = len * 0.82;
  const base = { x: tip.x - dir.x * len, y: tip.y - dir.y * len };
  const n = { x: -dir.y, y: dir.x };
  const l = { x: base.x + (n.x * w) / 2, y: base.y + (n.y * w) / 2 };
  const r = { x: base.x - (n.x * w) / 2, y: base.y - (n.y * w) / 2 };
  const inner = { x: tip.x - dir.x * len * 0.62, y: tip.y - dir.y * len * 0.62 };
  return `M${f(tip.x)} ${f(tip.y)} L${f(l.x)} ${f(l.y)} Q${f(inner.x)} ${f(inner.y)} ${f(r.x)} ${f(r.y)} Z`;
}

function bezierAt(a, c1, c2, b, t) {
  const mt = 1 - t;
  return {
    x: mt ** 3 * a.x + 3 * mt * mt * t * c1.x + 3 * mt * t * t * c2.x + t ** 3 * b.x,
    y: mt ** 3 * a.y + 3 * mt * mt * t * c1.y + 3 * mt * t * t * c2.y + t ** 3 * b.y,
  };
}

function polylineMid(pts) {
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += dist(pts[i - 1], pts[i]);
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const seg = dist(pts[i - 1], pts[i]);
    if (acc + seg >= total / 2) return lerp(pts[i - 1], pts[i], seg ? (total / 2 - acc) / seg : 0);
    acc += seg;
  }
  return pts[0];
}

/** Calcula todo lo necesario para dibujar un conector. */
export function connectorGeometry(el, lookup) {
  const a = resolveEnd(el.from, el.to, lookup);
  const b = resolveEnd(el.to, el.from, lookup);
  const sw = el.width || 2;
  const headLen = 7 + sw * 2.4;
  const arrows = el.arrows || 'end';
  const endHead = arrows === 'end' || arrows === 'both';
  const startHead = arrows === 'both';
  const style = el.lineStyle || 'curve';

  let d, startDir, endDir, mid, extra = [];

  if (style === 'straight') {
    endDir = norm({ x: b.x - a.x, y: b.y - a.y });
    startDir = { x: -endDir.x, y: -endDir.y };
    const a2 = startHead ? { x: a.x - startDir.x * headLen * 0.6, y: a.y - startDir.y * headLen * 0.6 } : a;
    const b2 = endHead ? { x: b.x - endDir.x * headLen * 0.6, y: b.y - endDir.y * headLen * 0.6 } : b;
    d = `M${f(a2.x)} ${f(a2.y)} L${f(b2.x)} ${f(b2.y)}`;
    mid = lerp(a, b, 0.5);
  } else if (style === 'elbow') {
    const pts = elbowPoints(a, b);
    const n = pts.length;
    endDir = norm({ x: pts[n - 1].x - pts[n - 2].x, y: pts[n - 1].y - pts[n - 2].y });
    startDir = norm({ x: pts[0].x - pts[1].x, y: pts[0].y - pts[1].y });
    const draw = pts.slice();
    if (endHead) draw[n - 1] = { x: b.x - endDir.x * headLen * 0.6, y: b.y - endDir.y * headLen * 0.6 };
    if (startHead) draw[0] = { x: a.x - startDir.x * headLen * 0.6, y: a.y - startDir.y * headLen * 0.6 };
    d = roundedPolyline(draw, 14);
    mid = polylineMid(pts);
    extra = pts;
  } else {
    const k = clamp(dist(a, b) * 0.45, 24, 180);
    let c1 = a.side ? { x: a.x + SIDE_DIR[a.side].x * k, y: a.y + SIDE_DIR[a.side].y * k } : null;
    let c2 = b.side ? { x: b.x + SIDE_DIR[b.side].x * k, y: b.y + SIDE_DIR[b.side].y * k } : null;
    if (!c1 && !c2) {
      c1 = lerp(a, b, 1 / 3);
      c2 = lerp(a, b, 2 / 3);
    } else if (!c1) c1 = lerp(a, c2, 0.5);
    else if (!c2) c2 = lerp(b, c1, 0.5);
    endDir = norm({ x: b.x - c2.x, y: b.y - c2.y });
    startDir = norm({ x: a.x - c1.x, y: a.y - c1.y });
    const a2 = startHead ? { x: a.x - startDir.x * headLen * 0.6, y: a.y - startDir.y * headLen * 0.6 } : a;
    const b2 = endHead ? { x: b.x - endDir.x * headLen * 0.6, y: b.y - endDir.y * headLen * 0.6 } : b;
    d = `M${f(a2.x)} ${f(a2.y)} C${f(c1.x)} ${f(c1.y)} ${f(c2.x)} ${f(c2.y)} ${f(b2.x)} ${f(b2.y)}`;
    mid = bezierAt(a, c1, c2, b, 0.5);
    extra = [bezierAt(a, c1, c2, b, 0.25), mid, bezierAt(a, c1, c2, b, 0.75)];
  }

  const heads = [];
  if (endHead) heads.push(arrowHead(b, endDir, headLen));
  if (startHead) heads.push(arrowHead(a, startDir, headLen));

  const pad = headLen / 2 + sw;
  const bb = unionRects([a, b, ...extra].map((p) => ({ x: p.x, y: p.y, w: 0, h: 0 })));
  const bounds = { x: bb.x - pad, y: bb.y - pad, w: bb.w + pad * 2, h: bb.h + pad * 2 };

  return { a, b, d, heads, mid, bounds };
}
