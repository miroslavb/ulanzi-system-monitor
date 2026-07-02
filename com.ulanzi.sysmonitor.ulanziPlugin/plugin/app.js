// Main service for the System Monitor (Task-Manager-style) Ulanzi plugin.
//
// Two action kinds, one process (so they share state trivially):
//   * "System Monitor" (graph) — live CPU/RAM graph tiled across keys.
//   * "Host Switch" (cycler)    — one key holding a list of hosts; each press
//     switches the DATA SOURCE that every graph key reads from, to the next host.
//
// Data sources:
//   * local  — this PC, sampled via Node `os` (Sampler).
//   * remote — a Tailscale host running sysmon-agent, polled over HTTP
//     (RemoteSampler). Sources are created lazily on first selection.
//
// v1.2.x robustness against D200H quirks is kept: graph instances are keyed by
// the STABLE actionid (not the flip-prone "col_row" key) and each key renders
// independently (whole grid graph, cropped to its own cell).

import path from 'path';
import { fileURLToPath } from 'url';
import { UlanziApi } from './common-node/index.js';
import Sampler from './monitor/Sampler.js';
import RemoteSampler, { normalizeAgentUrl } from './monitor/RemoteSampler.js';
import { buildInner, keyDataUri, buildDiagnostic, switchKeyDataUri } from './monitor/render.js';
import { parseKey } from './monitor/layout.js';
import { readSettings, readSwitchSettings, buildHostCycle, resolveCell, DEFAULT_MS } from './monitor/settings.js';
import { loadState, saveState } from './monitor/persist.js';
import { MDI_LITE } from './monitor/mdi-lite.js';

const PLUGIN_UUID = 'com.ulanzi.ulanzistudio.sysmonitor';
const MIN_MS = 250, MAX_MS = 2000;

const $UD = new UlanziApi();

// --- data sources ------------------------------------------------------------
const sources = { local: new Sampler() };   // id -> sampler (local + remotes)
let currentSourceId = 'local';               // the source every graph key reads from

function ensureSource(id, url) {
  if (id === 'local') return sources.local;
  if (!sources[id]) sources[id] = new RemoteSampler(url);
  return sources[id];
}
function activeSource() { return sources[currentSourceId] || sources.local; }

// --- Studio-restart resilience -------------------------------------------------
// Studio does not reliably re-deliver stored key settings to the backend after a
// restart (the PI shows them; the backend never gets them) — without this the
// Host Switch would silently lose its remote-hosts list. See persist.js.
const PERSIST_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'monitor', '.switch-state.json');
const persisted = loadState(PERSIST_FILE);   // { switch: {...}, currentSourceId } | null

// Come back on the same host the deck was showing before the restart.
if (persisted && persisted.currentSourceId && persisted.currentSourceId !== 'local') {
  const h = ((persisted.switch && persisted.switch.hosts) || [])
    .find((x) => x && x.url && 'r:' + x.url === persisted.currentSourceId);
  if (h) { ensureSource('r:' + h.url, h.url); currentSourceId = 'r:' + h.url; }
}

function persistSwitchState(s) {
  saveState(PERSIST_FILE, {
    switch: {
      includeLocal: s.includeLocal, localAlias: s.localAlias, localIcon: s.localIcon,
      hosts: s.hosts, theme: s.theme, smoothTemp: s.smoothTemp,
    },
    currentSourceId,
  });
}

// Ask Studio for a key's saved settings at most once per actionid (reply comes
// back as didReceiveSettings → upsert), so a genuinely never-configured key
// can't cause a request loop.
const settingsRequested = new Set();
function pullSettingsOnce(id, context) {
  if (settingsRequested.has(id)) return;
  settingsRequested.add(id);
  try { $UD.getSettings(context); } catch (e) { /* fail-open */ }
}

// --- instances ---------------------------------------------------------------
const graphs = {};       // actionid -> { id, context, keyCol, keyRow, active, ...graphSettings }
const switches = {};     // actionid -> { id, context, active, index, ...switchSettings }
let refreshMs = DEFAULT_MS;
let timer = null;

