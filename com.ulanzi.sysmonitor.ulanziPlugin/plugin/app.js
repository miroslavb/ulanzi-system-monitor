// Main service for the System Monitor (Task-Manager-style) Ulanzi plugin.
//
// v1.2.0 — robust against the D200H quirks observed on hardware:
//   * instances are keyed by the STABLE actionid, not the "col_row" key (which can
//     flip/duplicate on this device — that flicker created duplicate instances);
//   * each key's grid position is LOCKED on first sight (ignores later id flips);
//   * each key renders INDEPENDENTLY (draws the whole grid graph, crops its own
//     cell) — no cross-key grouping, so stale instances / duplicate ids / pages
//     can't blank or scramble the graph.

import { UlanziApi } from './common-node/index.js';
import Sampler from './monitor/Sampler.js';
import { buildInner, keyDataUri, buildDiagnostic } from './monitor/render.js';
import { parseKey } from './monitor/layout.js';
import { readSettings, resolveCell, DEFAULT_MS } from './monitor/settings.js';

const PLUGIN_UUID = 'com.ulanzi.ulanzistudio.sysmonitor';
const MIN_MS = 250, MAX_MS = 2000;

const $UD = new UlanziApi();
const sampler = new Sampler();
const INSTANCES = {};            // actionid -> { id, context, keyCol, keyRow, active, ...settings }
let refreshMs = DEFAULT_MS;
let timer = null;

$UD.connect(PLUGIN_UUID);
$UD.onConnected(() => {
  $UD.logMessage('System Monitor plugin connected', 'info');
  startTimer();
});

function idOf(ctx) {
  const dec = $UD.decodeContext(ctx);
  return { id: dec.actionid || ctx, key: dec.key };
}

function upsert(jsn) {
  const { id, key } = idOf(jsn.context);
  if (!INSTANCES[id]) {
    const { col, row } = parseKey(key);                 // position LOCKED on first sight
    $UD.logMessage(`add actionid="${id}" key="${key}" -> col=${col} row=${row}`, 'debug');
    INSTANCES[id] = { id, context: jsn.context, keyCol: col, keyRow: row, active: true };
  }
  INSTANCES[id].context = jsn.context;                  // keep the freshest context for painting
  Object.assign(INSTANCES[id], readSettings(jsn.param));
  recomputeRefresh();
  paint();
}

$UD.onAdd((jsn) => upsert(jsn));
$UD.onParamFromPlugin((jsn) => upsert(jsn));
$UD.onParamFromApp((jsn) => upsert(jsn));

$UD.onSetActive((jsn) => {
  const inst = INSTANCES[idOf(jsn.context).id];
  if (inst) inst.active = !!jsn.active;
});

$UD.onClear((jsn) => {
  if (!jsn.param) return;
  for (const item of jsn.param) delete INSTANCES[idOf(item.context).id];
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

// Each key paints itself: full grid graph cropped to its own cell. No grouping.
function paint() {
  for (const inst of Object.values(INSTANCES)) {
    if (inst.active === false) continue;
    const metric = inst.metric === 'mem' ? 'mem' : 'cpu';
    const history = metric === 'mem' ? sampler.mem : sampler.cpu;
    const value = metric === 'mem' ? sampler.lastMem.pct : sampler.lastCpu;
    const colIndex = resolveCell(inst.cellCol, inst.keyCol, inst.cols);
    const rowIndex = resolveCell(inst.cellRow, inst.keyRow, inst.rows);

    if (inst.diag) {
      $UD.setBaseDataIcon(inst.context, buildDiagnostic({
        metric, history, value, theme: inst.theme,
        lines: [`id:${String(inst.id).slice(-4)}`, `k:${inst.keyCol},${inst.keyRow}`,
                `grid ${inst.cols}x${inst.rows}`, `cell ${colIndex},${rowIndex}`, `m:${metric[0]} t:${inst.showText ? 1 : 0}`],
      }), '');
      continue;
    }

    const inner = buildInner({
      metric, history, cols: inst.cols, rows: inst.rows,
      theme: inst.theme, showText: inst.showText, value, sub: sampler.subFor(metric),
    });
    $UD.setBaseDataIcon(inst.context, keyDataUri(inner, colIndex, rowIndex, inst.cols, inst.rows), '');
  }
}

// --- shutdown ----------------------------------------------------------------

function shutdown() { if (timer) clearInterval(timer); process.exit(0); }
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
