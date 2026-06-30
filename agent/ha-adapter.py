#!/usr/bin/env python3
"""ha-adapter — bridge Home Assistant's own system sensors into the sysmon-agent
JSON contract, so the Ulanzi plugin can monitor hosts that can't run an agent
(e.g. Home Assistant OS — immutable, no systemd — or a NAS that only reports via
HA). Runs wherever it has HA API access (we run it on `hermes`).

It polls HA `/api/states` on an interval and caches the result, then serves
agent-shaped JSON. Select the host with a `?host=` query (default `ha`):

  GET /metrics            -> Home Assistant host
  GET /metrics?host=nas01 -> the NAS (via HA's Synology/SNMP sensors)
  GET /healthz            -> "ok"

Env:
  HA_ADAPTER_PORT   listen port            (default 9889)
  HA_ADAPTER_BIND   bind address           (default 0.0.0.0)
  HA_ADAPTER_POLL   HA poll seconds        (default 4)
  HASS_URL          Home Assistant base url (e.g. http://100.82.103.119:8123)
  HASS_TOKEN        long-lived access token
  HA_ADAPTER_TOKEN  optional secret to require from the plugin (?token=/Bearer)

Entity ids below were discovered from this HA instance's /api/states (real, not
guessed). Adjust HOSTS if your sensor names differ.
"""
import json
import os
import threading
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

PORT = int(os.environ.get("HA_ADAPTER_PORT", "9889"))
BIND = os.environ.get("HA_ADAPTER_BIND", "0.0.0.0")
POLL = float(os.environ.get("HA_ADAPTER_POLL", "4"))
HASS_URL = os.environ.get("HASS_URL", "").rstrip("/")
HASS_TOKEN = os.environ.get("HASS_TOKEN", "")
TOKEN = os.environ.get("HA_ADAPTER_TOKEN", "")
MiB = 1024 ** 2
GB = 1024 ** 3

# host key -> how to derive metrics from HA sensors.
HOSTS = {
    "ha": {
        "name": "HA",
        "cpu": "sensor.processor_use_percent",
        "mem_pct": "sensor.memory_use_percent",
        "mem_free": ("sensor.memory_free", MiB),       # (entity, bytes-per-unit)
        "temp": "sensor.processor_temperature",
    },
    "nas01": {
        "name": "nas-01",
        "cpu": "sensor.nas_01_cpu_utilization_total",
        "mem_pct": "sensor.nas_01_memory_usage_real",
        "mem_total": ("sensor.nas_01_memory_total_real", 1000 * 1000),
        "mem_avail": ("sensor.nas_01_memory_available_real", 1000 * 1000),
        "temp": "sensor.nas_01_volume_1_average_disk_temp",   # disk temp (no CPU-temp sensor exposed)
    },
}

_states = {}     # entity_id -> float state
_ok = False
_lock = threading.Lock()


def _num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _poll_loop():
    global _states, _ok
    req = urllib.request.Request(
        HASS_URL + "/api/states",
        headers={"Authorization": "Bearer " + HASS_TOKEN},
    )
    while True:
        try:
            with urllib.request.urlopen(req, timeout=8) as r:
                data = json.load(r)
            m = {}
            for s in data:
                n = _num(s.get("state"))
                if n is not None:
                    m[s["entity_id"]] = n
            with _lock:
                _states = m
                _ok = True
        except Exception:
            with _lock:
                _ok = False
        time.sleep(POLL)


def _snapshot(host_key):
    cfg = HOSTS.get(host_key)
    if not cfg:
        return None
    with _lock:
        st = dict(_states)
        ok = _ok
    cpu = st.get(cfg["cpu"])
    pct = st.get(cfg["mem_pct"])
    used_gb = total_gb = 0.0
    if "mem_total" in cfg and "mem_avail" in cfg:
        tot = st.get(cfg["mem_total"][0]); av = st.get(cfg["mem_avail"][0])
        if tot is not None and av is not None:
            total = tot * cfg["mem_total"][1]; avail = av * cfg["mem_avail"][1]
            total_gb = round(total / GB, 2); used_gb = round(max(0, total - avail) / GB, 2)
    elif "mem_free" in cfg and pct is not None and pct < 100:
        free = st.get(cfg["mem_free"][0])
        if free is not None:
            free_b = free * cfg["mem_free"][1]
            total = free_b / (1 - pct / 100.0)
            total_gb = round(total / GB, 2); used_gb = round((total - free_b) / GB, 2)
    temp = st.get(cfg["temp"]) if "temp" in cfg else None
    return {
        "host": cfg["name"],
        "platform": "homeassistant",
        "cpu": round(cpu, 1) if cpu is not None else 0.0,
        "mem": {"pct": round(pct, 1) if pct is not None else 0.0, "usedGB": used_gb, "totalGB": total_gb},
        "cores": 0,                       # HA does not expose a core count
        "temp": round(temp) if temp is not None else None,
        "ok": ok and cpu is not None,
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
        q = parse_qs(u.query)
        if u.path == "/healthz":
            return self._send(200, "ok", "text/plain")
        if u.path in ("/metrics", "/"):
            if not self._authed(q):
                return self._send(401, json.dumps({"error": "unauthorized"}))
            snap = _snapshot(q.get("host", ["ha"])[0])
            if snap is None:
                return self._send(404, json.dumps({"error": "unknown host"}))
            return self._send(200, json.dumps(snap))
        self._send(404, json.dumps({"error": "not found"}))


def main():
    if not HASS_URL or not HASS_TOKEN:
        raise SystemExit("HASS_URL and HASS_TOKEN must be set")
    threading.Thread(target=_poll_loop, daemon=True).start()
    time.sleep(min(POLL, 5) + 0.5)
    srv = ThreadingHTTPServer((BIND, PORT), Handler)
    print(f"[ha-adapter] listening on {BIND}:{PORT} (HA {HASS_URL})", flush=True)
    srv.serve_forever()


if __name__ == "__main__":
    main()
