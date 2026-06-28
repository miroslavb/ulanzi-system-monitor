// layout.js — turn the set of placed keys into renderable strips.
//
// Each key's id is "col_row" (host convention), so we know its grid position.
// Keys on the same row that resolve to the same metric form one horizontal strip;
// the graph is drawn once across the strip and cropped per key.
//
// Metric resolution: an instance may force 'cpu' or 'mem'; 'auto' is assigned by
// row order — topmost occupied auto-row → CPU, next → Memory, then alternating.
// So dragging the action across two rows gives CPU on top, RAM below, zero config.

export function parseKey(key) {
  const parts = String(key).split('_');
  const col = parseInt(parts[0], 10);
  const row = parseInt(parts[1], 10);
  return { col: Number.isFinite(col) ? col : 0, row: Number.isFinite(row) ? row : 0 };
}

export function computeStrips(instances) {
  const active = instances.filter((i) => i.active !== false);

  const autoRows = [...new Set(active.filter((i) => i.metric === 'auto').map((i) => i.row))]
    .sort((a, b) => a - b);
  const rowMetric = {};
  autoRows.forEach((r, idx) => { rowMetric[r] = idx % 2 === 0 ? 'cpu' : 'mem'; });

  const groups = new Map();
  for (const inst of active) {
    const metric = inst.metric === 'cpu' || inst.metric === 'mem'
      ? inst.metric
      : (rowMetric[inst.row] || 'cpu');
    const gk = `${metric}@${inst.row}`;
    if (!groups.has(gk)) groups.set(gk, { metric, row: inst.row, keys: [] });
    groups.get(gk).keys.push(inst);
  }

  const strips = [];
  for (const g of groups.values()) {
    g.keys.sort((a, b) => a.col - b.col);
    const minCol = g.keys[0].col;
    const maxCol = g.keys[g.keys.length - 1].col;
    strips.push({
      metric: g.metric,
      row: g.row,
      cols: maxCol - minCol + 1,
      keys: g.keys.map((k) => ({ context: k.context, col: k.col, colIndex: k.col - minCol })),
    });
  }
  return strips;
}
