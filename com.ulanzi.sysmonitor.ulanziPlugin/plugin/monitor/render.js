// render.js — Windows-10-Task-Manager-style performance graph as SVG.
//
// A block spans a rectangle of keys (cols × rows). We build ONE graph at the full
// block size (width = cols*CELL, height = rows*CELL) and hand each key a cropped
// view via the SVG viewBox, so the line is continuous across the whole block —
// wide AND tall (e.g. a 3×3 matrix). Pure string templating, no native deps.

export const CELL = 100;          // logical px per key cell (square)
export const HISTORY = 120;       // samples kept = window length (≈60s @ 0.5s)

export const THEMES = {
  dark:  { bg: '#1b1b1b', grid: '#333333', text: '#e8e8e8', sub: '#9aa0a6', axis: '#6b6b6b', chip: 'rgba(0,0,0,0.45)' },
  light: { bg: '#f6f6f6', grid: '#d6d6d6', text: '#1b1b1b', sub: '#5f6368', axis: '#9aa0a6', chip: 'rgba(255,255,255,0.55)' },
};

// Win10 Task Manager accent colours: CPU = blue/cyan, Memory = violet.
export const METRIC_STYLE = {
  cpu: { line: '#17a2d6', fill: '#17a2d6', label: 'CPU' },
  mem: { line: '#c56fe6', fill: '#c56fe6', label: 'Memory' },
};

const FAM = "font-family=\"'Segoe UI','Source Han Sans SC',sans-serif\"";

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Build the inner SVG markup (no outer <svg>) for a block.
 * @param {object} o
 *   metric    'cpu' | 'mem'
 *   history   number[] of 0..100 (oldest first, newest last)
 *   cols      keys wide  (>=1)
 *   rows      keys tall  (>=1)
 *   theme     'dark' | 'light'
 *   showText  boolean — when false, NO text is drawn at all
 *   value     current value 0..100
 *   sub       optional sub-label (e.g. "13.1 / 31.9 GB" or "8 cores")
 */
export function buildInner(o) {
  const cols = Math.max(1, o.cols | 0);
  const rows = Math.max(1, o.rows | 0);
  const W = cols * CELL;
  const H = rows * CELL;
  const t = THEMES[o.theme] || THEMES.dark;
  const m = METRIC_STYLE[o.metric] || METRIC_STYLE.cpu;
  const hist = o.history || [];

  // ---- grid (uniform ~half-cell spacing, like Task Manager) -----------------
  let grid = '';
  const g = CELL / 2;
  for (let y = g; y < H; y += g) grid += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="${t.grid}" stroke-width="1"/>`;
  for (let x = g; x < W; x += g) grid += `<line x1="${x}" y1="0" x2="${x}" y2="${H}" stroke="${t.grid}" stroke-width="1"/>`;

  // ---- data path (newest at the right, scrolling left like Task Manager) ----
  const step = W / (HISTORY - 1);
  const n = Math.min(hist.length, HISTORY);
  const pts = [];
  for (let j = 0; j < n; j++) {
    const v = Math.max(0, Math.min(100, hist[hist.length - 1 - j]));
    pts.push([W - j * step, H - (v / 100) * H]);
  }
  let area = '', line = '';
  if (pts.length >= 2) {
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
    const sw = Math.max(2, Math.round(rows * 1.5));            // thicker line on taller blocks
    line = `<path d="${d}" fill="none" stroke="${m.line}" stroke-width="${sw}" stroke-linejoin="round"/>`;
    area = `<path d="${d} L${pts[pts.length - 1][0].toFixed(1)} ${H} L${pts[0][0].toFixed(1)} ${H} Z" fill="url(#g_${o.metric})" stroke="none"/>`;
  }

  const defs =
    `<defs><linearGradient id="g_${o.metric}" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="${m.fill}" stop-opacity="0.55"/>` +
    `<stop offset="1" stop-color="${m.fill}" stop-opacity="0.04"/></linearGradient></defs>`;

  // ---- text overlay (small, top-left chip; only when enabled) ---------------
  let text = '';
  if (o.showText === true) {
    const val = Math.round(o.value || 0);
    const head = `${m.label} ${val}%`;
    // Single text element (no tspan) so the label and value can never overlap.
    const chipW = Math.round(head.length * 7.5 + 14);
    text +=
      `<rect x="4" y="4" width="${chipW}" height="22" rx="4" fill="${t.chip}"/>` +
      `<text x="11" y="20" ${FAM} font-size="13" font-weight="700" fill="${t.text}">${esc(head)}</text>`;
    if (o.sub) text += `<text x="6" y="${H - 7}" ${FAM} font-size="11" fill="${t.sub}">${esc(o.sub)}</text>`;
  }

  return `${defs}<rect x="0" y="0" width="${W}" height="${H}" fill="${t.bg}"/>` +
         grid + area + line +
         `<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" fill="none" stroke="${t.grid}" stroke-width="1"/>` +
         text;
}

/**
 * Diagnostic tile: a 1×1 graph with an overlay of what the device reported for
 * this key (raw key id, decoded col/row, received settings, instance count).
 * Used to discover the real key-id scheme on hardware. `lines` = string[].
 */
export function buildDiagnostic({ metric, history, value, theme, lines }) {
  const t = THEMES[theme] || THEMES.dark;
  const inner = buildInner({ metric, history, cols: 1, rows: 1, theme, showText: false, value });
  let txt = `<rect x="0" y="0" width="${CELL}" height="${CELL}" fill="rgba(0,0,0,0.5)"/>`;
  (lines || []).forEach((l, i) => {
    txt += `<text x="6" y="${15 + i * 17}" ${FAM} font-size="11" font-weight="600" ` +
           `fill="#ffffff">${esc(l)}</text>`;
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CELL}" height="${CELL}" viewBox="0 0 ${CELL} ${CELL}">${inner}${txt}</svg>`;
  return 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
}

/**
 * Crop the grid graph to one key (col,row) and base64-encode it.
 *
 * IMPORTANT: we do NOT use a viewBox offset to crop. The D200H's SVG renderer
 * ignores a non-zero viewBox origin (every tile then shows the same top-left
 * region → nothing tiles). Instead we keep viewBox="0 0 CELL CELL" — the form the
 * device renders correctly — and translate the full graph so this key's cell lands
 * at the origin; the 100×100 viewport clips the rest.
 */
export function keyDataUri(inner, colIndex, rowIndex, cols, rows) {
  const tx = -colIndex * CELL, ty = -rowIndex * CELL;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CELL}" height="${CELL}" ` +
    `viewBox="0 0 ${CELL} ${CELL}"><g transform="translate(${tx},${ty})">${inner}</g></svg>`;
  return 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
}
