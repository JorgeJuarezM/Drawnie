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
// Drawnie — infinite canvas for diagrams and pen drawing.
import {
  PRESETS, PRESET_ORDER, STICKY_COLORS, STICKY_TEXT, INK_COLORS, HIGHLIGHTER_COLORS, INK_SIZES,
  HIGHLIGHTER_SIZES, LINE_WIDTHS, STROKE_WIDTHS, FONT_SIZES, SHAPE_KINDS, SHAPE_LABELS, PRESET_LABELS, DEFAULT_SIZES,
  resolveColor,
} from './palette.js';
import {
  clamp, dist, frameOf, hitBoundsOf, unionRects, rectsIntersect, rectContains, rectFromPoints,
  distToSegment, textBox, connectorGeometry, isBoxElement,
} from './geometry.js';
import { elementSVG, defsMarkup, buildExportSVG } from './render.js';
import { fitText, FONT_FAMILY, LINE_HEIGHT } from './text.js';
import { ICONS } from './icons.js';
import { t, N_, onLocaleChange } from './i18n.js';

const api = window.drawnie;
const NS = 'http://www.w3.org/2000/svg';
const $ = (sel) => document.querySelector(sel);
const CLIP_PREFIX = 'drawnie-clipboard:';
const INK_TOOLS = new Set(['pen', 'highlighter', 'eraser']);

const platform = new URLSearchParams(location.search).get('platform') || api?.platform || 'web';
document.body.classList.add(`platform-${platform}`);
const isMac = platform === 'darwin';

// ---------- DOM ----------
const stage = $('#stage');
const svg = $('#canvas');
const worldEl = $('#world');
const contentEl = $('#content');
const liveEl = $('#live');
const overlayEl = $('#overlay');
const editorLayer = $('#editor-layer');
const inspectorEl = $('#inspector');
const subbarEl = $('#subbar');
$('#defs').innerHTML = defsMarkup();

// ---------- Theme ----------
const media = matchMedia('(prefers-color-scheme: dark)');
const makeTheme = () =>
  media.matches
    ? { dark: true, fg: '#ececef', bg: '#1c1c1e', accent: '#0a84ff' }
    : { dark: false, fg: '#1f2328', bg: '#f7f7f5', accent: '#007aff' };
let theme = makeTheme();
media.addEventListener('change', () => {
  theme = makeTheme();
  updateThemeToggle();
  resetNodes();
  render();
});

function updateThemeToggle() {
  const btn = $('#theme-toggle');
  btn.innerHTML = theme.dark ? ICONS.sun : ICONS.moon;
  btn.title = theme.dark ? t('Switch to Light Mode') : t('Switch to Dark Mode');
}

$('#theme-toggle').addEventListener('click', () => {
  settings.theme = theme.dark ? 'light' : 'dark';
  saveSettings();
  api?.setTheme(settings.theme);
});

// ---------- Settings ----------
const DEFAULT_SETTINGS = {
  grid: true,
  penAutoDraw: true,
  lastInk: 'pen',
  shapeKind: 'rect',
  shapePreset: 'blue',
  stickyColor: STICKY_COLORS[0],
  ink: { color: 'auto', size: 4 },
  highlighter: { color: HIGHLIGHTER_COLORS[0], size: 20 },
  line: { color: 'auto', width: 2.5, style: 'curve', arrows: 'end' },
};
const settings = (() => {
  try {
    const saved = JSON.parse(localStorage.getItem('drawnie.settings') || '{}');
    return { ...structuredClone(DEFAULT_SETTINGS), ...saved };
  } catch {
    return structuredClone(DEFAULT_SETTINGS);
  }
})();
function saveSettings() {
  try {
    localStorage.setItem('drawnie.settings', JSON.stringify(settings));
  } catch { /* no storage available: nothing to do */ }
}

// ---------- Document ----------
let elements = [];
let byId = new Map();
let assets = {};
let view = { x: 0, y: 0, zoom: 1 };
let selection = new Set();
let tool = 'select';
let docTitle = null; // null = unsaved board ("Untitled" in the active language)
let hasFile = false;
const history = { undo: [], redo: [], current: '[]', saved: '[]' };

const lookup = (id) => byId.get(id);
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);

function setElements(next) {
  elements = next;
  byId = new Map(elements.map((e) => [e.id, e]));
}
function replaceElements(map) {
  if (!map.size) return;
  setElements(elements.map((e) => map.get(e.id) || e));
}
function addElement(el) {
  setElements([...elements, el]);
  return el;
}
function removeElements(ids) {
  setElements(elements.filter((e) => !ids.has(e.id)));
  for (const id of ids) selection.delete(id);
}

// ---------- History ----------
const snapshot = () => JSON.stringify(elements);

function commit() {
  const snap = snapshot();
  if (snap === history.current) return;
  history.undo.push(history.current);
  if (history.undo.length > 300) history.undo.shift();
  history.current = snap;
  history.redo = [];
  updateDocState();
}

function restore(snap) {
  setElements(JSON.parse(snap));
  for (const id of [...selection]) if (!byId.has(id)) selection.delete(id);
  render();
  updateDocState();
}

function undo() {
  if (nativeEditTarget()) return api?.nativeEdit('undo');
  if (gesture || !history.undo.length) return;
  history.redo.push(history.current);
  history.current = history.undo.pop();
  restore(history.current);
}

function redo() {
  if (nativeEditTarget()) return api?.nativeEdit('redo');
  if (gesture || !history.redo.length) return;
  history.undo.push(history.current);
  history.current = history.redo.pop();
  restore(history.current);
}

const displayTitle = () => docTitle ?? t('Untitled');

function updateDocState() {
  const dirty = history.current !== history.saved;
  $('#doc-title').textContent = displayTitle();
  $('#doc-status').textContent = dirty ? t('Edited') : '';
  $('#btn-undo').disabled = !history.undo.length;
  $('#btn-redo').disabled = !history.redo.length;
  api?.setDocState({ dirty, title: displayTitle() });
}

// ---------- View ----------
function stageRect() {
  return svg.getBoundingClientRect();
}
function screenPt(e) {
  const r = stageRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}
const toWorld = (p) => ({ x: (p.x - view.x) / view.zoom, y: (p.y - view.y) / view.zoom });
const toScreen = (p) => ({ x: p.x * view.zoom + view.x, y: p.y * view.zoom + view.y });

function zoomAt(screen, factor) {
  const z = clamp(view.zoom * factor, 0.1, 8);
  const w = toWorld(screen);
  view = { zoom: z, x: screen.x - w.x * z, y: screen.y - w.y * z };
  render();
}
function zoomCenter(factor) {
  const r = stageRect();
  zoomAt({ x: r.width / 2, y: r.height / 2 }, factor);
}
function zoomTo(z) {
  zoomCenter(z / view.zoom);
}
function contentBounds(list = elements) {
  return unionRects(list.map((e) => hitBoundsOf(e, lookup)));
}
function zoomToFit() {
  const b = contentBounds(selection.size ? elements.filter((e) => selection.has(e.id)) : elements);
  const r = stageRect();
  if (!b) {
    view = { x: r.width / 2, y: r.height / 2, zoom: 1 };
    return render();
  }
  const pad = 80;
  const z = clamp(Math.min((r.width - pad * 2) / Math.max(b.w, 1), (r.height - pad * 2) / Math.max(b.h, 1)), 0.1, 1.5);
  view = { zoom: z, x: r.width / 2 - (b.x + b.w / 2) * z, y: r.height / 2 - (b.y + b.h / 2) * z };
  render();
}
function viewCenterWorld() {
  const r = stageRect();
  return toWorld({ x: r.width / 2, y: r.height / 2 });
}

// ---------- Render ----------
const nodeCache = new Map();
let renderQueued = false;
let editing = null;
let gesture = null;
let hoverId = null;
let eraserCursor = null;
let guides = [];

function resetNodes() {
  nodeCache.clear();
  contentEl.textContent = '';
}

function renderCtx() {
  return { lookup, theme, editingId: editing?.id ?? null, assets };
}

function render() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    renderNow();
  });
}

function renderNow() {
  worldEl.setAttribute('transform', `translate(${view.x} ${view.y}) scale(${view.zoom})`);
  renderContent();
  renderOverlay();
  renderBackground();
  renderInspector();
  renderToolbar();
  if (editing) positionEditor();
  $('#zoom-label').textContent = `${Math.round(view.zoom * 100)}%`;
  $('#empty-hint').classList.toggle('visible', elements.length === 0 && !gesture && !editing);
}