$UD.connect(PLUGIN_UUID);
$UD.onConnected(() => {
  $UD.logMessage('System Monitor plugin connected', 'info');
  startTimer();
});

function decode(ctx) {
  const dec = $UD.decodeContext(ctx);
  return { id: dec.actionid || ctx, key: dec.key, uuid: dec.uuid || '' };
}
function isSwitch(uuid) { return String(uuid).endsWith('.hostswitch'); }

// --- add / update ------------------------------------------------------------
function upsert(jsn) {
  const { id, key, uuid } = decode(jsn.context);
  if (isSwitch(uuid)) return upsertSwitch(id, jsn);
  return upsertGraph(id, key, jsn);
}

function upsertGraph(id, key, jsn) {
  if (!graphs[id]) {
    const { col, row } = parseKey(key);                 // position LOCKED on first sight
    $UD.logMessage(`add graph actionid="${id}" key="${key}" -> col=${col} row=${row}`, 'debug');
    graphs[id] = { id, context: jsn.context, keyCol: col, keyRow: row, active: true };
  }
  graphs[id].context = jsn.context;
  Object.assign(graphs[id], readSettings(jsn.param));
  // Re-added without params after a Studio restart → pull the saved ones.
  if (!jsn.param || Object.keys(jsn.param).length === 0) pullSettingsOnce(id, jsn.context);
  recomputeRefresh();
  paint();
}

function upsertSwitch(id, jsn) {
  const created = !switches[id];
  if (created) {
    $UD.logMessage(`add hostswitch actionid="${id}"`, 'debug');
    switches[id] = { id, context: jsn.context, active: true, index: 0 };
  }
  switches[id].context = jsn.context;

  // Params carrying a `hosts` array are authoritative (the PI always sends the
  // full form — including an intentionally emptied list). Params WITHOUT it mean
  // Studio re-added the key but dropped the stored settings (restart): seed from
  // the persisted copy and ask Studio for the real ones (once per key).
  if (jsn.param && Array.isArray(jsn.param.hosts)) {
    Object.assign(switches[id], readSwitchSettings(jsn.param));
    persistSwitchState(switches[id]);
  } else {
    const seed = (persisted && persisted.switch) || jsn.param || {};
    Object.assign(switches[id], readSwitchSettings(seed));
    pullSettingsOnce(id, jsn.context);
  }

  // Keep the selected index within the (possibly re-sized) cycle; a freshly
  // (re-)created key points at the restored current source, not entry 0.
  const cycle = buildHostCycle(switches[id]);
  if (cycle.length) {
    if (created) {
      const ci = cycle.findIndex((c) => c.id === currentSourceId);
      if (ci >= 0) switches[id].index = ci;
    }
    switches[id].index = ((switches[id].index % cycle.length) + cycle.length) % cycle.length;
  } else switches[id].index = 0;
  paintSwitch(switches[id]);
}

$UD.onAdd((jsn) => upsert(jsn));
$UD.onParamFromPlugin((jsn) => upsert(jsn));
$UD.onParamFromApp((jsn) => upsert(jsn));
// Reply to our getSettings pull; Studio may put the payload in `param` or `settings`.
$UD.onDidReceiveSettings((jsn) => {
  if (!jsn || !jsn.context) return;
  upsert({ context: jsn.context, param: jsn.param || jsn.settings || {} });
});

$UD.onSetActive((jsn) => {
  const { id, uuid } = decode(jsn.context);
  const inst = isSwitch(uuid) ? switches[id] : graphs[id];
  if (inst) inst.active = !!jsn.active;
});

$UD.onClear((jsn) => {
  if (!jsn.param) return;
  for (const item of jsn.param) {
    const { id, uuid } = decode(item.context);
    if (isSwitch(uuid)) delete switches[id]; else delete graphs[id];
  }
});

// --- press: cycle the data source --------------------------------------------
$UD.onRun((jsn) => {
  const { id, uuid } = decode(jsn.context);
  if (!isSwitch(uuid)) return;                 // graph keys do nothing on press
  const s = switches[id];
  if (!s) return;
  const cycle = buildHostCycle(s);
  if (!cycle.length) return;
  s.index = (s.index + 1) % cycle.length;
  const sel = cycle[s.index];
  ensureSource(sel.id, sel.url);
  currentSourceId = sel.id;
  persistSwitchState(s);          // survive a Studio restart on the same host
  $UD.logMessage(`host switch -> ${sel.alias} (${sel.id})`, 'info');
  // Sample the newly selected source right away, then repaint everything.
  Promise.resolve(activeSource().sample && activeSource().sample()).finally(paint);
});

