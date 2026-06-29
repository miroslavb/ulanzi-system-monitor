// layout.js — turn the set of placed keys into renderable blocks.
//
// Each key's id is "col_row" (host convention), so we know its grid position.
// Keys that resolve to the SAME metric are joined into one rectangular block
// (the bounding box of those keys). The graph is drawn once across the block and
// cropped per key, so it grows both wider AND taller as you add keys — e.g. a
// 3×3 matrix of keys all set to CPU shows one big CPU graph.
//
// Metric is explicit per key: 'cpu' (default) or 'mem'. Legacy 'auto' => 'cpu'.

export function parseKey(key) {
  const parts = String(key).split('_');
  const col = parseInt(parts[0], 10);
  const row = parseInt(parts[1], 10);
  return { col: Number.isFinite(col) ? col : 0, row: Number.isFinite(row) ? row : 0 };
}

export function resolveMetric(metric) {
  return metric === 'mem' ? 'mem' : 'cpu';
}

export function computeBlocks(instances) {
  const active = instances.filter((i) => i.active !== false);

  const groups = new Map();          // metric -> keys[]
  for (const inst of active) {
    const metric = resolveMetric(inst.metric);
    if (!groups.has(metric)) groups.set(metric, []);
    groups.get(metric).push(inst);
  }

  const blocks = [];
  for (const [metric, keys] of groups) {
    const cols = keys.map((k) => k.col);
    const rowsArr = keys.map((k) => k.row);
    const minCol = Math.min(...cols), maxCol = Math.max(...cols);
    const minRow = Math.min(...rowsArr), maxRow = Math.max(...rowsArr);
    blocks.push({
      metric,
      cols: maxCol - minCol + 1,
      rows: maxRow - minRow + 1,
      keys: keys.map((k) => ({ context: k.context, colIndex: k.col - minCol, rowIndex: k.row - minRow })),
    });
  }
  return blocks;
}