function renderContent() {
  const ctx = renderCtx();
  const seen = new Set();
  let prev = null;
  for (const el of elements) {
    seen.add(el.id);
    let entry = nodeCache.get(el.id);
    if (!entry) {
      const g = document.createElementNS(NS, 'g');
      g.dataset.id = el.id;
      entry = { g };
      nodeCache.set(el.id, entry);
    }
    const deps = el.type === 'connector' ? [lookup(el.from?.id), lookup(el.to?.id)] : null;
    const isEditing = ctx.editingId === el.id;
    const depsChanged = deps && (!entry.deps || deps[0] !== entry.deps[0] || deps[1] !== entry.deps[1]);
    if (entry.el !== el || entry.editing !== isEditing || depsChanged) {
      const { transform, markup } = elementSVG(el, ctx);
      if (transform) entry.g.setAttribute('transform', transform);
      else entry.g.removeAttribute('transform');
      entry.g.innerHTML = markup;
      entry.el = el;
      entry.deps = deps;
      entry.editing = isEditing;
    }
    const expected = prev ? prev.nextSibling : contentEl.firstChild;
    if (entry.g !== expected) contentEl.insertBefore(entry.g, expected);
    prev = entry.g;
  }
  for (const [id, entry] of nodeCache) {
    if (!seen.has(id)) {
      entry.g.remove();
      nodeCache.delete(id);
    }
  }
}

function renderBackground() {
  const size = 24 * view.zoom;
  stage.classList.toggle('grid', settings.grid && size >= 8);
  stage.style.backgroundSize = `${size}px ${size}px`;
  stage.style.backgroundPosition = `${view.x}px ${view.y}px`;
}

function selectionBounds() {
  const list = [...selection].map(lookup).filter(Boolean);
  return unionRects(list.map((e) => frameOf(e, lookup)));
}

function selectedElements() {
  return elements.filter((e) => selection.has(e.id));
}

function screenRect(r) {
  const p = toScreen(r);
  return { x: p.x, y: p.y, w: r.w * view.zoom, h: r.h * view.zoom };
}

function outlineMarkup(el, cls = 'sel-outline') {
  if (el.type === 'connector') {
    const g = connectorGeometry(el, lookup);
    return `<path class="${cls}" d="${g.d}" transform="translate(${view.x} ${view.y}) scale(${view.zoom})" vector-effect="non-scaling-stroke"/>`;
  }
  const r = screenRect(frameOf(el, lookup));
  return `<rect class="${cls}" x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="3"/>`;
}

function renderOverlay() {
  let s = '';
  const busy = gesture && ['move', 'resize', 'ink', 'erase', 'pinch', 'pan'].includes(gesture.type);

  if (hoverId && !selection.has(hoverId) && !gesture && lookup(hoverId)) s += outlineMarkup(lookup(hoverId), 'hover-outline');
  if (gesture?.targetId && lookup(gesture.targetId)) s += outlineMarkup(lookup(gesture.targetId), 'target-outline');

  const sel = selectedElements();
  if (sel.length && !(gesture?.type === 'ink' || gesture?.type === 'erase')) {
    for (const el of sel) s += outlineMarkup(el);
    const single = sel.length === 1 ? sel[0] : null;

    if (single?.type === 'connector') {
      if (!busy) {
        const g = connectorGeometry(single, lookup);
        for (const [which, p] of [['from', g.a], ['to', g.b]]) {
          const sp = toScreen(p);
          s += `<circle class="handle end-handle" data-handle="end-${which}" cx="${sp.x}" cy="${sp.y}" r="6"/>`;
        }
      }
    } else if (!editing) {
      const b = screenRect(selectionBounds());
      if (sel.length > 1) s += `<rect class="group-outline" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}"/>`;
      if (!busy) {
        const onlyText = single?.type === 'text';
        const handles = onlyText ? ['w', 'e'] : ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
        const pos = {
          nw: [b.x, b.y], n: [b.x + b.w / 2, b.y], ne: [b.x + b.w, b.y], e: [b.x + b.w, b.y + b.h / 2],
          se: [b.x + b.w, b.y + b.h], s: [b.x + b.w / 2, b.y + b.h], sw: [b.x, b.y + b.h], w: [b.x, b.y + b.h / 2],
        };
        for (const h of handles) {
          if ((h === 'n' || h === 's') && b.w < 40) continue;
          if ((h === 'e' || h === 'w') && b.h < 40 && !onlyText) continue;
          const [x, y] = pos[h];
          s += `<rect class="handle" data-handle="${h}" x="${x - 5}" y="${y - 5}" width="10" height="10" rx="2.5"/>`;
        }
        if (single?.type === 'shape') {
          const off = 22;
          const qc = { top: [b.x + b.w / 2, b.y - off], right: [b.x + b.w + off, b.y + b.h / 2], bottom: [b.x + b.w / 2, b.y + b.h + off], left: [b.x - off, b.y + b.h / 2] };
          for (const [side, [x, y]] of Object.entries(qc)) {
            s += `<g class="quick" data-handle="qc-${side}"><circle cx="${x}" cy="${y}" r="9"/><path d="M${x - 3.5} ${y}h7M${x} ${y - 3.5}v7"/></g>`;
          }
        }
      }
    }
  }

  if (gesture?.type === 'marquee') {
    const r = screenRect(rectFromPoints(gesture.start, gesture.cur));
    s += `<rect class="marquee" x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}"/>`;
  }
  for (const g of guides) {
    if (g.axis === 'x') {
      const x = toScreen({ x: g.value, y: 0 }).x;
      s += `<line class="guide" x1="${x}" y1="0" x2="${x}" y2="10000"/>`;
    } else {
      const y = toScreen({ x: 0, y: g.value }).y;
      s += `<line class="guide" x1="0" y1="${y}" x2="10000" y2="${y}"/>`;
    }
  }
  if (eraserCursor) s += `<circle class="eraser-cursor" cx="${eraserCursor.x}" cy="${eraserCursor.y}" r="${ERASER_RADIUS}"/>`;
  overlayEl.innerHTML = s;
}

// ---------- Factories ----------
function newShape(kind, frame) {
  if (kind === 'sticky') {
    return {
      id: uid(), type: 'shape', shape: 'sticky', ...frame, fill: settings.stickyColor, stroke: 'none',
      strokeWidth: 0, textColor: STICKY_TEXT, text: '', fontSize: 18, align: 'left', bold: false,
    };
  }
  const preset = PRESETS[settings.shapePreset] || PRESETS.blue;
  return {
    id: uid(), type: 'shape', shape: kind, ...frame, preset: settings.shapePreset, fill: preset.fill,
    stroke: preset.stroke, textColor: preset.text, strokeWidth: 1.5, text: '', fontSize: 16, align: 'center', bold: false,
  };
}

function newText(p) {
  return fitText({
    id: uid(), type: 'text', x: p.x, y: p.y, w: 24, h: 24, text: '', fontSize: 22, color: 'auto',
    autoWidth: true, align: 'left', bold: false,
  });
}

function newConnector(from, to) {
  const l = settings.line;
  return {
    id: uid(), type: 'connector', from, to, color: l.color, width: l.width, lineStyle: l.style,
    arrows: l.arrows, dashed: false, text: '', fontSize: 14, bold: false,
  };
}

function shapeAt(p, excludeId) {
  const pad = 6 / view.zoom;
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i];
    if (el.id !== excludeId && isBoxElement(el) && rectContains(frameOf(el, lookup), p, pad)) return el;
  }
  return null;
}

// ---------- Tools ----------
function setTool(next) {
  if (editing) commitEditing();
  tool = next;
  if (INK_TOOLS.has(next) && next !== 'eraser') {
    settings.lastInk = next;
    saveSettings();
  }
  if (next !== 'select') {
    hoverId = null;
  }
  if (next !== 'eraser') eraserCursor = null;
  stage.dataset.tool = next;
  render();
}

function effectiveTool(e) {
  if (e.button === 1 || spaceDown || tool === 'hand') return 'pan';
  if (e.pointerType === 'pen') {
    if (e.buttons & 32) return 'eraser';
    if (settings.penAutoDraw && tool === 'select') return settings.lastInk || 'pen';
  }
  // Once a pen is detected, a finger selects and pans (like on a tablet).
  if (e.pointerType === 'touch' && penSeen) return 'select-touch';
  return tool;
}

// ---------- Pointers ----------
const touches = new Map();
let penSeen = false;
let penDown = false;
let spaceDown = false;
const ERASER_RADIUS = 10;

svg.addEventListener('pointerdown', onPointerDown);
svg.addEventListener('pointermove', onPointerMove);
svg.addEventListener('pointerup', onPointerUp);
svg.addEventListener('pointercancel', onPointerCancel);
svg.addEventListener('pointerleave', () => {
  if (eraserCursor) {
    eraserCursor = null;
    renderOverlay();
  }
  if (hoverId && !gesture) {
    hoverId = null;
    renderOverlay();
  }
});
svg.addEventListener('contextmenu', (e) => e.preventDefault());

