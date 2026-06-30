// Sampler.js — CPU + memory utilisation sampling and rolling history.
// Pure Node `os` module: works on Windows and macOS, no native dependencies.

import os from 'os';
import fs from 'fs';
import { execFile } from 'child_process';
import { HISTORY } from './render.js';
import { medianTemp } from './RemoteSampler.js';

const clamp = (v) => Math.max(0, Math.min(100, v));
const GB = 1024 * 1024 * 1024;

// CPU temperature in whole °C from Linux /sys (synchronous, cheap), or null.
const TEMP_PRI = ['x86_pkg_temp', 'cpu-thermal', 'cpu_thermal', 'coretemp', 'k10temp', 'soc_thermal', 'soc', 'acpitz'];
function readLinuxTemp() {
  const zones = {};
  let dirs = [];
  try { dirs = fs.readdirSync('/sys/class/thermal'); } catch (e) { return null; }
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

// Windows has no /sys; CPU temp comes from WMI. Best-effort, async, cached:
// try LibreHardwareMonitor / OpenHardwareMonitor (accurate, if the user runs one),
// then the ACPI thermal zone (often "not supported" on desktops). Prints a bare
// °C integer, or nothing when unavailable (→ no temp shown, which is fine).
// CPU temp sensors are matched by Identifier (/intelcpu/ or /amdcpu/) — robust
// across Intel ("CPU Package") and AMD ("Core (Tctl/Tdie)") naming.
const WIN_TEMP_PS = [
  '$t=$null',
  "try{$s=Get-CimInstance -Namespace root/LibreHardwareMonitor -ClassName Sensor -ErrorAction Stop|?{$_.SensorType -eq 'Temperature' -and $_.Identifier -match '/(intel|amd)cpu/'};if($s){$t=($s|Measure-Object Value -Maximum).Maximum}}catch{}",
  "if($t -eq $null){try{$s=Get-CimInstance -Namespace root/OpenHardwareMonitor -ClassName Sensor -ErrorAction Stop|?{$_.SensorType -eq 'Temperature' -and $_.Identifier -match '/(intel|amd)cpu/'};if($s){$t=($s|Measure-Object Value -Maximum).Maximum}}catch{}}",
  'if($t -eq $null){try{$z=Get-CimInstance -Namespace root/wmi -ClassName MSAcpi_ThermalZoneTemperature -ErrorAction Stop;if($z){$t=(($z|Measure-Object CurrentTemperature -Maximum).Maximum/10)-273.15}}catch{}}',
  'if($t -ne $null){[math]::Round($t)}',
].join(';');

export default class Sampler {
  constructor(maxHistory = HISTORY) {
    this.max = maxHistory;
    this.cpu = [];           // %, oldest..newest
    this.mem = [];           // %, oldest..newest
    this.cores = os.cpus().length;
    this._tempHist = [];
    const raw0 = os.platform() === 'linux' ? readLinuxTemp() : null;
    this.tempRaw = raw0;                                  // latest raw (smoothing off)
    this.temp = medianTemp(this._tempHist, raw0);         // median-smoothed (smoothing on)
    this._winPolling = false;
    this._prev = this._cpuTimes();
    this.lastCpu = 0;
    this.lastMem = { pct: 0, usedGB: 0, totalGB: os.totalmem() / GB };

    // Windows temp can't be read synchronously — poll WMI on a slow timer.
    if (os.platform() === 'win32') {
      this._pollWinTemp();
      const timer = setInterval(() => this._pollWinTemp(), 5000);
      if (timer.unref) timer.unref();
    }
  }

  // Best-effort Windows CPU temp via PowerShell/WMI; updates this.temp when it can.
  _pollWinTemp() {
    if (this._winPolling) return;
    this._winPolling = true;
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', WIN_TEMP_PS],
      { timeout: 4000, windowsHide: true },
      (err, stdout) => {
        this._winPolling = false;
        if (err) return;                 // keep the last value on failure
        const n = parseInt(String(stdout).trim(), 10);
        if (Number.isFinite(n) && n > 0 && n < 150) { this.tempRaw = n; this.temp = medianTemp(this._tempHist, n); }
      });
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
    if (os.platform() === 'linux') {                     // win/mac: set by the poller
      const raw = readLinuxTemp();
      this.tempRaw = raw;
      this.temp = medianTemp(this._tempHist, raw);
    }
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
