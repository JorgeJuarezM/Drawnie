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
// Iconos de línea (24×24) dibujados con currentColor.
const s = (inner) =>
  `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

export const ICONS = {
  select: s('<path d="M6 3.5 18.5 11l-5.6 1.4L10 18z"/>'),
  hand: s('<path d="M8 12.5V6.5a1.5 1.5 0 0 1 3 0V11m0-5.5V5a1.5 1.5 0 0 1 3 0v6m0-4.5a1.5 1.5 0 0 1 3 0V14a6 6 0 0 1-6 6h-.6a6 6 0 0 1-4.9-2.6l-2.3-3.3a1.5 1.5 0 0 1 2.4-1.8L8 14"/>'),
  shapes: s('<rect x="3" y="10" width="10" height="10" rx="2"/><circle cx="15.5" cy="8.5" r="5.5"/>'),
  sticky: s('<path d="M5 4h14v10l-5 6H5z"/><path d="M14 20v-6h5"/>'),
  text: s('<path d="M5 7V5h14v2M12 5v14M9 19h6"/>'),
  connector: s('<path d="M4 19c7 0 6-13 14-13"/><path d="m14.5 3 3.5 3-3 3.5"/>'),
  pen: s('<path d="M4 20l1.2-4.2L16.3 4.7a2.1 2.1 0 0 1 3 3L8.2 18.8z"/><path d="m14.5 6.5 3 3"/>'),
  highlighter: s('<path d="m9 14.5 6.8-9.3a2 2 0 0 1 2.9-.4l.6.5a2 2 0 0 1 .3 2.8L12.4 17z"/><path d="M9 14.5 7.5 17l1.3 1.2 3.6-1.2"/><path d="M4 21h7"/>'),
  eraser: s('<path d="M20 20H9.5L4.6 15a2 2 0 0 1 0-2.8l8.6-8.6a2 2 0 0 1 2.8 0l3.9 3.9a2 2 0 0 1 0 2.8L11 19.2"/><path d="m8.8 8.8 6.4 6.4"/>'),
  image: s('<rect x="3" y="4.5" width="18" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.6"/><path d="m21 16-5-5-9.5 8.5"/>'),
  undo: s('<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'),
  redo: s('<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>'),
  minus: s('<path d="M6 12h12"/>'),
  plus: s('<path d="M12 6v12M6 12h12"/>'),
  trash: s('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>'),
  duplicate: s('<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>'),
  front: s('<rect x="8" y="8" width="12" height="12" rx="2.5" fill="currentColor" fill-opacity=".25"/><path d="M16 5.5V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h.5"/>'),
  back: s('<rect x="4" y="4" width="12" height="12" rx="2.5" fill="currentColor" fill-opacity=".25"/><path d="M19 8.5V19a1 1 0 0 1-1 1H8.5"/>'),
  bold: s('<path d="M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z" stroke-width="2.2"/>'),
  alignLeft: s('<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>'),
  alignCenter: s('<path d="M4 6h16M7 10h10M4 14h16M7 18h10"/>'),
  alignRight: s('<path d="M4 6h16M10 10h10M4 14h16M10 18h10"/>'),
  curve: s('<path d="M4 19c9 0 7-14 16-14"/>'),
  straight: s('<path d="M4 19 20 5"/>'),
  elbow: s('<path d="M4 19h6.5a1.5 1.5 0 0 0 1.5-1.5v-11A1.5 1.5 0 0 1 13.5 5H20"/>'),
  arrowNone: s('<path d="M4 12h16"/>'),
  arrowEnd: s('<path d="M4 12h15M15 8l4 4-4 4"/>'),
  arrowBoth: s('<path d="M5 12h14M15 8l4 4-4 4M9 8l-4 4 4 4"/>'),
  dashed: s('<path d="M4 12h3M10.5 12h3M17 12h3"/>'),
  solid: s('<path d="M4 12h16"/>'),
  sun: s('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>'),
  moon: s('<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>'),
  pencilTip: s('<path d="M4 20l1.2-4.2L16.3 4.7a2.1 2.1 0 0 1 3 3L8.2 18.8z"/><path d="M14 20h6"/>'),
  // Formas
  rect: s('<rect x="3.5" y="6" width="17" height="12" rx="2.5"/>'),
  pill: s('<rect x="3" y="7.5" width="18" height="9" rx="4.5"/>'),
  ellipse: s('<ellipse cx="12" cy="12" rx="8.5" ry="7.5"/>'),
  diamond: s('<path d="M12 3.5 20.5 12 12 20.5 3.5 12z"/>'),
  triangle: s('<path d="M12 4.5 20.5 19h-17z"/>'),
  hexagon: s('<path d="M7.5 5h9l4.5 7-4.5 7h-9L3 12z"/>'),
  cylinder: s('<ellipse cx="12" cy="6.5" rx="7" ry="2.5"/><path d="M5 6.5v11c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-11"/>'),
};
