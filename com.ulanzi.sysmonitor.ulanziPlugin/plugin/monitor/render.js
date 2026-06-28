// render.js — Windows-10-Task-Manager-style performance graph as SVG.
//
// A strip spans `cols` adjacent keys. We build ONE wide graph (width = cols*CELL)
// and then hand each key a cropped view of it via the SVG viewBox, so the line is
// continuous across the whole row of keys. Pure string templating — no native deps.

export const CELL = 100;          // logical px per key cell (square)
export const HISTORY = 120;       // samples kept = window length (e.g. 60s @ 0.5s)

export const THEMES = {
  dark:  { bg: '#1b1b1b', grid: '#333333', text: '#e8e8e8', sub: '#9aa0a6', axis: '#6b6b6b' },
  light: { bg: '#f6f6f6', grid: '#d6d6d6', text: '#1b1b1b', sub: '#5f6368', axis: '#9aa0a6' },
};

// Win10 Task Manager accent colours: CPU = blue/cyan, Memory = violet.
export const METRIC_STYLE = {
  cpu: { line: '#17a2d6', fill: '#17a2d6', label: 'CPU' },
  mem: { line: '#c56fe6', fill: '#c56fe6', label: 'Memory' },
};

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Build the inner SVG markup (no outer <svg>) for a strip.
 * @param {object} o
 *   metric    'cpu' | 'mem'
 *   history   number[] of 0..100 (oldest first, newest last)
 *   cols      number of keys in the strip (>=1)
 *   theme     'dark' | 'light'
 *   showText  boolean
 *   value     current value 0..100 (for the big readout)
 *   sub       optional sub-label (e.g. "13.1 / 31.9 GB" or "8 cores")
 */
export function buildInner(o) {
  const cols = Math.max(1, o.cols | 0);
  const W = cols * CELL;
  const H = CELL;
  const t = THEMES[o.theme] || THEMES.dark;
  const m = METRIC_STYLE[o.metric] || METRIC_STYLE.cpu;
  const hist = o.history || [];

  // ---- grid -----------------------------------------------------------------
  let grid = '';
  for (let i = 1; i < 4; i++) {            // horizontal: 25/50/75%
    const y = (H * i) / 4;
    grid += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="${t.grid}" stroke-width="1"/>`;
  }
  const vStep = CELL / 2;                   // vertical: 2 lines per key
  for (let x = vStep; x < W; x += vStep) {
    grid += `<line x1="${x.toFixed(1)}" y1="0" x2="${x.toFixed(1)}" y2="${H}" stroke="${t.grid}" stroke-width="1"/>`;
  }

  // ---- data path (newest at the right, scrolling left like Task Manager) ----
  const step = W / (HISTORY - 1);
  const n = Math.min(hist.length, HISTORY);
  const pts = [];
  for (let j = 0; j < n; j++) {
    const v = hist[hist.length - 1 - j];           // j=0 newest
    const x = W - j * step;
    const y = H - (Math.max(0, Math.min(100, v)) / 100) * H;
    pts.push([x, y]);
  }
  let area = '', line = '';
  if (pts.length >= 2) {
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
    line = `<path d="${d}" fill="none" stroke="${m.line}" stroke-width="2" stroke-linejoin="round"/>`;
    const xR = pts[0][0].toFixed(1), xL = pts[pts.length - 1][0].toFixed(1);
    area = `<path d="${d} L${xL} ${H} L${xR} ${H} Z" fill="url(#g_${o.metric})" stroke="none"/>`;
  }

  const defs =
    `<defs><linearGradient id="g_${o.metric}" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="${m.fill}" stop-opacity="0.55"/>` +
    `<stop offset="1" stop-color="${m.fill}" stop-opacity="0.04"/></linearGradient></defs>`;

  // ---- text overlay ---------------------------------------------------------
  let text = '';
  if (o.showText !== false) {
    const val = Math.round(o.value || 0);
    const fam = "font-family=\"'Segoe UI','Source Han Sans SC',sans-serif\"";
    text +=
      `<text x="6" y="20" ${fam} font-size="14" fill="${t.sub}">${esc(m.label)}</text>` +
      `<text x="6" y="20" ${fam} font-size="14" fill="${t.sub}" dx="${m.label.length * 8 + 8}">` +
      `<tspan font-size="22" font-weight="600" fill="${t.text}">${val}%</tspan></text>`;
    if (o.sub) {
      text += `<text x="6" y="${H - 8}" ${fam} font-size="11" fill="${t.sub}">${esc(o.sub)}</text>`;
    }
    // y-axis hints on the right edge (land on the right-most key)
    text +=
      `<text x="${W - 4}" y="14" ${fam} font-size="10" fill="${t.axis}" text-anchor="end">100%</text>` +
      `<text x="${W - 4}" y="${H - 5}" ${fam} font-size="10" fill="${t.axis}" text-anchor="end">0</text>`;
  }

  return `${defs}<rect x="0" y="0" width="${W}" height="${H}" fill="${t.bg}"/>` +
         grid + area + line +
         `<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" fill="none" stroke="${t.grid}" stroke-width="1"/>` +
         text;
}

/** Wrap the strip's inner markup into one key's cropped SVG and base64-encode it. */
export function keyDataUri(inner, colIndex, cols) {
  const W = cols * CELL, H = CELL;
  const vb = `${colIndex * CELL} 0 ${CELL} ${H}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CELL}" height="${H}" viewBox="${vb}">${inner}</svg>`;
  return 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
}
