// RemoteSampler.js — a data source backed by a remote sysmon-agent over HTTP.
//
// Mirrors the public shape of the local Sampler (cpu[]/mem[] history, lastCpu,
// lastMem, cores, subFor()), so render/paint code treats local and remote
// sources identically. CPU% is computed by the agent; we just fetch the latest
// snapshot and append it to a rolling history. Pure Node built-ins (http/https)
// — no global fetch needed and no CORS (this runs under Node, not a webview).

import http from 'http';
import https from 'https';
import { HISTORY } from './render.js';

const clamp = (v) => Math.max(0, Math.min(100, Number(v) || 0));

// Accept "100.x.y.z:9888", "host", "http://host:9888", "https://h/metrics?token=..".
// Normalise to a full URL whose path is /metrics, preserving any query (token).
export function normalizeAgentUrl(raw) {
  let s = String(raw || '').trim();
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) s = 'http://' + s;
  let u;
  try { u = new URL(s); } catch { return ''; }
  if (!u.port && u.protocol === 'http:') u.port = '9888';   // default agent port
  if (!u.pathname || u.pathname === '/') u.pathname = '/metrics';
  return u.toString();
}

export default class RemoteSampler {
  constructor(url, maxHistory = HISTORY, timeoutMs = 2500) {
    this.url = normalizeAgentUrl(url);
    this.max = maxHistory;
    this.timeoutMs = timeoutMs;
    this.cpu = [];
    this.mem = [];
    this.cores = 0;
    this.lastCpu = 0;
    this.lastMem = { pct: 0, usedGB: 0, totalGB: 0 };
    this.ok = false;            // last fetch reachable?
    this.lastError = null;
    this.remoteHost = '';       // hostname reported by the agent
    this._inflight = false;
    this._inflightSince = 0;
  }

  // Fetch the agent JSON. The returned promise is GUARANTEED to settle: an
  // absolute deadline timer plus handlers for socket error / mid-stream abort /
  // oversize all route through one idempotent `finish()`. (Earlier versions only
  // listened for `req` errors + a socket-idle timeout, so a response that stalled
  // after headers left the promise hanging — which wedged `_inflight` true and
  // silently killed the source until the plugin restarted.)
  _get() {
    const timeoutMs = this.timeoutMs;
    return new Promise((resolve, reject) => {
      let settled = false;
      let req = null;
      const finish = (err, val) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try { if (req) req.destroy(); } catch (e) {}
        if (err) reject(err); else resolve(val);
      };
      const timer = setTimeout(() => finish(new Error('timeout')), timeoutMs);

      let u;
      try { u = new URL(this.url); } catch (e) { return finish(new Error('bad url')); }
      const lib = u.protocol === 'https:' ? https : http;
      req = lib.get(u, (res) => {
        if (res.statusCode !== 200) { res.resume(); return finish(new Error('HTTP ' + res.statusCode)); }
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (c) => { body += c; if (body.length > 1e6) finish(new Error('too large')); });
        res.on('aborted', () => finish(new Error('response aborted')));
        res.on('error', (e) => finish(e));
        res.on('end', () => {
          try { finish(null, JSON.parse(body)); }
          catch (e) { finish(new Error('bad json')); }
        });
      });
      req.on('error', (e) => finish(e));
    });
  }

  // Async — fetch one snapshot and append to history. Never throws; on failure
  // it marks the source unreachable and freezes the existing history.
  async sample() {
    if (this._inflight) {
      // Insurance: never let a wedged request kill this source permanently — if a
      // poll has somehow been "in flight" far longer than the timeout, force-reset.
      if (this._inflightSince && Date.now() - this._inflightSince > this.timeoutMs * 4) {
        this._inflight = false;
      } else {
        return;                          // a poll is genuinely in progress — skip
      }
    }
    this._inflight = true;
    this._inflightSince = Date.now();
    try {
      const d = await this._get();
      const cpu = clamp(d.cpu);
      const memPct = clamp(d.mem && d.mem.pct);
      this._push(this.cpu, cpu);
      this._push(this.mem, memPct);
      this.lastCpu = cpu;
      this.lastMem = {
        pct: memPct,
        usedGB: Number(d.mem && d.mem.usedGB) || 0,
        totalGB: Number(d.mem && d.mem.totalGB) || 0,
      };
      this.cores = Number(d.cores) || this.cores;
      this.remoteHost = d.host || this.remoteHost;
      this.ok = true;
      this.lastError = null;
    } catch (e) {
      this.ok = false;
      this.lastError = e.message || String(e);
    } finally {
      this._inflight = false;
    }
    return { cpu: this.lastCpu, mem: this.lastMem.pct, ok: this.ok };
  }

  _push(arr, v) {
    arr.push(v);
    while (arr.length > this.max) arr.shift();
  }

  subFor(metric) {
    if (!this.ok) return this.lastError ? 'offline' : '…';
    if (metric === 'mem') return `${this.lastMem.usedGB.toFixed(1)} / ${this.lastMem.totalGB.toFixed(1)} GB`;
    return this.cores ? `${this.cores} cores` : '';
  }
}
