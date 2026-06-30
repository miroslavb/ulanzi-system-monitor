# ulanzi-system-monitor

An **Ulanzi Deck** plugin that shows live **CPU** and **memory** graphs in the
style of the **Windows 10 Task Manager**, tiled across the LCD keys — for the
local PC **and** any number of remote **Tailscale** hosts, switched from the deck.

![preview](com.ulanzi.sysmonitor.ulanziPlugin/preview.png)

## Features

- **Task-Manager-style graphs on the keys.** The D200H "information window" isn't
  accessible to plugins, so the plugin draws to the LCD **keys**: it renders one
  SVG graph across a **block of keys** and crops it per key via a `transform`, so
  the line stays continuous across a row, a column, or a full **matrix (e.g. 3×3)**.
  CPU = cyan, Memory = violet, with grid, area fill and a value chip — one block
  for CPU, another for Memory.
- **Remote host monitoring over Tailscale.** Run the tiny zero-dependency
  [`sysmon-agent`](agent/) on any host; the plugin polls it over your tailnet and
  graphs it just like the local machine.
- **Host Switch key (cycler).** A second action whose settings hold a list of hosts
  — **alias + agent address + a Material Design icon** (searchable picker) — plus an
  optional "This PC" local source. **Pressing it cycles to the next host and
  switches the data source for every System Monitor graph key on the deck.** The
  key shows the current host's alias and icon, an accent ring when it's the active
  source, and a red dot if it's unreachable.
- **CPU temperature.** Where the host reports it, the Host Switch tile shows the
  temperature as small digits in the top-right corner (grey, amber ≥70 °C, red
  ≥80 °C).
- **Home Assistant & API-only hosts.** The [`ha-adapter`](agent/) bridges hosts
  that can't run an agent (Home Assistant OS is immutable; a NAS that only reports
  through HA) by reading HA's own system sensors and re-serving them in the agent
  format.
- **Robust by design.** Each key renders independently keyed by the stable
  `actionid` (immune to the D200H's flickering/duplicate key ids); the remote
  sampler can never wedge on a stalled response; the plugin polls from its Node
  process, so there's **no CORS** to configure.

## Layout — combining keys into one graph

Each key draws the whole graph and shows only its own cell. To make **one big
graph across several keys**:

1. Pick the grid, e.g. **3 columns × 3 rows**.
2. On **every** key of that graph set the **same Columns, Rows and Metric**.
3. **Click that key's cell** in the visual grid picker (top-left = `0,0`).

A single key with Columns = Rows = 1 is just a full graph. Use one block for CPU
and another for Memory.

## Data sources

| Source | How it's read |
|--------|---------------|
| **This PC** (local) | Node `os` — the machine running Ulanzi Studio (temp on Linux only) |
| **Remote host** | [`sysmon-agent`](agent/) on the host, polled over Tailscale (HTTP) |
| **Home Assistant / NAS / API-only** | [`ha-adapter`](agent/) reads HA system sensors and re-serves them |

The plugin keeps a rolling history per source; the Host Switch key selects which
one all graph keys display.

## Install

**Plugin (the Windows PC with Ulanzi Studio):** download the plugin zip from
[**Releases**](../../releases), fully quit Ulanzi Studio, unzip
`com.ulanzi.sysmonitor.ulanziPlugin\` into `%APPDATA%\Ulanzi\UlanziDeck\Plugins\`,
then restart Ulanzi Studio. Drop **System Monitor** across a block of keys and/or a
**Host Switch** on one key. *(Settings survive a plugin-folder overwrite — Ulanzi
Studio stores them in its own profile, not in the plugin folder.)*

**Agents (each host you want to monitor):** download the `sysmon-agent` zip from the
same release and run `python3 sysmon-agent.py` (Linux) or `node sysmon-agent.mjs`
(any OS), or install the included systemd unit. See [`agent/README.md`](agent/README.md)
for the agent, the Python variant, the systemd unit, and the HA-adapter.

## Build & test

```bash
./pack.sh                  # vendors `ws`, regenerates the PI icon set, zips the
                           # plugin + the agent bundle into dist/
node test/test-sysmon.mjs  # settings, layout, SVG render+slicing, host-switch
                           # cycle, URL normalisation, remote-sampler resilience
```

## Project layout

```
ulanzi-system-monitor/
├── com.ulanzi.sysmonitor.ulanziPlugin/   the plugin (see its README)
│   ├── plugin/                           main service + monitor/ (Sampler, RemoteSampler,
│   │                                     render, settings, layout, mdi-lite)
│   └── property-inspector/               graph + Host Switch settings UIs
├── agent/                                sysmon-agent (node + python), ha-adapter, systemd unit
├── test/                                 node test suite (no device needed)
└── pack.sh                               build the release zips
```

See the plugin's own [README](com.ulanzi.sysmonitor.ulanziPlugin/README.md) for
per-setting detail and the [CHANGELOG](CHANGELOG.md) for the version history.

Built with the [UlanziDeck Plugin SDK](https://github.com/UlanziTechnology/UlanziDeckPlugin-SDK). Apache-2.0.
