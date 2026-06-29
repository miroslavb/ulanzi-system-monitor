# System Monitor — Ulanzi Deck plugin

Live **CPU** and **memory** graphs on your Ulanzi Deck, styled like the
**Windows 10 Task Manager** performance tab.

Because the plugin SDK can only draw to the LCD **keys** (the D200H "information
window" is a built-in Ulanzi Studio widget and is *not* accessible to plugins),
this plugin makes a "wide screen" by **tiling one graph across a block of keys**.

**New in v1.3 — remote hosts.** Monitor other machines too: run a tiny
[`sysmon-agent`](../agent/) on any **Tailscale** host, then add a **Host Switch**
key. Each press cycles to the next host and switches the data source for *every*
System Monitor graph key on the deck. The key shows the current host's alias and a
Material Design icon you pick.

![preview](preview.png)

## Layout — how to combine keys

Each key **draws the whole graph and shows only its own cell**, so keys never
interfere (this is robust even though the D200H can report unstable/duplicate key
ids). To make **one big graph across several keys**:

1. Decide the grid, e.g. **3 columns × 3 rows** for a 3×3.
2. On **every** key of that graph set the **same Columns, Rows and Metric**.
3. **Click that key's cell** in the visual grid picker (top-left = `0,0`). The
   picker only offers valid cells, so you can't misconfigure the position.

- A single key with **Columns = Rows = 1** is just a full graph.
- A **row** (Columns = N, Rows = 1) → wide graph; a **column** → tall graph;
  a **matrix** (e.g. 3×3) → big graph, wide *and* tall.
- For **both** metrics, use two groups: one set of keys on **CPU**, another on
  **Memory**.

## Settings (Property Inspector)

- **Metric** — `CPU` (default) or `Memory`.
- **Columns / Rows** — the grid size (1–8). Same on every key of a graph.
- **This key** — a visual grid picker; click the cell this key occupies.
- **Refresh** — `0.5s` (default) / `1s` / `2s`.
- **Theme** — `Dark` (default) or `Light`.
- **Show labels** — small top-left chip with the metric + current %, a sub-label
  (cores / used·total GB) and the 100%/0 axis. Turn it **off** for a clean graph.
- **Diagnostics** — overlay this key's id / cell / settings (for troubleshooting).

## Remote hosts — Host Switch

Add a **Host Switch** action to one key to monitor remote machines:

1. On each host you want to watch, run the standalone agent (see
   [`agent/README.md`](../agent/README.md)):
   ```bash
   node sysmon-agent.mjs        # serves CPU/RAM JSON on :9888
   ```
   It's zero-dependency Node (Linux/macOS/Windows) and read-only; keep it on your
   tailnet (bind to the Tailscale IP and/or set a token).
2. In the **Host Switch** key settings:
   - **This PC** — include the local machine as a source (alias + icon).
   - **Remote hosts** — add rows of *alias* + *agent address*
     (`http://<tailscale-ip>:9888`) + an **MDI icon** (picker with search).
3. **Press the key** to cycle to the next host. The selected host becomes the data
   source for **all** graph keys on the deck, and the switch key shows that host's
   alias + icon (with an accent ring; a red dot if the host is unreachable).

The plugin polls the agents over HTTP from its Node process (no browser, so no
CORS) and keeps a rolling history per source, just like the local graph.

## How it works

- Node main service (official UlanziDeck SDK). One process samples CPU
  (`os.cpus()` idle/total deltas) and memory (`os.totalmem`/`freemem`) every
  refresh tick and repaints each placed key.
- Every placed key renders **independently**: it builds the full grid graph
  (Win10 colours: CPU cyan `#17a2d6`, Memory violet `#c56fe6`, grid + area fill +
  value chip) and crops its own cell via the SVG `viewBox` (`col×CELL row×CELL`).
  Keys of one graph share the same settings + the same sampler tick, so the line
  is continuous across the matrix — with **no cross-key grouping**, which makes it
  immune to the device's unstable/duplicate key ids and stale instances. Pure SVG,
  **no native dependencies** (only `ws`, bundled).
- Instances are keyed by the stable **`actionid`** and their grid position is
  **locked on first sight**, so a flickering/duplicated `col_row` can't create
  ghost tiles.

## Requirements

- Ulanzi Studio 2.1.4+ with an Ulanzi Deck (D200 / D200H / D200X / Dial).
- Windows 10+ or macOS 10.13+ (metrics use the Node `os` module).

## Install

1. Fully quit Ulanzi Studio (tray → Exit).
2. Unzip so `com.ulanzi.sysmonitor.ulanziPlugin\` lands in
   `%APPDATA%\Ulanzi\UlanziDeck\Plugins\` (Windows) or
   `~/Library/Application Support/Ulanzi/UlanziDeck/Plugins/` (macOS).
3. Start Ulanzi Studio and place the action across a row of keys.

## Tests (any OS, no device)

```bash
node test/test-sysmon.mjs   # layout grouping, SVG render + slicing, sampler
```

## File layout

```
com.ulanzi.sysmonitor.ulanziPlugin/
├── manifest.json
├── en.json / ru_RU.json
├── assets/icons/            monitor (area-chart) + store icons
├── libs/                    vendored common-html SDK (Property Inspector)
├── property-inspector/      settings UI (graph: inspector.*; switch: switcher.* + mdi-lite.js)
├── node_modules/ws/         bundled dependency
└── plugin/
    ├── app.js               main service: source registry + per-key repaint + host cycle
    ├── common-node/         vendored common-node SDK
    └── monitor/
        ├── Sampler.js       LOCAL CPU + memory sampling, rolling history
        ├── RemoteSampler.js remote source — polls a sysmon-agent over HTTP
        ├── render.js        Win10-Task-Manager SVG graph + viewBox slicing + switch key
        ├── layout.js        key-id parsing (best-effort default cell)
        ├── settings.js      normalise PI settings (graph + host-switch list)
        └── mdi-lite.js      curated MDI icon paths (canonical; PI copy generated by pack.sh)
```

The standalone host agent lives at the repo root in [`agent/`](../agent/) and is
shipped as a separate release zip.

Built with the [UlanziDeck Plugin SDK](https://github.com/UlanziTechnology/UlanziDeckPlugin-SDK). Apache-2.0.
