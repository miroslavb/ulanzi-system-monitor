// Sampler.js — CPU + memory utilisation sampling and rolling history.
// Pure Node `os` module: works on Windows and macOS, no native dependencies.

import os from 'os';
import { HISTORY } from './render.js';

const clamp = (v) => Math.max(0, Math.min(100, v));
const GB = 1024 * 1024 * 1024;

export default class Sampler {
  constructor(maxHistory = HISTORY) {
    this.max = maxHistory;
    this.cpu = [];           // %, oldest..newest
    this.mem = [];           // %, oldest..newest
    this.cores = os.cpus().length;
    this._prev = this._cpuTimes();
    this.lastCpu = 0;
    this.lastMem = { pct: 0, usedGB: 0, totalGB: os.totalmem() / GB };
  }

  // Aggregate busy% across all cores via idle/total deltas between samples.
  _cpuTimes() {
    const cpus = os.cpus() || [];
    let idle = 0, total = 0;
    for (const c of cpus) {
      for (const k in c.times) total += c.times[k];
      idle += c.times.idle;
    }
    return { idle, total };
  }

  sample() {
    const t = this._cpuTimes();
    let cpuPct = 0;
    const dIdle = t.idle - this._prev.idle;
    const dTotal = t.total - this._prev.total;
    if (dTotal > 0) cpuPct = 100 * (1 - dIdle / dTotal);
    this._prev = t;
    cpuPct = clamp(cpuPct);

    const total = os.totalmem();
    const free = os.freemem();
    const used = total - free;
    const memPct = clamp((used / total) * 100);

    this._push(this.cpu, cpuPct);
    this._push(this.mem, memPct);

    this.lastCpu = cpuPct;
    this.lastMem = { pct: memPct, usedGB: used / GB, totalGB: total / GB };
    return { cpu: cpuPct, mem: memPct };
  }

  _push(arr, v) {
    arr.push(v);
    while (arr.length > this.max) arr.shift();
  }

  // Sub-labels shown under the big value, Task-Manager style.
  subFor(metric) {
    if (metric === 'mem') {
      return `${this.lastMem.usedGB.toFixed(1)} / ${this.lastMem.totalGB.toFixed(1)} GB`;
    }
    return `${this.cores} cores`;
  }
}
