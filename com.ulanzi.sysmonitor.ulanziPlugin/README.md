# System Monitor — Ulanzi Deck plugin

Live **CPU** and **memory** graphs on your Ulanzi Deck, styled like the
**Windows 10 Task Manager** performance tab.

Because the plugin SDK can only draw to the LCD **keys** (the D200H "information
window" is a built-in Ulanzi Studio widget and is *not* accessible to plugins),
this plugin makes a "wide screen" by **tiling one graph across a block of keys**.

![preview](preview.png)

## Layout — how to combine keys

Each key **draws the whole graph and shows only its own cell**, so keys never
interfere (this is robust even though the D200H can report unstable/duplicate key
ids). To make **one big graph across several keys**:

1. Decide the grid, e.g. **3 columns × 3 rows** for a 3×3.
2. On **every** key of that graph set the **same Columns, Rows and Metric**.
3. Give each key its position with **This column** / **This row** (0-based,
   top-left = `0,0`). Leave them **empty for auto** (uses the key's own position —
   works when the device's key ids are stable; set them manually if a key shows
   the wrong part).

- A single key with **Columns = Rows = 1** is just a full graph.
- A **row** (Columns = N, Rows = 1) → wide graph; a **column** → tall graph;
  a **matrix** (e.g. 3×3) → big graph, wide *and* tall.
- For **both** metrics, use two groups: one set of keys on **CPU**, another on
  **Memory**.

## Settings (Property Inspector)

- **Metric** — `CPU` (default) or `Memory`.
- **Columns / Rows** — the grid size (1–8). Same on every key of a graph.
- **This column / This row** — this key's cell (0-based). Empty = auto.
- **Refresh** — `0.5s` (default) / `1s` / `2s`.
- **Theme** — `Dark` (default) or `Light`.
- **Show labels** — small top-left chip with the metric + current %, a sub-label
  (cores / used·total GB) and the 100%/0 axis. Turn it **off** for a clean graph.
- **Diagnostics** — overlay this key's id / cell / settings (for troubleshooting).

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
├── property-inspector/      settings UI (metric / refresh / theme / labels)
├── node_modules/ws/         bundled dependency
└── plugin/
    ├── app.js               main service: sampling + per-key repaint
    ├── common-node/         vendored common-node SDK
    └── monitor/
        ├── Sampler.js       CPU + memory sampling, rolling history
        ├── render.js        Win10-Task-Manager SVG graph + viewBox slicing
        ├── layout.js        key-id parsing (best-effort default cell)
        └── settings.js      normalise PI settings (grid, cells, labels toggle)
```

Built with the [UlanziDeck Plugin SDK](https://github.com/UlanziTechnology/UlanziDeckPlugin-SDK). Apache-2.0.
