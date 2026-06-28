// Tests for the System Monitor plugin: layout grouping, SVG rendering + slicing,
// and the CPU/memory sampler. Runs on any OS, no device needed.
import assert from 'assert';
const P = '../com.ulanzi.sysmonitor.ulanziPlugin/plugin/monitor';
const { computeStrips, parseKey } = await import(`${P}/layout.js`);
const { buildInner, keyDataUri, CELL, HISTORY } = await import(`${P}/render.js`);
const Sampler = (await import(`${P}/Sampler.js`)).default;

let passed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; }
}
const decodeSvg = (uri) => Buffer.from(uri.split(',')[1], 'base64').toString();

console.log('layout:');

test('parseKey reads "col_row"', () => {
  assert.deepStrictEqual(parseKey('2_1'), { col: 2, row: 1 });
  assert.deepStrictEqual(parseKey('garbage'), { col: 0, row: 0 });
});

test('a row of auto keys becomes one CPU strip with relative colIndex', () => {
  const inst = [0, 1, 2, 3].map((c) => ({ context: `c${c}`, col: c, row: 0, metric: 'auto', active: true }));
  const strips = computeStrips(inst);
  assert.strictEqual(strips.length, 1);
  assert.strictEqual(strips[0].metric, 'cpu');
  assert.strictEqual(strips[0].cols, 4);
  assert.deepStrictEqual(strips[0].keys.map((k) => k.colIndex), [0, 1, 2, 3]);
});

test('two auto rows => top CPU, next RAM', () => {
  const inst = [
    { context: 'a', col: 0, row: 0, metric: 'auto', active: true },
    { context: 'b', col: 1, row: 0, metric: 'auto', active: true },
    { context: 'c', col: 0, row: 1, metric: 'auto', active: true },
    { context: 'd', col: 1, row: 1, metric: 'auto', active: true },
  ];
  const strips = computeStrips(inst);
  const byRow = Object.fromEntries(strips.map((s) => [s.row, s.metric]));
  assert.strictEqual(byRow[0], 'cpu');
  assert.strictEqual(byRow[1], 'mem');
});

test('forced metric overrides auto row assignment', () => {
  const inst = [{ context: 'a', col: 0, row: 0, metric: 'mem', active: true }];
  assert.strictEqual(computeStrips(inst)[0].metric, 'mem');
});

test('non-contiguous columns => width spans the gap, colIndex is positional', () => {
  const inst = [
    { context: 'a', col: 1, row: 0, metric: 'cpu', active: true },
    { context: 'c', col: 3, row: 0, metric: 'cpu', active: true },
  ];
  const s = computeStrips(inst)[0];
  assert.strictEqual(s.cols, 3);                       // cols 1..3
  assert.deepStrictEqual(s.keys.map((k) => k.colIndex), [0, 2]);
});

test('inactive keys are excluded', () => {
  const inst = [
    { context: 'a', col: 0, row: 0, metric: 'cpu', active: false },
    { context: 'b', col: 1, row: 0, metric: 'cpu', active: true },
  ];
  const s = computeStrips(inst)[0];
  assert.strictEqual(s.keys.length, 1);
});

console.log('render:');

test('buildInner emits a graph with bg, line, area gradient and value text', () => {
  const inner = buildInner({ metric: 'cpu', history: [10, 20, 30, 40, 51], cols: 4, theme: 'dark', showText: true, value: 51, sub: '8 cores' });
  assert.ok(inner.includes('<rect'), 'has background rect');
  assert.ok(inner.includes('<path'), 'has path (line/area)');
  assert.ok(inner.includes('url(#g_cpu)'), 'area uses gradient');
  assert.ok(inner.includes('CPU'), 'metric label');
  assert.ok(inner.includes('51%'), 'current value');
  assert.ok(inner.includes('8 cores'), 'sub label');
});

test('showText:false omits the labels', () => {
  const inner = buildInner({ metric: 'cpu', history: [10, 20], cols: 2, theme: 'dark', showText: false, value: 20 });
  assert.ok(!inner.includes('CPU'));
  assert.ok(!inner.includes('20%'));
});

test('keyDataUri yields a base64 SVG with the right viewBox window', () => {
  const inner = buildInner({ metric: 'cpu', history: [1, 2, 3], cols: 4, theme: 'dark', showText: true, value: 3 });
  const uri = keyDataUri(inner, 2, 4);
  assert.ok(uri.startsWith('data:image/svg+xml;base64,'));
  const svg = decodeSvg(uri);
  assert.ok(svg.includes(`viewBox="${2 * CELL} 0 ${CELL} ${CELL}"`), 'cropped to key 2');
  assert.ok(svg.includes(`width="${CELL}"`));
});

test('light theme changes the background colour', () => {
  const d = buildInner({ metric: 'mem', history: [5], cols: 1, theme: 'dark', showText: false, value: 5 });
  const l = buildInner({ metric: 'mem', history: [5], cols: 1, theme: 'light', showText: false, value: 5 });
  assert.ok(d.includes('#1b1b1b'));
  assert.ok(l.includes('#f6f6f6'));
});

console.log('sampler:');

test('sample() returns 0..100 for cpu and mem', () => {
  const s = new Sampler();
  const r = s.sample();
  for (const v of [r.cpu, r.mem]) { assert.ok(v >= 0 && v <= 100, `in range: ${v}`); }
  assert.ok(s.cpu.length === 1 && s.mem.length === 1);
});

test('history is capped at max length', () => {
  const s = new Sampler(3);
  for (let i = 0; i < 6; i++) s.sample();
  assert.strictEqual(s.cpu.length, 3);
  assert.strictEqual(s.mem.length, 3);
});

test('subFor formats memory as used / total GB and cpu as cores', () => {
  const s = new Sampler();
  s.sample();
  assert.match(s.subFor('mem'), /^\d+(\.\d)? \/ \d+(\.\d)? GB$/);
  assert.match(s.subFor('cpu'), /^\d+ cores$/);
});

test('HISTORY window default is sane', () => {
  assert.ok(HISTORY >= 60 && HISTORY <= 600);
});

console.log(`\n${passed} checks passed`);