function onPointerDown(e) {
  if (editing) commitEditing();
  const sp = screenPt(e);
  const wp = toWorld(sp);

  if (e.pointerType === 'touch') {
    if (penDown) return; // palm rejection: the pen wins
    touches.set(e.pointerId, sp);
    if (touches.size === 2) {
      cancelGesture();
      startPinch();
      return;
    }
    if (touches.size > 2) return;
  }
  if (gesture) return;
  if (e.pointerType === 'pen') {
    penSeen = true;
    penDown = true;
  }
  if (e.button === 2) return;

  try { svg.setPointerCapture(e.pointerId); } catch { /* pointer already released */ }
  const active = effectiveTool(e);
  const pid = e.pointerId;

  switch (active) {
    case 'pan':
      gesture = { type: 'pan', pid, start: sp, view0: { ...view } };
      stage.classList.add('panning');
      break;
    case 'select':
      startSelect(e, wp, false);
      break;
    case 'select-touch':
      startSelect(e, wp, true);
      break;
    case 'shape':
      gesture = { type: 'create', pid, kind: settings.shapeKind, start: wp, id: null, startScreen: sp };
      break;
    case 'sticky':
      gesture = { type: 'create', pid, kind: 'sticky', start: wp, id: null, startScreen: sp };
      break;
    case 'text':
      gesture = { type: 'text', pid, start: wp };
      break;
    case 'connector': {
      const target = shapeAt(wp);
      const conn = addElement(newConnector(target ? { id: target.id } : { x: wp.x, y: wp.y }, { x: wp.x, y: wp.y }));
      gesture = { type: 'connector', pid, id: conn.id, startScreen: sp, moved: false, targetId: null };
      break;
    }
    case 'pen':
    case 'highlighter':
      startInk(active, e, wp);
      break;
    case 'eraser':
      gesture = { type: 'erase', pid, last: wp, erased: false };
      eraserCursor = sp;
      eraseAlong(wp, wp);
      break;
  }
  render();
}

function startSelect(e, wp, panOnEmpty) {
  const pid = e.pointerId;
  const handleEl = e.target.closest?.('[data-handle]');
  if (handleEl) {
    const h = handleEl.dataset.handle;
    if (h.startsWith('qc-')) return startQuickConnect(e, h.slice(3), wp);
    if (h.startsWith('end-')) {
      gesture = { type: 'connector-end', pid, id: [...selection][0], which: h.slice(4), targetId: null };
      return;
    }
    const ob = selectionBounds();
    gesture = { type: 'resize', pid, handle: h, start: wp, ob, origin: new Map(selectedElements().map((el) => [el.id, el])) };
    return;
  }

  const id = e.target.closest?.('[data-id]')?.dataset.id;
  if (id && lookup(id)) {
    let wasSelected = selection.has(id);
    if (e.shiftKey) {
      if (wasSelected) {
        selection.delete(id);
        gesture = { type: 'noop', pid };
        return;
      }
      selection.add(id);
      wasSelected = true;
    } else if (!wasSelected) selection = new Set([id]);
    return startMove(e, wp, id, wasSelected);
  }

  const sb = selectionBounds();
  if (selection.size > 1 && sb && rectContains(sb, wp)) return startMove(e, wp, null, true);

  if (panOnEmpty) {
    gesture = { type: 'pan', pid, start: screenPt(e), view0: { ...view } };
    return;
  }
  if (!e.shiftKey) selection.clear();
  gesture = { type: 'marquee', pid, start: wp, cur: wp, base: new Set(selection) };
}

function startMove(e, wp, clickedId, wasSelected) {
  const dup = e.altKey && selection.size > 0;
  if (dup) duplicateSelection(0, false);
  const origin = new Map(selectedElements().map((el) => [el.id, el]));
  // Alignment targets: unselected shapes.
  const xs = [], ys = [];
  for (const el of elements) {
    if (selection.has(el.id) || !isBoxElement(el)) continue;
    xs.push(el.x, el.x + el.w / 2, el.x + el.w);
    ys.push(el.y, el.y + el.h / 2, el.y + el.h);
  }
  gesture = {
    type: 'move', pid: e.pointerId, start: wp, startScreen: screenPt(e), origin, moved: false,
    ob: selectionBounds(), xs, ys, clickedId, wasSelected, dup,
  };
}

function startQuickConnect(e, side, wp) {
  const src = lookup([...selection][0]);
  const conn = addElement(newConnector({ id: src.id }, { x: wp.x, y: wp.y }));
  gesture = { type: 'connector', pid: e.pointerId, id: conn.id, startScreen: screenPt(e), moved: false, targetId: null, quick: { srcId: src.id, side } };
}

function startInk(kind, e, wp) {
  const st = kind === 'highlighter' ? settings.highlighter : settings.ink;
  const isPen = e.pointerType === 'pen';
  gesture = {
    type: 'ink', pid: e.pointerId, kind, isPen, color: st.color, size: st.size,
    points: [[wp.x, wp.y, isPen ? e.pressure || 0.5 : 0.5]], lastT: e.timeStamp, p: 0.5, raw: wp,
  };
  drawLiveInk();
}

function startPinch() {
  const [a, b] = [...touches.values()];
  gesture = { type: 'pinch', d0: dist(a, b) || 1, m0: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, view0: { ...view } };
}

function onPointerMove(e) {
  const sp = screenPt(e);
  if (e.pointerType === 'touch' && touches.has(e.pointerId)) {
    touches.set(e.pointerId, sp);
    if (gesture?.type === 'pinch') return updatePinch();
  }

  if (!gesture) {
    if (tool === 'eraser' || (e.pointerType === 'pen' && e.buttons & 32)) {
      eraserCursor = sp;
      renderOverlay();
    }
    if ((tool === 'select' || tool === 'connector') && e.pointerType !== 'touch' && !spaceDown) {
      let id = e.target.closest?.('[data-id]')?.dataset.id || null;
      if (tool === 'connector' && id && !isBoxElement(lookup(id))) id = null;
      if (id !== hoverId) {
        hoverId = id;
        renderOverlay();
      }
    }
    return;
  }
  if (gesture.pid !== e.pointerId) return;
  const wp = toWorld(sp);
  const g = gesture;

  switch (g.type) {
    case 'pan':
      view = { ...view, x: g.view0.x + sp.x - g.start.x, y: g.view0.y + sp.y - g.start.y };
      break;
    case 'marquee': {
      g.cur = wp;
      const r = rectFromPoints(g.start, g.cur);
      selection = new Set(g.base);
      for (const el of elements) if (rectsIntersect(r, hitBoundsOf(el, lookup))) selection.add(el.id);
      break;
    }
    case 'move':
      updateMove(g, wp, sp, e);
      break;
    case 'resize':
      updateResize(g, wp, e);
      break;
    case 'create': {
      if (!g.id && dist(sp, g.startScreen) < 4) return;
      let r = rectFromPoints(g.start, wp);
      if (e.shiftKey) {
        const m = Math.max(r.w, r.h);
        r = { x: wp.x < g.start.x ? g.start.x - m : g.start.x, y: wp.y < g.start.y ? g.start.y - m : g.start.y, w: m, h: m };
      }
      r.w = Math.max(r.w, 8);
      r.h = Math.max(r.h, 8);
      if (!g.id) g.id = addElement(newShape(g.kind, r)).id;
      else replaceElements(new Map([[g.id, { ...lookup(g.id), ...r }]]));
      break;
    }
    case 'connector':
    case 'connector-end': {
      if (g.type === 'connector' && !g.moved && dist(sp, g.startScreen) < 4) return;
      g.moved = true;
      const conn = lookup(g.id);
      const which = g.type === 'connector' ? 'to' : g.which;
      const otherId = conn[which === 'to' ? 'from' : 'to']?.id;
      const target = shapeAt(wp, otherId);
      g.targetId = target?.id ?? null;
      const end = target ? { id: target.id } : { x: wp.x, y: wp.y };
      replaceElements(new Map([[g.id, { ...conn, [which]: end }]]));
      break;
    }
    case 'ink': {
      const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      for (const ev of events.length ? events : [e]) addInkPoint(g, ev);
      drawLiveInk();
      return;
    }
    case 'erase': {
      eraserCursor = sp;
      eraseAlong(g.last, wp);
      g.last = wp;
      break;
    }
  }
  render();
}

function updateMove(g, wp, sp, e) {
  if (!g.moved && dist(sp, g.startScreen) < 3) return;
  g.moved = true;
  let dx = wp.x - g.start.x, dy = wp.y - g.start.y;
  guides = [];
  if (!(e.metaKey || e.ctrlKey) && g.ob && g.xs.length) {
    const th = 6 / view.zoom;
    const snap = (cands, targets) => {
      let best = null;
      for (const c of cands) for (const target of targets) {
        const d = target - c;
        if (Math.abs(d) < th && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, value: target };
      }
      return best;
    };
    const b = { x: g.ob.x + dx, y: g.ob.y + dy, w: g.ob.w, h: g.ob.h };
    const sx = snap([b.x, b.x + b.w / 2, b.x + b.w], g.xs);
    const sy = snap([b.y, b.y + b.h / 2, b.y + b.h], g.ys);
    if (sx) { dx += sx.d; guides.push({ axis: 'x', value: sx.value }); }
    if (sy) { dy += sy.d; guides.push({ axis: 'y', value: sy.value }); }
  }
  const next = new Map();
  for (const [id, el] of g.origin) next.set(id, translated(el, dx, dy));
  replaceElements(next);
}

