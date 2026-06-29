# System Monitor — Ulanzi Deck plugin

Live **CPU** and **memory** graphs on your Ulanzi Deck, styled like the
**Windows 10 Task Manager** performance tab.

Because the plugin SDK can only draw to the LCD **keys** (the D200H "information
window" is a built-in Ulanzi Studio widget and is *not* accessible to plugins),
this plugin makes a "wide screen" by **tiling one graph across a block of keys**.

![preview](preview.png)

## Layout — how to combine keys

Place **System Monitor** on a **block of keys** — any rectangle:

- a **row** → a wide graph;
- a **column** → a tall graph;
- a **matrix** (e.g. **3×3**) → one big graph that's both wide and tall.

All keys that share the same **Metric** are joined into **one** graph spanning
their bounding box, and each key shows its slice (the line is continuous across
the whole block). The more keys, the bigger the graph.

To show **both** CPU and RAM, make **two blocks**: set one block's keys to
**CPU** and the other block's keys to **Memory** (e.g. CPU on the top rows, RAM
on the bottom rows). Use the same settings on every key of a block.

## Settings (Property Inspector)

- **Metric** — `CPU` (default) or `Memory`. Same metric = same block.
- **Refresh** — `0.5s` (default) / `1s` / `2s`.
- **Theme** — `Dark` (default) or `Light`.
- **Show labels** — small top-left chip with the metric + current %, a sub-label
  (cores / used·total GB) and the 100%/0 axis. Turn it **off** for a clean graph
  with no text.

## How it works

- Node main service (official UlanziDeck SDK). One process samples CPU
  (`os.cpus()` idle/total deltas) and memory (`os.totalmem`/`freemem`) every
  refresh tick and repaints each placed key.
- Keys are grouped into **blocks** by metric using their `col_row` id (the
  bounding box of all keys sharing a metric). For each block a single **SVG**
  graph is built at the block size (Win10 colours: CPU cyan `#17a2d6`, Memory
  violet `#c56fe6`, grid + area fill + value), then cropped per key via the SVG
  `viewBox` (`col×CELL row×CELL`) so the line is continuous across the whole
  matrix. Pure SVG — **no native dependencies** (only `ws`, bundled).

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
        ├── layout.js        group keys into blocks (bounding box per metric)
        └── settings.js      normalise PI settings (incl. labels toggle)
```

Built with the [UlanziDeck Plugin SDK](https://github.com/UlanziTechnology/UlanziDeckPlugin-SDK). Apache-2.0.