// --- sampling + painting -----------------------------------------------------

function recomputeRefresh() {
  const wanted = Object.values(graphs).map((i) => i.refresh || DEFAULT_MS);
  const next = Math.max(MIN_MS, Math.min(MAX_MS, wanted.length ? Math.min(...wanted) : DEFAULT_MS));
  if (next !== refreshMs) { refreshMs = next; startTimer(); }
}

function startTimer() {
  if (timer) clearInterval(timer);
  timer = setInterval(tick, refreshMs);
}

async function tick() {
  sources.local.sample();                       // local is cheap — always keep it fresh
  const cur = activeSource();
  if (cur !== sources.local && typeof cur.sample === 'function') {
    try { await cur.sample(); } catch (e) { /* RemoteSampler never throws, but be safe */ }
  }
  paint();
}

function paint() {
  paintGraphs();
  for (const s of Object.values(switches)) paintSwitch(s);
}

// Each graph key paints itself: full grid graph cropped to its own cell, from
// whichever data source is currently selected.
function paintGraphs() {
  const src = activeSource();
  for (const inst of Object.values(graphs)) {
    if (inst.active === false) continue;
    const metric = inst.metric === 'mem' ? 'mem' : 'cpu';
    const history = metric === 'mem' ? src.mem : src.cpu;
    const value = metric === 'mem' ? src.lastMem.pct : src.lastCpu;
    const colIndex = resolveCell(inst.cellCol, inst.keyCol, inst.cols);
    const rowIndex = resolveCell(inst.cellRow, inst.keyRow, inst.rows);

    if (inst.diag) {
      $UD.setBaseDataIcon(inst.context, buildDiagnostic({
        metric, history, value, theme: inst.theme,
        lines: [`src:${currentSourceId.slice(0, 8)}`, `id:${String(inst.id).slice(-4)}`,
                `grid ${inst.cols}x${inst.rows}`, `cell ${colIndex},${rowIndex}`, `m:${metric[0]}`],
      }), '');
      continue;
    }

    const inner = buildInner({
      metric, history, cols: inst.cols, rows: inst.rows,
      theme: inst.theme, showText: inst.showText, value, sub: src.subFor(metric),
    });
    $UD.setBaseDataIcon(inst.context, keyDataUri(inner, colIndex, rowIndex, inst.cols, inst.rows), '');
  }
}

function paintSwitch(s) {
  if (!s || s.active === false) return;
  const cycle = buildHostCycle(s);
  if (!cycle.length) {
    $UD.setBaseDataIcon(s.context, switchKeyDataUri({ alias: 'No hosts', iconPath: MDI_LITE.server, theme: s.theme }), '');
    return;
  }
  const sel = cycle[Math.min(s.index, cycle.length - 1)];
  const active = sel.id === currentSourceId;
  const src = sources[sel.id];
  const offline = active && sel.id !== 'local' && src && src.ok === false;
  // Temperature is only meaningful for a source we actually sample (the active
  // remote, or local which is sampled every tick) and only when reachable.
  // Show the median-smoothed value, or the raw reading when the switcher's
  // "Smooth temperature" option is off.
  const haveTemp = src && (sel.id === 'local' || active) && src.ok !== false;
  const tval = haveTemp ? (s.smoothTemp === false ? src.tempRaw : src.temp) : null;
  const temp = (typeof tval === 'number') ? tval : null;
  const iconPath = MDI_LITE[sel.icon] || MDI_LITE.server || '';
  $UD.setBaseDataIcon(s.context, switchKeyDataUri({
    alias: sel.alias, iconPath, theme: s.theme, active, offline, temp,
  }), '');
}

// --- shutdown ----------------------------------------------------------------
function shutdown() { if (timer) clearInterval(timer); process.exit(0); }
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
