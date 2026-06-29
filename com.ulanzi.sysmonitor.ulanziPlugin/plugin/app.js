// Main service for the System Monitor (Task-Manager-style) Ulanzi plugin.
//
// One process samples CPU + memory and repaints every placed key. Keys that share
// a metric are joined into one rectangular block; a single graph is drawn at the
// block size and cropped per key via viewBox (grows wide AND tall).

import { UlanziApi } from './common-node/index.js';
import Sampler from './monitor/Sampler.js';
import { buildInner, keyDataUri } from './monitor/render.js';
import { computeBlocks, parseKey } from './monitor/layout.js';
import { readSettings, DEFAULT_MS } from './monitor/settings.js';

const PLUGIN_UUID = 'com.ulanzi.ulanzistudio.sysmonitor';
const MIN_MS = 250, MAX_MS = 2000;

const $UD = new UlanziApi();
const sampler = new Sampler();
const INSTANCES = {};            // context -> { context, col, row, active, metric, theme, showText, refresh }
let refreshMs = DEFAULT_MS;
let timer = null;
let fallbackCol = 0;             // used only if the host key id isn't "col_row"

$UD.connect(PLUGIN_UUID);
$UD.onConnected(() => {
  $UD.logMessage('System Monitor plugin connected', 'info');
  startTimer();
});

// Resolve a key's grid position. Host uses "col_row"; unknown schemes tile L→R.
function positionFor(key) {
  if (/^\d+_\d+$/.test(String(key))) return parseKey(key);
  return { col: fallbackCol++, row: 0 };
}

function upsert(jsn) {
  const ctx = jsn.context;
  if (!INSTANCES[ctx]) {
    const key = $UD.decodeContext(ctx).key;
    const { col, row } = positionFor(key);
    $UD.logMessage(`add key="${key}" -> col=${col} row=${row}`, 'debug');
    INSTANCES[ctx] = { context: ctx, col, row, active: true };
  }
  Object.assign(INSTANCES[ctx], readSettings(jsn.param));
  recomputeRefresh();
  paint();
}

$UD.onAdd((jsn) => upsert(jsn));
$UD.onParamFromPlugin((jsn) => upsert(jsn));
$UD.onParamFromApp((jsn) => upsert(jsn));

$UD.onSetActive((jsn) => {
  const inst = INSTANCES[jsn.context];
  if (inst) inst.active = !!jsn.active;
});

$UD.onClear((jsn) => {
  if (!jsn.param) return;
  for (const item of jsn.param) delete INSTANCES[item.context];
});

// --- sampling + painting -----------------------------------------------------

function recomputeRefresh() {
  const wanted = Object.values(INSTANCES).map((i) => i.refresh || DEFAULT_MS);
  const next = Math.max(MIN_MS, Math.min(MAX_MS, wanted.length ? Math.min(...wanted) : DEFAULT_MS));
  if (next !== refreshMs) { refreshMs = next; startTimer(); }
}

function startTimer() {
  if (timer) clearInterval(timer);
  timer = setInterval(tick, refreshMs);
}

function tick() {
  sampler.sample();
  paint();
}

function paint() {
  const blocks = computeBlocks(Object.values(INSTANCES));
  for (const b of blocks) {
    if (!b.keys.length) continue;
    const first = INSTANCES[b.keys[0].context];
    const history = b.metric === 'mem' ? sampler.mem : sampler.cpu;
    const value = b.metric === 'mem' ? sampler.lastMem.pct : sampler.lastCpu;
    const inner = buildInner({
      metric: b.metric,
      history,
      cols: b.cols,
      rows: b.rows,
      theme: first.theme,
      showText: first.showText,
      value,
      sub: sampler.subFor(b.metric),
    });
    for (const k of b.keys) {
      $UD.setBaseDataIcon(k.context, keyDataUri(inner, k.colIndex, k.rowIndex, b.cols, b.rows), '');
    }
  }
}

// --- shutdown ----------------------------------------------------------------

function shutdown() { if (timer) clearInterval(timer); process.exit(0); }
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