function translated(el, dx, dy) {
  if (el.type === 'connector') {
    const moveEnd = (end) => (end.id && lookup(end.id) ? end : { x: (end.x ?? 0) + dx, y: (end.y ?? 0) + dy });
    return { ...el, from: moveEnd(el.from), to: moveEnd(el.to) };
  }
  return { ...el, x: el.x + dx, y: el.y + dy };
}

function updateResize(g, wp, e) {
  const { ob, handle } = g;
  if (!ob) return;
  const dx = wp.x - g.start.x, dy = wp.y - g.start.y;
  let x = ob.x, y = ob.y, w = ob.w, h = ob.h;
  if (handle.includes('e')) w = ob.w + dx;
  if (handle.includes('w')) w = ob.w - dx;
  if (handle.includes('s')) h = ob.h + dy;
  if (handle.includes('n')) h = ob.h - dy;
  w = Math.max(w, 10);
  h = Math.max(h, 10);
  const single = g.origin.size === 1 ? [...g.origin.values()][0] : null;
  const keepAspect = e.shiftKey !== (single?.type === 'image' || (g.origin.size > 1 && [...g.origin.values()].some((el) => el.type === 'ink')));
  if (keepAspect && handle.length === 2 && ob.w && ob.h) {
    const ratio = ob.w / ob.h;
    if (w / ob.w > h / ob.h) h = w / ratio;
    else w = h * ratio;
  }
  if (handle.includes('w')) x = ob.x + ob.w - w;
  if (handle.includes('n')) y = ob.y + ob.h - h;
  const nb = { x, y, w, h };
  const sx = ob.w ? w / ob.w : 1, sy = ob.h ? h / ob.h : 1;
  const mx = (v) => nb.x + (v - ob.x) * sx;
  const my = (v) => nb.y + (v - ob.y) * sy;
  const next = new Map();
  for (const [id, el] of g.origin) {
    let n;
    if (el.type === 'connector') {
      const mapEnd = (end) => (end.id && lookup(end.id) ? end : { x: mx(end.x ?? 0), y: my(end.y ?? 0) });
      n = { ...el, from: mapEnd(el.from), to: mapEnd(el.to) };
    } else if (el.type === 'text') {
      n = fitText({ ...el, x: mx(el.x), y: my(el.y), w: Math.max(20, el.w * sx), autoWidth: false });
    } else if (el.type === 'ink') {
      n = { ...el, x: mx(el.x), y: my(el.y), w: el.w * sx, h: el.h * sy, points: el.points.map(([px, py, p]) => [px * sx, py * sy, p]) };
    } else {
      n = { ...el, x: mx(el.x), y: my(el.y), w: Math.max(6, el.w * sx), h: Math.max(6, el.h * sy) };
    }
    next.set(id, n);
  }
  replaceElements(next);
}

function updatePinch() {
  const [a, b] = [...touches.values()];
  if (!a || !b) return;
  const g = gesture;
  const d = dist(a, b) || 1;
  const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const z = clamp(g.view0.zoom * (d / g.d0), 0.1, 8);
  const w = { x: (g.m0.x - g.view0.x) / g.view0.zoom, y: (g.m0.y - g.view0.y) / g.view0.zoom };
  view = { zoom: z, x: m.x - w.x * z, y: m.y - w.y * z };
  render();
}

function addInkPoint(g, ev) {
  const wp = toWorld(screenPt(ev));
  const last = g.points[g.points.length - 1];
  const d = Math.hypot(wp.x - last[0], wp.y - last[1]);
  g.raw = wp;
  if (d < 0.5 / view.zoom) return;
  const s = g.isPen ? 0.2 : 0.45; // hand smoothing
  const x = last[0] + (wp.x - last[0]) * (1 - s);
  const y = last[1] + (wp.y - last[1]) * (1 - s);
  let p;
  if (g.isPen) {
    p = ev.pressure || 0.5;
  } else {
    // Mouse or finger: simulate pressure from speed.
    const dt = Math.max(1, ev.timeStamp - g.lastT);
    const speed = (d * view.zoom) / dt;
    const target = clamp(0.85 - speed * 0.18, 0.28, 0.85);
    g.p += (target - g.p) * 0.3;
    p = g.p;
  }
  g.lastT = ev.timeStamp;
  g.points.push([x, y, p]);
}

function drawLiveInk() {
  const g = gesture;
  if (!g || g.type !== 'ink') return;
  const el = { id: '__live', type: 'ink', kind: g.kind, color: g.color, size: g.size, x: 0, y: 0, w: 0, h: 0, points: g.points };
  if (g.liveQueued) return;
  g.liveQueued = true;
  requestAnimationFrame(() => {
    g.liveQueued = false;
    if (gesture !== g) return;
    const { markup } = elementSVG(el, renderCtx());
    liveEl.innerHTML = markup;
  });
}

function finishInk(g) {
  const pts = g.points;
  const last = pts[pts.length - 1];
  if (g.raw && Math.hypot(g.raw.x - last[0], g.raw.y - last[1]) > 0.5) pts.push([g.raw.x, g.raw.y, last[2]]);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of pts) {
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  const r2 = (n) => Math.round(n * 100) / 100;
  addElement({
    id: uid(), type: 'ink', kind: g.kind, color: g.color, size: g.size,
    x: minX, y: minY, w: maxX - minX, h: maxY - minY,
    points: pts.map(([x, y, p]) => [r2(x - minX), r2(y - minY), r2(p)]),
  });
  liveEl.textContent = '';
  commit();
}

function eraseAlong(a, b) {
  const r = ERASER_RADIUS / view.zoom;
  const segBox = { x: Math.min(a.x, b.x) - r, y: Math.min(a.y, b.y) - r, w: Math.abs(a.x - b.x) + r * 2, h: Math.abs(a.y - b.y) + r * 2 };
  const steps = Math.max(1, Math.ceil(dist(a, b) / (r / 2)));
  const samples = [];
  for (let i = 0; i <= steps; i++) samples.push({ x: a.x + ((b.x - a.x) * i) / steps, y: a.y + ((b.y - a.y) * i) / steps });
  const hit = new Set();
  for (const el of elements) {
    if (el.type !== 'ink' || !rectsIntersect(segBox, hitBoundsOf(el))) continue;
    const reach = r + el.size / 2;
    const pts = el.points.map(([x, y]) => ({ x: x + el.x, y: y + el.y }));
    outer: for (const s of samples) {
      if (pts.length === 1 && dist(s, pts[0]) < reach) { hit.add(el.id); break; }
      for (let i = 1; i < pts.length; i++) {
        if (distToSegment(s, pts[i - 1], pts[i]) < reach) { hit.add(el.id); break outer; }
      }
    }
  }
  if (hit.size) {
    removeElements(hit);
    gesture.erased = true;
  }
}

function onPointerUp(e) {
  if (e.pointerType === 'touch') {
    touches.delete(e.pointerId);
    if (gesture?.type === 'pinch') {
      if (touches.size < 2) gesture = null;
      return;
    }
  }
  if (e.pointerType === 'pen') penDown = false;
  if (!gesture || gesture.pid !== e.pointerId) return;
  const g = gesture;
  gesture = null;
  guides = [];
  stage.classList.remove('panning');
  const wp = toWorld(screenPt(e));

  switch (g.type) {
    case 'move':
      if (g.moved) commit();
      else if (g.dup) restore(history.current);
      else if (g.clickedId && g.wasSelected && !e.shiftKey && selection.size > 1) selection = new Set([g.clickedId]);
      break;
    case 'resize':
      commit();
      break;
    case 'create': {
      let el = g.id ? lookup(g.id) : null;
      if (!el) {
        const [w, h] = DEFAULT_SIZES[g.kind] || [160, 96];
        el = addElement(newShape(g.kind, { x: g.start.x - w / 2, y: g.start.y - h / 2, w, h }));
      }
      selection = new Set([el.id]);
      tool = 'select';
      stage.dataset.tool = tool;
      commit();
      if (g.kind === 'sticky') startEditing(el.id);
      break;
    }
    case 'text': {
      const el = addElement(newText({ x: g.start.x, y: g.start.y - 22 * LINE_HEIGHT * 0.5 }));
      selection = new Set([el.id]);
      tool = 'select';
      stage.dataset.tool = tool;
      startEditing(el.id);
      break;
    }
    case 'connector':
      finishConnector(g, wp);
      break;
    case 'connector-end':
      commit();
      break;
    case 'ink':
      finishInk(g);
      break;
    case 'erase':
      if (g.erased) commit();
      if (tool !== 'eraser') eraserCursor = null;
      break;
  }
  render();
}

