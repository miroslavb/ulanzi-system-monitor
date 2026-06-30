// Tests for the System Monitor plugin (v1.2.0 independent-render model):
// settings normalisation (labels toggle, grid clamps, auto cells), per-cell
// resolution, SVG rendering + slicing, and the sampler. Runs on any OS.
import assert from 'assert';
const P = '../com.ulanzi.sysmonitor.ulanziPlugin/plugin/monitor';
const { parseKey } = await import(`${P}/layout.js`);
const { buildInner, keyDataUri, switchKeyDataUri, CELL } = await import(`${P}/render.js`);
const { readSettings, labelsOn, parseCell, resolveCell, readSwitchSettings, buildHostCycle } = await import(`${P}/settings.js`);
const Sampler = (await import(`${P}/Sampler.js`)).default;
const RemoteSamplerMod = await import(`${P}/RemoteSampler.js`);
const RemoteSampler = RemoteSamplerMod.default;
const { normalizeAgentUrl } = RemoteSamplerMod;
const { MDI_LITE } = await import(`${P}/mdi-lite.js`);

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

console.log('host switch (settings + cycle):');

test('readSwitchSettings: defaults, drops urlless hosts, default icon', () => {
  const s = readSwitchSettings({});
  assert.strictEqual(s.includeLocal, true);
  assert.strictEqual(s.localAlias, 'This PC');
  assert.strictEqual(s.localIcon, 'monitor');
  assert.deepStrictEqual(s.hosts, []);
  const s2 = readSwitchSettings({
    includeLocal: 'off',
    hosts: [{ alias: 'NUC', url: '100.1.1.1:9888' }, { alias: 'empty' }, { url: 'h:1', icon: 'nas' }],
  });
  assert.strictEqual(s2.includeLocal, false);
  assert.strictEqual(s2.hosts.length, 2, 'host with no url dropped');
  assert.strictEqual(s2.hosts[0].icon, 'server', 'default icon when omitted');
  assert.strictEqual(s2.hosts[1].icon, 'nas');
});

test('buildHostCycle: local first when included; remote ids = r:<url>', () => {
  const c = buildHostCycle(readSwitchSettings({
    localAlias: 'PC', localIcon: 'monitor',
    hosts: [{ alias: 'NUC', url: '100.1.1.1:9888', icon: 'server' }],
  }));
  assert.strictEqual(c.length, 2);
  assert.deepStrictEqual(c[0], { id: 'local', alias: 'PC', icon: 'monitor', url: '' });
  assert.strictEqual(c[1].id, 'r:100.1.1.1:9888');
  // excluding local
  const c2 = buildHostCycle(readSwitchSettings({ includeLocal: false, hosts: [{ alias: 'a', url: 'x:1' }] }));
  assert.strictEqual(c2.length, 1);
  assert.strictEqual(c2[0].id, 'r:x:1');
});

test('normalizeAgentUrl: scheme, default port, /metrics path, preserves token', () => {
  assert.strictEqual(normalizeAgentUrl('100.64.1.2'), 'http://100.64.1.2:9888/metrics');
  assert.strictEqual(normalizeAgentUrl('host:7000'), 'http://host:7000/metrics');
  assert.strictEqual(normalizeAgentUrl('http://h:9888/metrics?token=abc'), 'http://h:9888/metrics?token=abc');
  assert.strictEqual(normalizeAgentUrl(''), '');
});

test('switchKeyDataUri: embeds icon path + alias; active draws accent ring', () => {
  const uri = switchKeyDataUri({ alias: 'NUC', iconPath: MDI_LITE.server, theme: 'dark', active: true });
  const svg = decode(uri);
  assert.ok(svg.includes(MDI_LITE.server.slice(0, 24)), 'icon path embedded');
  assert.ok(svg.includes('>NUC<'), 'alias rendered');
  assert.ok(svg.includes('#17a2d6') && svg.includes('stroke-width="3"'), 'active accent ring');
  const off = decode(switchKeyDataUri({ alias: 'NUC', iconPath: MDI_LITE.server, offline: true }));
  assert.ok(off.includes('#e2504a'), 'offline dot');
});

test('switchKeyDataUri: temperature digits top-right; offline hides temp', () => {
  const warm = decode(switchKeyDataUri({ alias: 'NUC', iconPath: MDI_LITE.server, temp: 47 }));
  assert.ok(warm.includes('47°'), 'shows temperature');
  const hot = decode(switchKeyDataUri({ alias: 'hive', iconPath: MDI_LITE.server, temp: 82 }));
  assert.ok(hot.includes('82°') && hot.includes('#e2504a'), 'hot temp shown in red');
  const none = decode(switchKeyDataUri({ alias: 'NUC', iconPath: MDI_LITE.server }));
  assert.ok(!none.includes('°'), 'no temp text when unavailable');
  const off = decode(switchKeyDataUri({ alias: 'NUC', iconPath: MDI_LITE.server, offline: true, temp: 47 }));
  assert.ok(!off.includes('47°'), 'offline takes precedence over temp');
});

test('curated MDI set: present, has expected host icons, light bundle', () => {
  const keys = Object.keys(MDI_LITE);
  assert.ok(keys.length > 40 && keys.length < 200, `curated, not the full bundle (${keys.length})`);
  for (const n of ['server', 'nas', 'raspberry-pi', 'memory', 'monitor', 'linux']) {
    assert.ok(MDI_LITE[n], `has ${n}`);
  }
});

console.log('remote sampler:');
await (async () => {
  // Unreachable host: never throws, marks offline, freezes history.
  const bad = new RemoteSampler('127.0.0.1:1');
  await bad.sample();
  test('RemoteSampler unreachable => ok:false, offline sub-label, empty history', () => {
    assert.strictEqual(bad.ok, false);
    assert.ok(bad.lastError, 'records an error');
    assert.strictEqual(bad.cpu.length, 0);
    assert.strictEqual(bad.subFor('cpu'), 'offline');
  });
})();

// Regression: a response that stalls mid-stream (headers sent, body never ends)
// must NOT wedge the source. Before the fix the promise never settled and
// _inflight stuck true forever, silently killing the host until a restart.
await (async () => {
  const http = await import('http');
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.write('{"cpu":1');            // partial — intentionally never res.end()
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const rs = new RemoteSampler(`127.0.0.1:${port}`, 120, 400);  // 400ms deadline
  const t0 = Date.now();
  await rs.sample();
  const dt = Date.now() - t0;
  await rs.sample();                   // must NOT be blocked by a stuck _inflight
  test('stalled mid-stream response settles and never wedges _inflight', () => {
    assert.ok(dt < 2500, `sample() returned promptly (${dt}ms), not hung`);
    assert.strictEqual(rs._inflight, false, '_inflight cleared after a stall');
    assert.strictEqual(rs.ok, false, 'source marked offline, not stuck');
  });
  if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
  server.close();
})();

console.log(`\n${passed} checks passed`);
