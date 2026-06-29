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
  constructor(url, maxHistory = HISTORY) {
    this.url = normalizeAgentUrl(url);
    this.max = maxHistory;
    this.cpu = [];
    this.mem = [];
    this.cores = 0;
    this.lastCpu = 0;
    this.lastMem = { pct: 0, usedGB: 0, totalGB: 0 };
    this.ok = false;            // last fetch reachable?
    this.lastError = null;
    this.remoteHost = '';       // hostname reported by the agent
    this._inflight = false;
  }

  _get(timeoutMs = 2500) {
    return new Promise((resolve, reject) => {
      let u;
      try { u = new URL(this.url); } catch (e) { return reject(new Error('bad url')); }
      const lib = u.protocol === 'https:' ? https : http;
      const req = lib.get(u, (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error('HTTP ' + res.statusCode));
        }
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (c) => { body += c; if (body.length > 1e6) req.destroy(); });
        res.on('end', () => {
          try { resolve(JSON.parse(body)); }
          catch (e) { reject(new Error('bad json')); }
        });
      });
      req.on('error', reject);
      req.setTimeout(timeoutMs, () => req.destroy(new Error('timeout')));
    });
  }

  // Async — fetch one snapshot and append to history. Never throws; on failure
  // it marks the source unreachable and freezes the existing history.
  async sample() {
    if (this._inflight) return;          // don't pile up requests on a slow host
    this._inflight = true;
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