function finishConnector(g, wp) {
  let conn = lookup(g.id);
  if (!conn) return;
  if (g.quick) {
    const src = lookup(g.quick.srcId);
    if (!g.moved) {
      // Click on "+": create a twin shape next to it and connect them.
      const gap = 90;
      const pos = {
        right: { x: src.x + src.w + gap, y: src.y },
        left: { x: src.x - src.w - gap, y: src.y },
        bottom: { x: src.x, y: src.y + src.h + gap },
        top: { x: src.x, y: src.y - src.h - gap },
      }[g.quick.side];
      const twin = addElement({ ...src, id: uid(), text: '', ...pos });
      replaceElements(new Map([[conn.id, { ...conn, to: { id: twin.id } }]]));
      selection = new Set([twin.id]);
    } else if (!g.targetId) {
      const twin = addElement({ ...src, id: uid(), text: '', x: wp.x - src.w / 2, y: wp.y - src.h / 2 });
      replaceElements(new Map([[conn.id, { ...conn, to: { id: twin.id } }]]));
      selection = new Set([twin.id]);
    } else {
      selection = new Set([conn.id]);
    }
  } else {
    if (!g.moved) {
      const start = conn.from.id ? connectorGeometry(conn, lookup).a : conn.from;
      replaceElements(new Map([[conn.id, { ...conn, to: { x: start.x + 160, y: start.y } }]]));
    }
    selection = new Set([conn.id]);
    tool = 'select';
    stage.dataset.tool = tool;
  }
  commit();
}

function onPointerCancel(e) {
  if (e.pointerType === 'touch') touches.delete(e.pointerId);
  if (e.pointerType === 'pen') penDown = false;
  if (gesture && (gesture.pid === e.pointerId || gesture.type === 'pinch')) cancelGesture();
}

/** Aborts the current gesture and restores the last state stored in the history. */
function cancelGesture() {
  if (!gesture) return;
  gesture = null;
  guides = [];
  liveEl.textContent = '';
  stage.classList.remove('panning');
  restore(history.current);
}

// ---------- Wheel / trackpad ----------
svg.addEventListener('wheel', (e) => {
  e.preventDefault();
  const sp = screenPt(e);
  if (e.ctrlKey || e.metaKey) {
    const delta = clamp(e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY, -40, 40);
    zoomAt(sp, Math.exp(-delta * 0.01));
  } else {
    const k = e.deltaMode === 1 ? 16 : 1;
    const dx = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX;
    const dy = e.shiftKey && !e.deltaX ? 0 : e.deltaY;
    view = { ...view, x: view.x - dx * k, y: view.y - dy * k };
    render();
  }
}, { passive: false });

// ---------- Double-click: edit text ----------
svg.addEventListener('dblclick', (e) => {
  if (tool !== 'select') return;
  // With pointer capture the event targets the <svg>; find the real element under the cursor.
  const hit = document.elementFromPoint(e.clientX, e.clientY);
  const id = hit?.closest?.('[data-id]')?.dataset.id;
  const el = id && lookup(id);
  if (el && (el.type === 'shape' || el.type === 'text' || el.type === 'connector')) {
    startEditing(el.id);
  } else if (!el) {
    const wp = toWorld(screenPt(e));
    const txt = addElement(newText({ x: wp.x, y: wp.y - 22 * LINE_HEIGHT * 0.5 }));
    selection = new Set([txt.id]);
    startEditing(txt.id);
  }
});

// ---------- Text editing ----------
function startEditing(id, { selectAll = true } = {}) {
  const el = lookup(id);
  if (!el || !['shape', 'text', 'connector'].includes(el.type)) return;
  if (editing) commitEditing();
  selection = new Set([id]);

  const wrap = document.createElement('div');
  wrap.className = `editor-wrap editor-${el.type}${el.shape === 'sticky' ? ' editor-sticky' : ''}`;
  const ed = document.createElement('div');
  ed.className = 'editor';
  ed.contentEditable = 'plaintext-only';
  ed.spellcheck = false;
  ed.textContent = el.text || '';
  wrap.appendChild(ed);
  editorLayer.appendChild(wrap);
  editing = { id, wrap, ed };
  positionEditor();

  ed.addEventListener('input', () => {
    const cur = lookup(id);
    if (!cur) return;
    let next = { ...cur, text: readEditor(ed) };
    if (next.type === 'text') next = fitText(next);
    replaceElements(new Map([[id, next]]));
    render();
  });
  ed.addEventListener('blur', () => commitEditing());
  ed.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) {
      e.preventDefault();
      ed.blur();
    }
  });
  ed.addEventListener('pointerdown', (e) => e.stopPropagation());

  ed.focus();
  const range = document.createRange();
  range.selectNodeContents(ed);
  if (!selectAll) range.collapse(false);
  const sel = getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  render();
}

function readEditor(ed) {
  return ed.innerText.replace(/\n$/, '');
}

function positionEditor() {
  if (!editing) return;
  const el = lookup(editing.id);
  if (!el) return;
  const { wrap, ed } = editing;
  const z = view.zoom;
  const fs = (el.fontSize || 16) * z;
  Object.assign(ed.style, {
    fontSize: `${fs}px`,
    fontWeight: el.bold ? 600 : 400,
    fontFamily: FONT_FAMILY,
    lineHeight: String(LINE_HEIGHT),
  });
  const ws = wrap.style;
  if (el.type === 'shape') {
    const box = textBox(el);
    const p = toScreen({ x: el.x + box.x, y: el.y + box.y });
    Object.assign(ws, { left: `${p.x}px`, top: `${p.y}px`, width: `${box.w * z}px`, height: `${box.h * z}px`, transform: '' });
    ed.style.textAlign = el.align || (el.shape === 'sticky' ? 'left' : 'center');
    ed.style.color = resolveColor(el.textColor, theme);
  } else if (el.type === 'text') {
    const p = toScreen(el);
    Object.assign(ws, { left: `${p.x}px`, top: `${p.y}px`, width: el.autoWidth ? 'auto' : `${el.w * z}px`, height: 'auto', transform: '' });
    ed.style.whiteSpace = el.autoWidth ? 'pre' : 'pre-wrap';
    ed.style.textAlign = el.align || 'left';
    ed.style.color = resolveColor(el.color, theme);
  } else {
    const g = connectorGeometry(el, lookup);
    const p = toScreen(g.mid);
    Object.assign(ws, { left: `${p.x}px`, top: `${p.y}px`, width: 'auto', height: 'auto', transform: 'translate(-50%, -50%)' });
    ed.style.whiteSpace = 'pre';
    ed.style.textAlign = 'center';
    ed.style.color = resolveColor(el.color, theme);
    ws.background = theme.bg;
  }
}

function commitEditing() {
  if (!editing) return;
  const { id, wrap } = editing;
  editing = null;
  wrap.remove();
  const el = lookup(id);
  if (el && el.type === 'text' && !String(el.text || '').trim()) removeElements(new Set([id]));
  commit();
  render();
}

// ---------- Edit actions ----------
function deleteSelection() {
  if (!selection.size) return;
  const del = new Set(selection);
  for (const el of elements) {
    if (el.type === 'connector' && (del.has(el.from?.id) || del.has(el.to?.id))) del.add(el.id);
  }
  removeElements(del);
  selection.clear();
  commit();
  render();
}

function clipPayload() {
  const els = selectedElements().map((el) => {
    if (el.type !== 'connector') return el;
    const g = connectorGeometry(el, lookup);
    return { ...el, from: { ...el.from, x: g.a.x, y: g.a.y }, to: { ...el.to, x: g.b.x, y: g.b.y } };
  });
  const used = {};
  for (const el of els) if (el.type === 'image' && assets[el.asset]) used[el.asset] = assets[el.asset];
  return { els, assets: used };
}

function pasteElements(payload, offset, doCommit = true) {
  if (!payload?.els?.length) return;
  Object.assign(assets, payload.assets || {});
  const idMap = new Map(payload.els.map((e) => [e.id, uid()]));
  const fixEnd = (end) =>
    end?.id && idMap.has(end.id) ? { id: idMap.get(end.id) } : { x: (end?.x ?? 0) + offset, y: (end?.y ?? 0) + offset };
  const news = payload.els.map((e) => {
    const n = { ...e, id: idMap.get(e.id) };
    if (n.type === 'connector') {
      n.from = fixEnd(e.from);
      n.to = fixEnd(e.to);
    } else {
      n.x += offset;
      n.y += offset;
    }
    return n;
  });
  setElements([...elements, ...news]);
  selection = new Set(news.map((n) => n.id));
  if (doCommit) commit();
  render();
}

function duplicateSelection(offset = 24, doCommit = true) {
  if (!selection.size) return;
  pasteElements(clipPayload(), offset, doCommit);
}

let pasteCount = 0;

function copySelection() {
  if (!selection.size) return false;
  api?.writeClipboard(CLIP_PREFIX + JSON.stringify(clipPayload()));
  pasteCount = 0;
  return true;
}

function cutSelection() {
  if (!copySelection()) return;
  pasteCount = -1; // pasting after a cut keeps the elements in place
  deleteSelection();
}

