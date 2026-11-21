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
// Colores y medidas predefinidas. Pocas opciones, todas armoniosas.
import { N_ } from './i18n-core.js';

/** Estilos de forma: relleno, borde y color de texto que combinan entre sí. */
export const PRESETS = {
  white: { fill: '#ffffff', stroke: '#c9d0da', text: '#1f2328' },
  gray: { fill: '#eef0f3', stroke: '#8a94a6', text: '#1f2328' },
  yellow: { fill: '#fff4c2', stroke: '#e9b949', text: '#4a3800' },
  orange: { fill: '#ffe4cc', stroke: '#f08c3a', text: '#5a2a00' },
  red: { fill: '#ffdde2', stroke: '#e5566d', text: '#5c1020' },
  purple: { fill: '#ebe1ff', stroke: '#8f5ee8', text: '#2f1458' },
  blue: { fill: '#dbeaff', stroke: '#3b82f6', text: '#0b2a55' },
  teal: { fill: '#d3f4ec', stroke: '#22a88a', text: '#053d31' },
  green: { fill: '#def5d3', stroke: '#5cb84a', text: '#173d0a' },
  dark: { fill: '#2d3139', stroke: '#2d3139', text: '#ffffff' },
  none: { fill: 'none', stroke: 'auto', text: 'auto' },
};
export const PRESET_ORDER = ['white', 'gray', 'yellow', 'orange', 'red', 'purple', 'blue', 'teal', 'green', 'dark', 'none'];

export const STICKY_COLORS = ['#fff59d', '#ffd59e', '#ffc9dc', '#c8e6ff', '#d4f2c4', '#e2d6ff'];
export const STICKY_TEXT = '#2b2b2b';

export const INK_COLORS = ['auto', '#3b82f6', '#e5484d', '#30a46c', '#f08c3a', '#8f5ee8', '#8a94a6'];
export const HIGHLIGHTER_COLORS = ['#ffe45c', '#7ee0a8', '#7cc4ff', '#ff9ec4', '#ffb86b'];
export const INK_SIZES = [2, 4, 7, 12];
export const HIGHLIGHTER_SIZES = [12, 20, 32];

export const LINE_WIDTHS = [1.5, 2.5, 4];
export const STROKE_WIDTHS = [0, 1.5, 3];
export const FONT_SIZES = [
  { label: 'S', value: 13 },
  { label: 'M', value: 16 },
  { label: 'L', value: 22 },
  { label: 'XL', value: 32 },
];

export const SHAPE_KINDS = ['rect', 'pill', 'ellipse', 'diamond', 'triangle', 'hexagon', 'cylinder'];
/** Nombres visibles (msgid en inglés; se traducen al pintar con t()). */
export const SHAPE_LABELS = {
  rect: N_('Rectangle'),
  pill: N_('Pill'),
  ellipse: N_('Ellipse'),
  diamond: N_('Diamond'),
  triangle: N_('Triangle'),
  hexagon: N_('Hexagon'),
  cylinder: N_('Database'),
};

export const PRESET_LABELS = {
  white: N_('White'),
  gray: N_('Gray'),
  yellow: N_('Yellow'),
  orange: N_('Orange'),
  red: N_('Red'),
  purple: N_('Purple'),
  blue: N_('Blue'),
  teal: N_('Teal'),
  green: N_('Green'),
  dark: N_('Dark'),
  none: N_('No Fill'),
};

export const DEFAULT_SIZES = {
  rect: [160, 96],
  pill: [160, 64],
  ellipse: [120, 120],
  diamond: [150, 120],
  triangle: [140, 120],
  hexagon: [150, 110],
  cylinder: [120, 130],
  sticky: [200, 200],
};

/** Convierte 'auto' en el color de primer plano del tema actual. */
export function resolveColor(color, theme) {
  return color === 'auto' ? theme.fg : color;
}
