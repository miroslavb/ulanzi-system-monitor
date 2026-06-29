// Tests for the System Monitor plugin (v1.2.0 independent-render model):
// settings normalisation (labels toggle, grid clamps, auto cells), per-cell
// resolution, SVG rendering + slicing, and the sampler. Runs on any OS.
import assert from 'assert';
const P = '../com.ulanzi.sysmonitor.ulanziPlugin/plugin/monitor';
const { parseKey } = await import(`${P}/layout.js`);
const { buildInner, keyDataUri, CELL } = await import(`${P}/render.js`);
const { readSettings, labelsOn, parseCell, resolveCell } = await import(`${P}/settings.js`);
const Sampler = (await import(`${P}/Sampler.js`)).default;

let passed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; }
}
const decode = (uri) => Buffer.from(uri.split(',')[1], 'base64').toString();

console.log('settings:');

test('labels: default ON, explicit false/off => OFF (toggle regression)', () => {
  assert.strictEqual(labelsOn(undefined), true);
  assert.strictEqual(labelsOn(false), false);
  assert.strictEqual(labelsOn('off'), false);
  assert.strictEqual(labelsOn(true), true);
});

test('parseCell: blank/auto => auto; valid int kept; junk => auto', () => {
  for (const v of ['', undefined, null, 'auto', '-1', 'x']) assert.strictEqual(parseCell(v), 'auto', `${v}`);
  assert.strictEqual(parseCell('2'), 2);
  assert.strictEqual(parseCell(0), 0);
});

test('resolveCell: auto uses key pos; everything clamps into [0,count-1]', () => {
  assert.strictEqual(resolveCell('auto', 1, 3), 1);
  assert.strictEqual(resolveCell('auto', 5, 3), 2);     // clamp (e.g. duplicate "3_0" in a 3-wide grid)
  assert.strictEqual(resolveCell('auto', NaN, 3), 0);
  assert.strictEqual(resolveCell(4, 0, 3), 2);          // manual clamp
  assert.strictEqual(resolveCell(1, 9, 3), 1);          // manual overrides key pos
});

test('readSettings: defaults, clamps, explicit flags', () => {
  assert.deepStrictEqual(readSettings({}), {
    metric: 'cpu', cols: 1, rows: 1, cellCol: 'auto', cellRow: 'auto',
    theme: 'dark', showText: true, refresh: 500, diag: false,
  });
  assert.strictEqual(readSettings({ showText: false }).showText, false);
  assert.strictEqual(readSettings({ cols: '20' }).cols, 8);     // clamp hi
  assert.strictEqual(readSettings({ rows: '0' }).rows, 1);      // clamp lo
  assert.strictEqual(readSettings({ cellCol: '2' }).cellCol, 2);
  assert.strictEqual(readSettings({ diag: 'on' }).diag, true);
  assert.strictEqual(readSettings({ metric: 'mem' }).metric, 'mem');
});

console.log('layout:');
test('parseKey reads "col_row" (best-effort default cell)', () => {
  assert.deepStrictEqual(parseKey('2_1'), { col: 2, row: 1 });
  assert.deepStrictEqual(parseKey('weird'), { col: 0, row: 0 });
});

console.log('render (size + labels + slicing):');

test('buildInner sizes the canvas to cols×rows cells', () => {
  const inner = buildInner({ metric: 'cpu', history: [10, 20, 30], cols: 3, rows: 3, theme: 'dark', showText: false, value: 30 });
  assert.ok(inner.includes(`width="${3 * CELL}"`) && inner.includes(`height="${3 * CELL}"`));
});

test('showText:false draws NO text (toggle/overlap fix)', () => {
  const off = buildInner({ metric: 'cpu', history: [10, 37], cols: 4, rows: 1, theme: 'dark', showText: false, value: 37, sub: '8 cores' });
  assert.ok(!off.includes('<text') && !off.includes('37%'));
  const on = buildInner({ metric: 'cpu', history: [10, 37], cols: 4, rows: 1, theme: 'dark', showText: true, value: 37, sub: '8 cores' });
  assert.ok(on.includes('<text') && on.includes('37%') && on.includes('CPU'));
});

test('keyDataUri crops via translate inside a 0,0 viewBox (device-safe)', () => {
  const inner = buildInner({ metric: 'cpu', history: [1, 2, 3], cols: 3, rows: 3, theme: 'dark', showText: false, value: 3 });
  const svg = decode(keyDataUri(inner, 1, 2, 3, 3));
  assert.ok(svg.includes(`viewBox="0 0 ${CELL} ${CELL}"`), 'zero-origin viewBox');
  assert.ok(svg.includes(`translate(${-1 * CELL},${-2 * CELL})`), 'cell shifted to origin via transform');
});

test('a full 3×3 reassembles from its 9 independent crops (continuity)', () => {
  const inner = buildInner({ metric: 'cpu', history: [10, 40, 70, 30, 90], cols: 3, rows: 3, theme: 'dark', showText: true, value: 90 });
  const seen = new Set();
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    const svg = decode(keyDataUri(inner, c, r, 3, 3));
    assert.ok(svg.includes(`viewBox="0 0 ${CELL} ${CELL}"`));
    assert.ok(svg.includes(`translate(${-c * CELL},${-r * CELL})`));
    seen.add(`${c},${r}`);
  }
  assert.strictEqual(seen.size, 9);
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