async function pasteFromClipboard() {
  const clip = await api?.readClipboard();
  if (!clip) return;
  const text = clip.text || '';
  if (text.startsWith(CLIP_PREFIX)) {
    try {
      pasteCount += 1;
      pasteElements(JSON.parse(text.slice(CLIP_PREFIX.length)), 24 * Math.max(0, pasteCount));
    } catch { toast(t('Could not paste')); }
    return;
  }
  if (clip.image) return insertImage(clip.image, viewCenterWorld());
  if (!text.trim()) return;
  const c = viewCenterWorld();
  const txt = fitText({ ...newText(c), text: text.slice(0, 5000) });
  addElement({ ...txt, x: c.x - txt.w / 2, y: c.y - txt.h / 2 });
  selection = new Set([txt.id]);
  commit();
  render();
}

/** Is focus in a text field? Then Chromium handles the command. */
function nativeEditTarget() {
  return editing || isFormField(document.activeElement);
}

const offsetPoint = (p, o) => ({ x: p.x + o, y: p.y + o });

function reorder(mode) {
  if (!selection.size) return;
  const sel = (e) => selection.has(e.id);
  let next = elements.slice();
  if (mode === 'front') next = [...next.filter((e) => !sel(e)), ...next.filter(sel)];
  else if (mode === 'back') next = [...next.filter(sel), ...next.filter((e) => !sel(e))];
  else if (mode === 'forward') {
    for (let i = next.length - 2; i >= 0; i--) if (sel(next[i]) && !sel(next[i + 1])) [next[i], next[i + 1]] = [next[i + 1], next[i]];
  } else if (mode === 'backward') {
    for (let i = 1; i < next.length; i++) if (sel(next[i]) && !sel(next[i - 1])) [next[i], next[i - 1]] = [next[i - 1], next[i]];
  }
  setElements(next);
  commit();
  render();
}

function nudge(dx, dy) {
  const next = new Map();
  for (const el of selectedElements()) next.set(el.id, translated(el, dx, dy));
  replaceElements(next);
  commit();
  render();
}

function applyToSelection(fn, { types } = {}) {
  const next = new Map();
  for (const el of selectedElements()) {
    if (types && !types.includes(el.type)) continue;
    let n = fn(el);
    if (n && n !== el) {
      if (n.type === 'text') n = fitText(n);
      next.set(el.id, n);
    }
  }
  replaceElements(next);
  commit();
  render();
}

// ---------- Images ----------
function insertImageFile(file, at) {
  const reader = new FileReader();
  reader.onload = () => insertImage(String(reader.result), at);
  reader.readAsDataURL(file);
}

function insertImage(dataUrl, at = viewCenterWorld()) {
  const img = new Image();
  img.onload = () => {
    const max = 480 / view.zoom;
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const w = img.naturalWidth * k, h = img.naturalHeight * k;
    const asset = uid();
    assets[asset] = dataUrl;
    const el = addElement({ id: uid(), type: 'image', asset, x: at.x - w / 2, y: at.y - h / 2, w, h });
    selection = new Set([el.id]);
    setTool('select');
    commit();
    render();
  };
  img.onerror = () => toast(t('Unsupported image'));
  img.src = dataUrl;
}

const fileInput = $('#file-input');
fileInput.addEventListener('change', () => {
  [...fileInput.files].forEach((file, i) => insertImageFile(file, offsetPoint(viewCenterWorld(), i * 24)));
  fileInput.value = '';
});

stage.addEventListener('dragover', (e) => {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
});
stage.addEventListener('drop', (e) => {
  e.preventDefault();
  const p = toWorld(screenPt(e));
  [...e.dataTransfer.files].forEach((file, i) => {
    if (file.type.startsWith('image/')) insertImageFile(file, offsetPoint(p, i * 24));
    else if (file.name.endsWith('.drawnie')) api?.openDropped(file);
  });
});

// ---------- Keyboard ----------
function isFormField(node) {
  return node && (node.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(node.tagName));
}

const TOOL_KEYS = { v: 'select', h: 'hand', r: 'shape', o: 'ellipse', s: 'sticky', t: 'text', a: 'connector', l: 'connector', p: 'pen', m: 'highlighter', e: 'eraser' };

window.addEventListener('keydown', (e) => {
  if (editing || isFormField(e.target)) return;
  if (e.key === ' ') {
    if (!spaceDown) {
      spaceDown = true;
      stage.classList.add('space');
    }
    e.preventDefault();
    return;
  }
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const step = e.shiftKey ? 10 : 1;
  switch (e.key) {
    case 'Escape':
      if (gesture) cancelGesture();
      else if (selection.size) { selection.clear(); render(); }
      else setTool('select');
      return;
    case 'Backspace':
    case 'Delete':
      e.preventDefault();
      deleteSelection();
      return;
    case 'Enter':
      if (selection.size === 1) {
        e.preventDefault();
        startEditing([...selection][0], { selectAll: false });
      }
      return;
    case 'ArrowLeft': if (selection.size) { e.preventDefault(); nudge(-step, 0); } return;
    case 'ArrowRight': if (selection.size) { e.preventDefault(); nudge(step, 0); } return;
    case 'ArrowUp': if (selection.size) { e.preventDefault(); nudge(0, -step); } return;
    case 'ArrowDown': if (selection.size) { e.preventDefault(); nudge(0, step); } return;
  }
  const mapped = TOOL_KEYS[e.key.toLowerCase()];
  if (mapped === 'ellipse') {
    settings.shapeKind = 'ellipse';
    saveSettings();
    setTool('shape');
  } else if (mapped === 'shape') {
    settings.shapeKind = 'rect';
    saveSettings();
    setTool('shape');
  } else if (mapped) setTool(mapped);
});
window.addEventListener('keyup', (e) => {
  if (e.key === ' ') {
    spaceDown = false;
    stage.classList.remove('space');
  }
});
window.addEventListener('blur', () => {
  spaceDown = false;
  stage.classList.remove('space');
});

// ---------- Toolbar ----------
const TOOLBAR = [
  { tool: 'select', icon: 'select', label: N_('Select'), key: 'V' },
  { tool: 'hand', icon: 'hand', label: N_('Pan Canvas'), key: 'H' },
  'sep',
  { tool: 'shape', icon: 'shapes', label: N_('Shapes'), key: 'R' },
  { tool: 'sticky', icon: 'sticky', label: N_('Sticky Note'), key: 'S' },
  { tool: 'text', icon: 'text', label: N_('Text'), key: 'T' },
  { tool: 'connector', icon: 'connector', label: N_('Connector'), key: 'A' },
  'sep',
  { tool: 'pen', icon: 'pen', label: N_('Pen'), key: 'P' },
  { tool: 'highlighter', icon: 'highlighter', label: N_('Highlighter'), key: 'M' },
  { tool: 'eraser', icon: 'eraser', label: N_('Eraser'), key: 'E' },
  'sep',
  { action: 'image', icon: 'image', label: N_('Insert Image') },
];

function buildToolbar() {
  $('#toolbar').innerHTML = TOOLBAR.map((item) =>
    item === 'sep'
      ? '<span class="sep"></span>'
      : `<button class="tool-btn" ${item.tool ? `data-tool="${item.tool}"` : `data-action="${item.action}"`} title="${t(item.label)}${item.key ? ` (${item.key})` : ''}">${ICONS[item.icon]}</button>`,
  ).join('');
  $('#btn-undo').innerHTML = ICONS.undo;
  $('#btn-redo').innerHTML = ICONS.redo;
  $('#zoom-out').innerHTML = ICONS.minus;
  $('#zoom-in').innerHTML = ICONS.plus;
}

let lastToolbarKey = '';
function renderToolbar() {
  const key = `${tool}|${theme.dark}|${JSON.stringify(settings)}`;
  if (key === lastToolbarKey) return;
  lastToolbarKey = key;
  for (const b of document.querySelectorAll('#toolbar [data-tool]')) b.classList.toggle('active', b.dataset.tool === tool);
  renderSubbar();
}

$('#toolbar').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.tool) setTool(b.dataset.tool);
  else if (b.dataset.action === 'image') fileInput.click();
});
$('#btn-undo').addEventListener('click', undo);
$('#btn-redo').addEventListener('click', redo);
$('#zoom-in').addEventListener('click', () => zoomCenter(1.25));
$('#zoom-out').addEventListener('click', () => zoomCenter(0.8));
$('#zoom-label').addEventListener('click', () => (Math.abs(view.zoom - 1) < 0.01 ? zoomToFit() : zoomTo(1)));

// ---------- Sub-bar (tool options) ----------
const LINE_STYLES = ['curve', 'straight', 'elbow'];
const LINE_STYLE_LABELS = { curve: N_('Curved'), straight: N_('Straight'), elbow: N_('Elbow') };
const ARROWS = [['none', 'arrowNone', N_('No Arrows')], ['end', 'arrowEnd', N_('Arrow at End')], ['both', 'arrowBoth', N_('Arrows at Both Ends')]];
const PEN_TOAST_ON = N_('The pen always draws');
const PEN_TOAST_OFF = N_('The pen selects in Select mode');

