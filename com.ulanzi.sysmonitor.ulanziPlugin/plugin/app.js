// Main service for the System Monitor (Task-Manager-style) Ulanzi plugin.
//
// One process samples CPU + memory and repaints every placed key. Keys on the same
// row form a strip; a single wide graph is drawn and cropped per key via viewBox.

import { UlanziApi } from './common-node/index.js';
import Sampler from './monitor/Sampler.js';
import { buildInner, keyDataUri } from './monitor/render.js';
import { computeStrips, parseKey } from './monitor/layout.js';

const PLUGIN_UUID = 'com.ulanzi.ulanzistudio.sysmonitor';
const MIN_MS = 250, MAX_MS = 2000, DEFAULT_MS = 500;

const $UD = new UlanziApi();
const sampler = new Sampler();
const INSTANCES = {};            // context -> { context, col, row, active, metric, theme, showText, refresh }
let refreshMs = DEFAULT_MS;
let timer = null;
let fallbackCol = 0;     // used only if the host key id isn't "col_row"

// Resolve a key's grid position. The host uses "col_row"; if a future device uses
// a different scheme, tile keys left-to-right in placement order rather than collapse.
function positionFor(key) {
  if (/^\d+_\d+$/.test(String(key))) return parseKey(key);
  return { col: fallbackCol++, row: 0 };
}

$UD.connect(PLUGIN_UUID);
$UD.onConnected(() => {
  $UD.logMessage('System Monitor plugin connected', 'info');
  startTimer();
});

function readSettings(param = {}) {
  const refresh = parseInt(param.refresh, 10);
  return {
    metric: ['cpu', 'mem', 'auto'].includes(param.metric) ? param.metric : 'auto',
    theme: param.theme === 'light' ? 'light' : 'dark',
    showText: !(param.showText === 'off' || param.showText === false),
    refresh: Number.isFinite(refresh) ? refresh : DEFAULT_MS,
  };
}

function upsert(jsn, applyOnly = false) {
  const ctx = jsn.context;
  const s = readSettings(jsn.param);
  if (!INSTANCES[ctx]) {
    const { col, row } = positionFor($UD.decodeContext(ctx).key);
    INSTANCES[ctx] = { context: ctx, col, row, active: true };
  }
  Object.assign(INSTANCES[ctx], s);
  recomputeRefresh();
  if (!applyOnly) paint();      // immediate repaint so changes show at once
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
  const strips = computeStrips(Object.values(INSTANCES));
  for (const strip of strips) {
    if (!strip.keys.length) continue;
    const first = INSTANCES[strip.keys[0].context];
    const history = strip.metric === 'mem' ? sampler.mem : sampler.cpu;
    const value = strip.metric === 'mem' ? sampler.lastMem.pct : sampler.lastCpu;
    const inner = buildInner({
      metric: strip.metric,
      history,
      cols: strip.cols,
      theme: first.theme,
      showText: first.showText,
      value,
      sub: sampler.subFor(strip.metric),
    });
    for (const k of strip.keys) {
      $UD.setBaseDataIcon(k.context, keyDataUri(inner, k.colIndex, strip.cols), '');
    }
  }
}

// --- shutdown ----------------------------------------------------------------

function shutdown() { if (timer) clearInterval(timer); process.exit(0); }
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
