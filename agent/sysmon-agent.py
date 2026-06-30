#!/usr/bin/env python3
"""sysmon-agent (Python) — CPU/RAM metrics endpoint for the Ulanzi System Monitor plugin.

Linux only (reads /proc). Stdlib only — no pip installs, so it runs on any host
with python3. Serves the SAME JSON contract as the Node agent, so the plugin
treats them identically. Use this on Linux hosts that don't have Node.

Env:
  SYSMON_AGENT_PORT   listen port           (default 9888)
  SYSMON_AGENT_BIND   bind address          (default 0.0.0.0 — set to the Tailscale IP to stay on the tailnet)
  SYSMON_AGENT_TOKEN  optional shared secret (?token=.. or Authorization: Bearer ..)

Endpoints:
  GET /metrics (or /)  -> { host, platform, cpu, mem:{pct,usedGB,totalGB}, cores, uptime, ts }
  GET /healthz         -> "ok"
"""
import json
import os
import socket
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

PORT = int(os.environ.get("SYSMON_AGENT_PORT", "9888"))
BIND = os.environ.get("SYSMON_AGENT_BIND", "0.0.0.0")
TOKEN = os.environ.get("SYSMON_AGENT_TOKEN", "")
GB = 1024 ** 3

_last_cpu = 0.0


def _cpu_times():
    with open("/proc/stat") as f:
        for line in f:
            if line.startswith("cpu "):
                p = [float(x) for x in line.split()[1:]]
                idle = p[3] + (p[4] if len(p) > 4 else 0.0)   # idle + iowait
                return idle, sum(p)
    return 0.0, 0.0


def _sample_loop():
    global _last_cpu
    prev = _cpu_times()
    while True:
        time.sleep(1)
        cur = _cpu_times()
        d_idle, d_total = cur[0] - prev[0], cur[1] - prev[1]
        prev = cur
        if d_total > 0:
            _last_cpu = max(0.0, min(100.0, 100.0 * (1 - d_idle / d_total)))


def _mem():
    info = {}
    with open("/proc/meminfo") as f:
        for line in f:
            k, _, v = line.partition(":")
            try:
                info[k] = float(v.strip().split()[0]) * 1024  # kB -> bytes
            except (IndexError, ValueError):
                pass
    total = info.get("MemTotal", 0.0)
    avail = info.get("MemAvailable", info.get("MemFree", 0.0))
    used = max(0.0, total - avail)
    pct = (used / total * 100) if total else 0.0
    return round(pct, 1), round(used / GB, 2), round(total / GB, 2)


def _uptime():
    try:
        with open("/proc/uptime") as f:
            return int(float(f.read().split()[0]))
    except Exception:
        return 0


def _snapshot():
    pct, used_gb, total_gb = _mem()
    return {
        "host": socket.gethostname(),
        "platform": "linux",
        "cpu": round(_last_cpu, 1),
        "mem": {"pct": pct, "usedGB": used_gb, "totalGB": total_gb},
        "cores": os.cpu_count() or 0,
        "uptime": _uptime(),
        "ts": int(time.time() * 1000),
    }


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _send(self, code, body, ctype="application/json"):
        b = body.encode() if isinstance(body, str) else body
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def _authed(self, q):
        if not TOKEN:
            return True
        if q.get("token", [None])[0] == TOKEN:
            return True
        return self.headers.get("Authorization", "") == "Bearer " + TOKEN

    def do_GET(self):
        u = urlparse(self.path)
        if u.path == "/healthz":
            return self._send(200, "ok", "text/plain")
        if u.path in ("/metrics", "/"):
            if not self._authed(parse_qs(u.query)):
                return self._send(401, json.dumps({"error": "unauthorized"}))
            return self._send(200, json.dumps(_snapshot()))
        self._send(404, json.dumps({"error": "not found"}))


def main():
    threading.Thread(target=_sample_loop, daemon=True).start()
    time.sleep(1.1)   # let the first CPU delta accumulate
    srv = ThreadingHTTPServer((BIND, PORT), Handler)
    print(f"[sysmon-agent.py] listening on {BIND}:{PORT}" + (" (token required)" if TOKEN else ""), flush=True)
    srv.serve_forever()


if __name__ == "__main__":
    main()