function swatch(color, active, action, extra = '') {
  const c = color === 'auto' ? theme.fg : color;
  return `<button class="swatch${active ? ' active' : ''}" data-action="${action}" data-value="${color}" style="--c:${c}" title="${color === 'auto' ? t('Automatic') : color}" ${extra}></button>`;
}
function sizeDot(size, active, action, max) {
  const d = Math.max(4, Math.min(20, (size / max) * 20));
  return `<button class="size-dot${active ? ' active' : ''}" data-action="${action}" data-value="${size}" title="${size}px"><span style="width:${d}px;height:${d}px"></span></button>`;
}
function iconBtn(icon, active, action, value, title) {
  return `<button class="icon-btn${active ? ' active' : ''}" data-action="${action}" data-value="${value}" title="${title}">${ICONS[icon]}</button>`;
}

function renderSubbar() {
  let html = '';
  if (tool === 'shape') {
    html = SHAPE_KINDS.map((k) => iconBtn(k, settings.shapeKind === k, 'tool-shape', k, t(SHAPE_LABELS[k]))).join('');
  } else if (tool === 'sticky') {
    html = STICKY_COLORS.map((c) => swatch(c, settings.stickyColor === c, 'tool-sticky')).join('');
  } else if (tool === 'pen' || tool === 'highlighter') {
    const st = tool === 'pen' ? settings.ink : settings.highlighter;
    const colors = tool === 'pen' ? INK_COLORS : HIGHLIGHTER_COLORS;
    const sizes = tool === 'pen' ? INK_SIZES : HIGHLIGHTER_SIZES;
    html = colors.map((c) => swatch(c, st.color === c, 'tool-ink-color')).join('') +
      '<span class="sep"></span>' +
      sizes.map((s) => sizeDot(s, st.size === s, 'tool-ink-size', sizes[sizes.length - 1])).join('') +
      '<span class="sep"></span>' +
      `<button class="chip${settings.penAutoDraw ? ' active' : ''}" data-action="toggle-pen" title="${t('A digital pen draws even when the Select tool is active')}">${ICONS.pencilTip}<span>${t('Pen Always Draws')}</span></button>`;
  } else if (tool === 'connector') {
    const l = settings.line;
    html = LINE_STYLES.map((s) => iconBtn(s, l.style === s, 'tool-line-style', s, t(LINE_STYLE_LABELS[s]))).join('') +
      '<span class="sep"></span>' +
      ARROWS.map(([v, i, label]) => iconBtn(i, l.arrows === v, 'tool-line-arrows', v, t(label))).join('') +
      '<span class="sep"></span>' +
      INK_COLORS.map((c) => swatch(c, l.color === c, 'tool-line-color')).join('');
  }
  subbarEl.innerHTML = html;
  subbarEl.classList.toggle('visible', !!html);
}

subbarEl.addEventListener('click', (e) => {
  const b = e.target.closest('[data-action]');
  if (!b) return;
  const v = b.dataset.value;
  const st = tool === 'highlighter' ? settings.highlighter : settings.ink;
  switch (b.dataset.action) {
    case 'tool-shape': settings.shapeKind = v; break;
    case 'tool-sticky': settings.stickyColor = v; break;
    case 'tool-ink-color': st.color = v; break;
    case 'tool-ink-size': st.size = Number(v); break;
    case 'toggle-pen': settings.penAutoDraw = !settings.penAutoDraw; toast(t(settings.penAutoDraw ? PEN_TOAST_ON : PEN_TOAST_OFF)); break;
    case 'tool-line-style': settings.line.style = v; break;
    case 'tool-line-arrows': settings.line.arrows = v; break;
    case 'tool-line-color': settings.line.color = v; break;
  }
  saveSettings();
  render();
});

// ---------- Inspector (selection properties) ----------
let lastInspectorKey = null;

function renderInspector() {
  const sel = selectedElements();
  const hide = !sel.length || (gesture && gesture.type !== 'noop');
  inspectorEl.classList.toggle('visible', !hide);
  if (hide) return;
  const key = sel.map((e) => JSON.stringify({ ...e, points: undefined })).join('|') + theme.dark;
  if (key === lastInspectorKey) return;
  lastInspectorKey = key;

  const shapes = sel.filter((e) => e.type === 'shape' && e.shape !== 'sticky');
  const stickies = sel.filter((e) => e.shape === 'sticky');
  const texts = sel.filter((e) => e.type === 'text');
  const conns = sel.filter((e) => e.type === 'connector');
  const inks = sel.filter((e) => e.type === 'ink');
  const textual = sel.filter((e) => e.type === 'shape' || e.type === 'text' || e.type === 'connector');
  let html = '';
  const section = (title, body) => `<section><h4>${title}</h4><div class="row">${body}</div></section>`;

  if (shapes.length) {
    const s0 = shapes[0];
    html += section(t('Style'), PRESET_ORDER.map((p) => {
      const pr = PRESETS[p];
      const fill = pr.fill === 'none' ? 'transparent' : pr.fill;
      const stroke = resolveColor(pr.stroke, theme);
      return `<button class="preset${s0.preset === p ? ' active' : ''}" data-action="preset" data-value="${p}" title="${t(PRESET_LABELS[p])}" style="--f:${fill};--s:${stroke}"></button>`;
    }).join(''));
    html += section(t('Shape'), SHAPE_KINDS.map((k) => iconBtn(k, shapes.every((s) => s.shape === k), 'shape-kind', k, t(SHAPE_LABELS[k]))).join(''));
    html += section(t('Border'), STROKE_WIDTHS.map((w) =>
      `<button class="chip small${(s0.strokeWidth ?? 1.5) === w ? ' active' : ''}" data-action="stroke-width" data-value="${w}">${w === 0 ? t('None') : w < 2 ? t('Thin') : t('Thick')}</button>`).join(''));
  }
  if (stickies.length) {
    html += section(t('Color'), STICKY_COLORS.map((c) => swatch(c, stickies[0].fill === c, 'sticky-color')).join(''));
  }
  if (conns.length) {
    const c0 = conns[0];
    html += section(t('Line'), INK_COLORS.map((c) => swatch(c, c0.color === c, 'line-color')).join(''));
    html += section(t('Stroke'),
      LINE_STYLES.map((s) => iconBtn(s, (c0.lineStyle || 'curve') === s, 'line-style', s, t(LINE_STYLE_LABELS[s]))).join('') +
      '<span class="sep"></span>' +
      iconBtn('solid', !c0.dashed, 'line-dash', '0', t('Solid')) + iconBtn('dashed', !!c0.dashed, 'line-dash', '1', t('Dashed')));
    html += section(t('Arrows'),
      ARROWS.map(([v, i, label]) => iconBtn(i, (c0.arrows || 'end') === v, 'line-arrows', v, t(label))).join('') +
      '<span class="sep"></span>' +
      LINE_WIDTHS.map((w) => sizeDot(w, c0.width === w, 'line-width', 4)).join(''));
  }
  if (inks.length) {
    const i0 = inks[0];
    const colors = i0.kind === 'highlighter' ? HIGHLIGHTER_COLORS : INK_COLORS;
    const sizes = i0.kind === 'highlighter' ? HIGHLIGHTER_SIZES : INK_SIZES;
    html += section(t('Stroke'), colors.map((c) => swatch(c, i0.color === c, 'ink-color')).join(''));
    html += section(t('Thickness'), sizes.map((s) => sizeDot(s, i0.size === s, 'ink-size', sizes[sizes.length - 1])).join(''));
  }
  if (texts.length) {
    html += section(t('Text Color'), INK_COLORS.map((c) => swatch(c, texts[0].color === c, 'text-color')).join(''));
  }
  if (textual.length) {
    const t0 = textual[0];
    html += section(t('Text'),
      FONT_SIZES.map((fs) => `<button class="chip small${t0.fontSize === fs.value ? ' active' : ''}" data-action="font-size" data-value="${fs.value}">${fs.label}</button>`).join('') +
      '<span class="sep"></span>' +
      iconBtn('bold', !!t0.bold, 'bold', '1', t('Bold')) +
      (conns.length === textual.length ? '' :
        '<span class="break"></span>' +
        iconBtn('alignLeft', (t0.align || '') === 'left', 'align', 'left', t('Align Left')) +
        iconBtn('alignCenter', (t0.align || 'center') === 'center', 'align', 'center', t('Center')) +
        iconBtn('alignRight', t0.align === 'right', 'align', 'right', t('Align Right'))));
  }
  html += `<section class="actions">
    ${iconBtn('front', false, 'order', 'front', t('Bring to Front'))}
    ${iconBtn('back', false, 'order', 'back', t('Send to Back'))}
    ${iconBtn('duplicate', false, 'duplicate', '', t('Duplicate'))}
    ${iconBtn('trash', false, 'delete', '', t('Delete'))}
  </section>`;
  inspectorEl.innerHTML = html;
}

