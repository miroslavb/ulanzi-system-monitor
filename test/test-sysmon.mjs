// Tests for the System Monitor plugin: settings normalisation (incl. the labels
// toggle), block grouping (2D bounding box), SVG rendering + per-key slicing,
// and the CPU/memory sampler. Runs on any OS, no device needed.
import assert from 'assert';
const P = '../com.ulanzi.sysmonitor.ulanziPlugin/plugin/monitor';
const { computeBlocks, parseKey, resolveMetric } = await import(`${P}/layout.js`);
const { buildInner, keyDataUri, CELL } = await import(`${P}/render.js`);
const { readSettings, labelsOn } = await import(`${P}/settings.js`);
const Sampler = (await import(`${P}/Sampler.js`)).default;

let passed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; }
}
const decode = (uri) => Buffer.from(uri.split(',')[1], 'base64').toString();
const grid = (n) => Array.from({ length: n }, (_, i) => i);

console.log('settings (labels toggle regression):');

test('labels default ON when never set, OFF when explicitly disabled', () => {
  assert.strictEqual(labelsOn(undefined), true);
  assert.strictEqual(labelsOn(false), false);     // <-- the bug: unchecked checkbox
  assert.strictEqual(labelsOn('off'), false);
  assert.strictEqual(labelsOn('false'), false);
  assert.strictEqual(labelsOn(true), true);
  assert.strictEqual(labelsOn('on'), true);
});

test('readSettings: defaults + explicit showText:false sticks', () => {
  assert.deepStrictEqual(readSettings({}), { metric: 'cpu', theme: 'dark', showText: true, refresh: 500 });
  assert.strictEqual(readSettings({ showText: false }).showText, false);
  assert.strictEqual(readSettings({ metric: 'auto' }).metric, 'cpu');      // legacy
  assert.strictEqual(readSettings({ metric: 'mem' }).metric, 'mem');
  assert.strictEqual(readSettings({ refresh: '1000' }).refresh, 1000);
});

console.log('layout (2D blocks):');

test('parseKey reads "col_row"; resolveMetric defaults cpu', () => {
  assert.deepStrictEqual(parseKey('2_1'), { col: 2, row: 1 });
  assert.strictEqual(resolveMetric(undefined), 'cpu');
  assert.strictEqual(resolveMetric('mem'), 'mem');
});

test('3x3 of CPU keys => one block cols=3 rows=3 with 9 tiles', () => {
  const inst = [];
  for (const r of grid(3)) for (const c of grid(3)) inst.push({ context: `${c}_${r}`, col: c, row: r, metric: 'cpu', active: true });
  const blocks = computeBlocks(inst);
  assert.strictEqual(blocks.length, 1);
  assert.strictEqual(blocks[0].cols, 3);
  assert.strictEqual(blocks[0].rows, 3);
  assert.strictEqual(blocks[0].keys.length, 9);
  const corner = blocks[0].keys.find((k) => k.context === '2_2');
  assert.deepStrictEqual([corner.colIndex, corner.rowIndex], [2, 2]);
});

test('CPU block and Memory block are separate, each with its own bounding box', () => {
  const inst = [
    { context: 'a', col: 0, row: 0, metric: 'cpu', active: true },
    { context: 'b', col: 1, row: 0, metric: 'cpu', active: true },
    { context: 'c', col: 0, row: 2, metric: 'mem', active: true },
    { context: 'd', col: 1, row: 2, metric: 'mem', active: true },
  ];
  const blocks = computeBlocks(inst);
  const byMetric = Object.fromEntries(blocks.map((b) => [b.metric, b]));
  assert.strictEqual(byMetric.cpu.cols, 2); assert.strictEqual(byMetric.cpu.rows, 1);
  assert.strictEqual(byMetric.mem.cols, 2); assert.strictEqual(byMetric.mem.rows, 1);
});

test('bounding box offsets become relative tile indices', () => {
  const inst = [
    { context: 'a', col: 2, row: 1, metric: 'cpu', active: true },
    { context: 'b', col: 3, row: 2, metric: 'cpu', active: true },
  ];
  const b = computeBlocks(inst)[0];
  assert.strictEqual(b.cols, 2); assert.strictEqual(b.rows, 2);
  const a = b.keys.find((k) => k.context === 'a');
  assert.deepStrictEqual([a.colIndex, a.rowIndex], [0, 0]);
});

test('inactive keys excluded; default metric is cpu', () => {
  const inst = [
    { context: 'a', col: 0, row: 0, active: false },
    { context: 'b', col: 1, row: 0, active: true },          // no metric -> cpu
  ];
  const b = computeBlocks(inst);
  assert.strictEqual(b.length, 1);
  assert.strictEqual(b[0].metric, 'cpu');
  assert.strictEqual(b[0].keys.length, 1);
});

console.log('render (size + labels + slicing):');

test('buildInner sizes the canvas to cols×rows cells', () => {
  const inner = buildInner({ metric: 'cpu', history: [10, 20, 30], cols: 2, rows: 3, theme: 'dark', showText: false, value: 30 });
  assert.ok(inner.includes(`width="${2 * CELL}"`), 'width = cols*CELL');
  assert.ok(inner.includes(`height="${3 * CELL}"`), 'height = rows*CELL');
});

test('showText:false draws NO text (the overlap/toggle fix)', () => {
  const off = buildInner({ metric: 'cpu', history: [10, 37], cols: 4, rows: 1, theme: 'dark', showText: false, value: 37, sub: '8 cores' });
  assert.ok(!off.includes('<text'), 'no <text> elements when labels off');
  assert.ok(!off.includes('37%'));
  const on = buildInner({ metric: 'cpu', history: [10, 37], cols: 4, rows: 1, theme: 'dark', showText: true, value: 37, sub: '8 cores' });
  assert.ok(on.includes('<text'));
  assert.ok(on.includes('37%') && on.includes('CPU') && on.includes('8 cores'));
});

test('keyDataUri crops to the (col,row) tile', () => {
  const inner = buildInner({ metric: 'cpu', history: [1, 2, 3], cols: 3, rows: 3, theme: 'dark', showText: false, value: 3 });
  const svg = decode(keyDataUri(inner, 1, 2, 3, 3));
  assert.ok(svg.includes(`viewBox="${1 * CELL} ${2 * CELL} ${CELL} ${CELL}"`), 'cropped to col1,row2');
});

console.log('sampler:');

test('sample() in range; history caps; sub-labels format', () => {
  const s = new Sampler(3);
  for (let i = 0; i < 6; i++) { const r = s.sample(); assert.ok(r.cpu >= 0 && r.cpu <= 100 && r.mem >= 0 && r.mem <= 100); }
  assert.strictEqual(s.cpu.length, 3);
  assert.match(s.subFor('mem'), /^\d+(\.\d)? \/ \d+(\.\d)? GB$/);
  assert.match(s.subFor('cpu'), /^\d+ cores$/);
});

console.log(`\n${passed} checks passed`);
