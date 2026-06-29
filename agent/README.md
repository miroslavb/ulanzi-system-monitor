# sysmon-agent

Tiny zero-dependency metrics endpoint for the **Ulanzi System Monitor** plugin's
remote (Tailscale) host sources. Run one on each host you want to monitor; the
plugin (on the PC with Ulanzi Studio) polls it over your Tailscale network and
the **Host Switch** key cycles between hosts.

It samples CPU + memory with Node's built-in `os` module (Linux / macOS /
Windows), so it works anywhere Node ≥ 14 runs. No npm install, no dependencies.

## Run it

```bash
node sysmon-agent.mjs
# -> [sysmon-agent] listening on 0.0.0.0:9888
```

Then in the plugin's **Host Switch** key settings, add the host with address
`http://<tailscale-ip>:9888` (e.g. `http://100.96.12.34:9888`).

## Config (env vars)

| Var | Default | Meaning |
|-----|---------|---------|
| `SYSMON_AGENT_PORT`  | `9888`     | Listen port |
| `SYSMON_AGENT_BIND`  | `0.0.0.0`  | Bind address — set to the host's Tailscale IP to only expose it on the tailnet |
| `SYSMON_AGENT_TOKEN` | *(unset)*  | If set, requests must carry it as `?token=…` or `Authorization: Bearer …` |

## Endpoints

- `GET /metrics` (or `GET /`) → `{ host, platform, cpu, mem:{pct,usedGB,totalGB}, cores, uptime, ts }`
- `GET /healthz` → `ok`

## Security

The agent only ever **reads** CPU/RAM and serves them read-only. Keep it on the
tailnet: rely on Tailscale ACLs, bind to the Tailscale IP (`SYSMON_AGENT_BIND`),
and/or set `SYSMON_AGENT_TOKEN`. Do not expose it to the public internet.

## Run as a service (systemd, Linux)

```bash
sudo mkdir -p /opt/sysmon-agent
sudo cp sysmon-agent.mjs /opt/sysmon-agent/
sudo cp sysmon-agent.service /etc/systemd/system/
# edit the unit if your node path isn't /usr/bin/node, or to set BIND/TOKEN
sudo systemctl daemon-reload
sudo systemctl enable --now sysmon-agent
systemctl status sysmon-agent
```