inspectorEl.addEventListener('pointerdown', (e) => e.preventDefault()); // do not steal focus from the editor
inspectorEl.addEventListener('click', (e) => {
  const b = e.target.closest('[data-action]');
  if (!b) return;
  const v = b.dataset.value;
  switch (b.dataset.action) {
    case 'preset': {
      const pr = PRESETS[v];
      settings.shapePreset = v;
      saveSettings();
      applyToSelection((el) => (el.type === 'shape' && el.shape !== 'sticky'
        ? { ...el, preset: v, fill: pr.fill, stroke: pr.stroke, textColor: pr.text, strokeWidth: v === 'none' && !el.strokeWidth ? 1.5 : el.strokeWidth }
        : el));
      break;
    }
    case 'shape-kind':
      applyToSelection((el) => (el.type === 'shape' && el.shape !== 'sticky' ? { ...el, shape: v } : el));
      break;
    case 'stroke-width':
      applyToSelection((el) => (el.type === 'shape' ? { ...el, strokeWidth: Number(v) } : el));
      break;
    case 'sticky-color':
      settings.stickyColor = v;
      saveSettings();
      applyToSelection((el) => (el.shape === 'sticky' ? { ...el, fill: v } : el));
      break;
    case 'line-color':
      settings.line.color = v;
      saveSettings();
      applyToSelection((el) => (el.type === 'connector' ? { ...el, color: v } : el));
      break;
    case 'line-style':
      settings.line.style = v;
      saveSettings();
      applyToSelection((el) => (el.type === 'connector' ? { ...el, lineStyle: v } : el));
      break;
    case 'line-dash':
      applyToSelection((el) => (el.type === 'connector' ? { ...el, dashed: v === '1' } : el));
      break;
    case 'line-arrows':
      settings.line.arrows = v;
      saveSettings();
      applyToSelection((el) => (el.type === 'connector' ? { ...el, arrows: v } : el));
      break;
    case 'line-width':
      settings.line.width = Number(v);
      saveSettings();
      applyToSelection((el) => (el.type === 'connector' ? { ...el, width: Number(v) } : el));
      break;
    case 'ink-color':
      applyToSelection((el) => (el.type === 'ink' ? { ...el, color: v } : el));
      break;
    case 'ink-size':
      applyToSelection((el) => (el.type === 'ink' ? { ...el, size: Number(v) } : el));
      break;
    case 'text-color':
      applyToSelection((el) => (el.type === 'text' ? { ...el, color: v } : el));
      break;
    case 'font-size':
      applyToSelection((el) => ('fontSize' in el ? { ...el, fontSize: Number(v) } : el));
      break;
    case 'bold': {
      const on = !selectedElements().find((el) => 'fontSize' in el)?.bold;
      applyToSelection((el) => ('fontSize' in el ? { ...el, bold: on } : el));
      break;
    }
    case 'align':
      applyToSelection((el) => (el.type === 'shape' || el.type === 'text' ? { ...el, align: v } : el));
      break;
    case 'order': reorder(v); break;
    case 'duplicate': duplicateSelection(); break;
    case 'delete': deleteSelection(); break;
  }
});

// ---------- Files ----------
function serialize() {
  const used = new Set(elements.filter((e) => e.type === 'image').map((e) => e.asset));
  const usedAssets = Object.fromEntries(Object.entries(assets).filter(([k]) => used.has(k)));
  return JSON.stringify({ app: 'drawnie', version: 1, view, elements, assets: usedAssets });
}

async function save(saveAs = false) {
  commitEditing();
  if (!api) return false;
  try {
    const p = await api.save(serialize(), { saveAs, suggestedName: displayTitle() });
    if (!p) return false;
    hasFile = true;
    docTitle = basename(p);
    history.saved = history.current;
    updateDocState();
    toast(t('Saved'));
    return true;
  } catch (err) {
    toast(t('Could not save: {error}', { error: err.message || err }));
    return false;
  }
}

function basename(p) {
  return p.split(/[\\/]/).pop().replace(/\.drawnie$/i, '');
}

function loadDocument({ filePath, content }) {
  try {
    const data = JSON.parse(content);
    if (!data || !Array.isArray(data.elements)) throw new Error(t('unknown format'));
    if (editing) commitEditing();
    setElements(data.elements.filter((e) => e && e.id && e.type));
    assets = data.assets || {};
    selection.clear();
    hasFile = true;
    docTitle = basename(filePath);
    history.undo = [];
    history.redo = [];
    history.current = snapshot();
    history.saved = history.current;
    resetNodes();
    if (data.view && Number.isFinite(data.view.zoom)) {
      view = data.view;
      render();
    } else zoomToFit();
    updateDocState();
  } catch (err) {
    toast(t('Could not open: {error}', { error: err.message || err }));
  }
}

async function exportImage(format) {
  commitEditing();
  const list = selection.size ? selectedElements() : elements;
  if (!list.length) return toast(t('Nothing to export'));
  const b = contentBounds(list);
  const pad = 32;
  const bounds = { x: b.x - pad, y: b.y - pad, w: b.w + pad * 2, h: b.h + pad * 2 };
  const svgText = buildExportSVG(list, bounds, { ...renderCtx(), editingId: null }, theme.bg);
  try {
    if (format === 'svg') {
      const p = await api.exportFile('svg', svgText, displayTitle());
      if (p) toast(t('Exported as SVG'));
      return;
    }
    const base64 = await svgToPngBase64(svgText, bounds);
    const p = await api.exportFile('png', base64, displayTitle());
    if (p) toast(t('Exported as PNG'));
  } catch (err) {
    toast(t('Could not export: {error}', { error: err.message || err }));
  }
}

async function svgToPngBase64(svgText, bounds) {
  const scale = Math.min(2, 12000 / Math.max(bounds.w, bounds.h));
  const url = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(bounds.w * scale);
    canvas.height = Math.ceil(bounds.h * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png').split(',')[1];
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ---------- Toasts ----------
let toastTimer = null;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('visible'), 1800);
}

// ---------- Native menu ----------
api?.onMenu((cmd) => {
  switch (cmd) {
    case 'save': save(false); break;
    case 'save-as': save(true); break;
    case 'save-and-close': save(false).then((ok) => ok && api.confirmClose()); break;
    case 'export-png': exportImage('png'); break;
    case 'export-svg': exportImage('svg'); break;
    case 'undo': undo(); break;
    case 'redo': redo(); break;
    case 'copy': if (nativeEditTarget()) api.nativeEdit('copy'); else copySelection(); break;
    case 'cut': if (nativeEditTarget()) api.nativeEdit('cut'); else cutSelection(); break;
    case 'paste': if (nativeEditTarget()) api.nativeEdit('paste'); else pasteFromClipboard(); break;
    case 'duplicate': if (!editing) duplicateSelection(); break;
    case 'delete': if (!editing) deleteSelection(); break;
    case 'select-all':
      if (nativeEditTarget()) api.nativeEdit('selectAll');
      else { selection = new Set(elements.map((e) => e.id)); setTool('select'); }
      break;
    case 'bring-front': reorder('front'); break;
    case 'bring-forward': reorder('forward'); break;
    case 'send-backward': reorder('backward'); break;
    case 'send-back': reorder('back'); break;
    case 'zoom-in': zoomCenter(1.25); break;
    case 'zoom-out': zoomCenter(0.8); break;
    case 'zoom-reset': zoomTo(1); break;
    case 'zoom-fit': zoomToFit(); break;
    case 'toggle-grid': settings.grid = !settings.grid; saveSettings(); render(); break;
    case 'toggle-pen-autodraw':
      settings.penAutoDraw = !settings.penAutoDraw;
      saveSettings();
      toast(t(settings.penAutoDraw ? PEN_TOAST_ON : PEN_TOAST_OFF));
      render();
      break;
  }
});
api?.onFileLoad(loadDocument);
window.drawnieIsEmpty = () => elements.length === 0 && history.current === history.saved && !hasFile;

// ---------- Language ----------
// When the language changes, everything with text is repainted without reloading the window.
onLocaleChange(() => {
  buildToolbar();
  updateThemeToggle();
  lastToolbarKey = '';
  lastInspectorKey = null;
  updateDocState();
  renderNow();
});

// ---------- Startup ----------
buildToolbar();
updateThemeToggle();
if (settings.theme) api?.setTheme(settings.theme); // remember the last choice
stage.dataset.tool = tool;
{
  const r = stageRect();
  view = { x: r.width / 2, y: r.height / 2, zoom: 1 };
}
window.addEventListener('resize', () => render());
updateDocState();
render();

// Debugging hooks for DevTools.
window.__drawnie = {
  get elements() { return elements; },
  get view() { return view; },
  async exportPreview() {
    const b = contentBounds();
    const bounds = { x: b.x - 32, y: b.y - 32, w: b.w + 64, h: b.h + 64 };
    return svgToPngBase64(buildExportSVG(elements, bounds, renderCtx(), theme.bg), bounds);
  },
};
