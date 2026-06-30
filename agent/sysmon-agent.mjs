#!/usr/bin/env node
// sysmon-agent — tiny zero-dependency metrics endpoint for the Ulanzi System
// Monitor plugin's remote (Tailscale) host sources.
//
// Run one of these on each host you want to monitor. It samples CPU + memory
// locally (Node `os`, cross-platform: Linux / macOS / Windows) and serves the
// latest snapshot as JSON over HTTP. The Ulanzi plugin (running on the PC with
// Ulanzi Studio) fetches it over your Tailscale network.
//
//   node sysmon-agent.mjs
//
// Config via env vars:
//   SYSMON_AGENT_PORT   listen port           (default 9888)
//   SYSMON_AGENT_BIND   bind address          (default 0.0.0.0 — restrict via Tailscale ACLs)
//   SYSMON_AGENT_TOKEN  optional shared secret; if set, requests must carry it as
//                       `?token=...` or `Authorization: Bearer ...`
//
// Endpoints:
//   GET /metrics  (alias: GET /)  -> { host, cpu, mem:{pct,usedGB,totalGB}, cores, ts, uptime }
//   GET /healthz                  -> "ok"
//
// No external dependencies — only Node built-ins, so it runs anywhere Node does.

import http from 'http';
import os from 'os';
import fs from 'fs';

// Preferred CPU thermal-zone types, best first. Linux only; null elsewhere.
const TEMP_PRI = ['x86_pkg_temp', 'cpu-thermal', 'cpu_thermal', 'coretemp', 'k10temp', 'soc_thermal', 'soc', 'acpitz'];
function readTemp() {
  if (os.platform() !== 'linux') return null;
  const zones = {};
  let dirs = [];
  try { dirs = fs.readdirSync('/sys/class/thermal'); } catch (e) { dirs = []; }
  for (const d of dirs) {
    if (!d.startsWith('thermal_zone')) continue;
    try {
      const t = fs.readFileSync(`/sys/class/thermal/${d}/type`, 'utf8').trim();
      const v = parseInt(fs.readFileSync(`/sys/class/thermal/${d}/temp`, 'utf8').trim(), 10);
      if (v > 0 && v < 200000 && zones[t] == null) zones[t] = v;
    } catch (e) { /* ignore */ }
  }
  for (const p of TEMP_PRI) if (zones[p] != null) return Math.round(zones[p] / 1000);
  const vals = Object.values(zones);
  return vals.length ? Math.round(Math.max(...vals) / 1000) : null;
}

const PORT = parseInt(process.env.SYSMON_AGENT_PORT || '9888', 10);
const BIND = process.env.SYSMON_AGENT_BIND || '0.0.0.0';
const TOKEN = process.env.SYSMON_AGENT_TOKEN || '';
const GB = 1024 * 1024 * 1024;
const clamp = (v) => Math.max(0, Math.min(100, v));

// --- CPU sampling (idle/total deltas across all cores) -----------------------
function cpuTimes() {
  let idle = 0, total = 0;
  for (const c of os.cpus() || []) {
    for (const k in c.times) total += c.times[k];
    idle += c.times.idle;
  }
  return { idle, total };
}

let prev = cpuTimes();
let lastCpu = 0;
// Sample on a steady internal cadence so CPU% is accurate regardless of how
// often (or rarely) the plugin polls us.
function tick() {
  const t = cpuTimes();
  const dIdle = t.idle - prev.idle;
  const dTotal = t.total - prev.total;
  prev = t;
  if (dTotal > 0) lastCpu = clamp(100 * (1 - dIdle / dTotal));
}
setInterval(tick, 1000).unref();

function snapshot() {
  const total = os.totalmem();
  const free = os.freemem();
  const used = total - free;
  return {
    host: os.hostname(),
    platform: os.platform(),
    cpu: Math.round(lastCpu * 10) / 10,
    mem: {
      pct: Math.round(clamp((used / total) * 100) * 10) / 10,
      usedGB: Math.round((used / GB) * 100) / 100,
      totalGB: Math.round((total / GB) * 100) / 100,
    },
    cores: (os.cpus() || []).length,
    temp: readTemp(),
    uptime: Math.round(os.uptime()),
    ts: Date.now(),
  };
}

// --- auth --------------------------------------------------------------------
function authorized(req, url) {
  if (!TOKEN) return true;
  const q = url.searchParams.get('token');
  if (q && q === TOKEN) return true;
  const h = req.headers['authorization'] || '';
  return h === `Bearer ${TOKEN}`;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (url.pathname === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end('ok');
  }
  if (url.pathname === '/metrics' || url.pathname === '/') {
    if (!authorized(req, url)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'unauthorized' }));
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(snapshot()));
  }
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
});

server.listen(PORT, BIND, () => {
  // eslint-disable-next-line no-console
  console.log(`[sysmon-agent] listening on ${BIND}:${PORT}` + (TOKEN ? ' (token required)' : ''));
});

process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT', () => server.close(() => process.exit(0)));
