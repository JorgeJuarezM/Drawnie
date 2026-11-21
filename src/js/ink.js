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
// Freehand strokes whose width follows the pen pressure.

const f = (n) => Math.round(n * 100) / 100;

/** Stroke radius for a given pressure (0..1). */
export function radiusFor(size, pressure) {
  const p = Math.min(1, Math.max(0, pressure));
  return (size / 2) * (0.35 + 1.3 * p);
}

function dedupe(points, minDist = 0.6) {
  const out = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) >= minDist) out.push(p);
    else last[2] = Math.max(last[2], p[2]);
  }
  return out;
}

function smoothCurve(pts, moveTo) {
  if (!pts.length) return '';
  let d = moveTo ? `M${f(pts[0][0])} ${f(pts[0][1])}` : `L${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2;
    const my = (pts[i][1] + pts[i + 1][1]) / 2;
    d += ` Q${f(pts[i][0])} ${f(pts[i][1])} ${f(mx)} ${f(my)}`;
  }
  if (pts.length > 1) {
    const last = pts[pts.length - 1];
    d += ` L${f(last[0])} ${f(last[1])}`;
  }
  return d;
}

function dot(x, y, r) {
  return `M${f(x - r)} ${f(y)} a${f(r)} ${f(r)} 0 1 0 ${f(r * 2)} 0 a${f(r)} ${f(r)} 0 1 0 ${f(-r * 2)} 0Z`;
}

/** Filled outline of the stroke (pen style). points: [[x, y, pressure], …]. */
export function inkOutline(rawPoints, size) {
  const pts = dedupe(rawPoints.map((p) => [p[0], p[1], p[2] ?? 0.5]));
  if (!pts.length) return '';
  if (pts.length === 1) return dot(pts[0][0], pts[0][1], radiusFor(size, pts[0][2]));

  // Smoothed radii to avoid abrupt width jumps.
  const radii = [];
  let r = radiusFor(size, pts[0][2]);
  for (const p of pts) {
    r = r + (radiusFor(size, p[2]) - r) * 0.45;
    radii.push(r);
  }

  const left = [], right = [];
  for (let i = 0; i < pts.length; i++) {
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(pts.length - 1, i + 1)];
    let dx = next[0] - prev[0], dy = next[1] - prev[1];
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const nx = -dy * radii[i], ny = dx * radii[i];
    left.push([pts[i][0] + nx, pts[i][1] + ny]);
    right.push([pts[i][0] - nx, pts[i][1] - ny]);
  }

  const rEnd = radii[radii.length - 1];
  const rStart = radii[0];
  const lastR = right[right.length - 1];
  const firstL = left[0];
  let d = smoothCurve(left, true);
  d += ` A${f(rEnd)} ${f(rEnd)} 0 0 0 ${f(lastR[0])} ${f(lastR[1])}`;
  d += ' ' + smoothCurve(right.slice().reverse(), false);
  d += ` A${f(rStart)} ${f(rStart)} 0 0 0 ${f(firstL[0])} ${f(firstL[1])} Z`;
  return d;
}

/** Smoothed centerline (for the highlighter and the hit area). */
export function inkCenterline(rawPoints) {
  const pts = dedupe(rawPoints.map((p) => [p[0], p[1], p[2] ?? 0.5]));
  if (!pts.length) return '';
  if (pts.length === 1) return `M${f(pts[0][0])} ${f(pts[0][1])} l0.01 0`;
  return smoothCurve(pts, true);
}
