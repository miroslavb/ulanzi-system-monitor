// settings.js — normalise Property Inspector settings (pure, unit-tested).
//
// v1.2.0 model: each key renders INDEPENDENTLY. A key knows the grid size
// (cols × rows) and which cell it is (cellCol, cellRow); it draws the whole grid
// graph and crops its own cell. No cross-key grouping — so stale instances,
// duplicate "col_row" ids and device pages can't break it.

export const DEFAULT_MS = 500;

function clampInt(v, lo, hi, def) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : def;
}

// An unchecked HTML checkbox sends nothing → default ON; explicit false/off → off.
export function labelsOn(v) {
  if (v === undefined) return true;
  return !(v === false || v === 'false' || v === 'off');
}

// '' / undefined / 'auto' → 'auto' (derive from the key's own col/row); else int>=0.
export function parseCell(v) {
  if (v === '' || v === undefined || v === null || v === 'auto') return 'auto';
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : 'auto';
}

// Resolve a cell index: 'auto' uses the key's grid position; clamp into [0,count-1].
export function resolveCell(setting, keyPos, count) {
  const base = setting === 'auto' ? (Number.isFinite(keyPos) ? keyPos : 0) : setting;
  return Math.max(0, Math.min(count - 1, base));
}

export function readSettings(param = {}) {
  return {
    metric: param.metric === 'mem' ? 'mem' : 'cpu',   // default CPU; legacy 'auto' -> cpu
    cols: clampInt(param.cols, 1, 8, 1),
    rows: clampInt(param.rows, 1, 8, 1),
    cellCol: parseCell(param.cellCol),
    cellRow: parseCell(param.cellRow),
    theme: param.theme === 'light' ? 'light' : 'dark',
    showText: labelsOn(param.showText),
    refresh: clampInt(param.refresh, 250, 5000, DEFAULT_MS),
    diag: param.diag === true || param.diag === 'on',   // per-key diagnostic overlay
  };
}
