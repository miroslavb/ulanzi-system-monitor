# System Monitor — Ulanzi Deck plugin

Live **CPU** and **memory** graphs on your Ulanzi Deck, styled like the
**Windows 10 Task Manager** performance tab.

Because the plugin SDK can only draw to the LCD **keys** (the D200H "information
window" is a built-in Ulanzi Studio widget and is *not* accessible to plugins),
this plugin makes a "wide screen" by **tiling one graph across a row of keys**:
drop the action on several adjacent keys and they render a single continuous
graph. The more keys you use, the wider it gets.

![preview](preview.png)

## Layout

- Place **System Monitor** on a row of adjacent keys → one wide graph.
- Place it on a **second row** too → with **Auto** metric, the top row shows
  **CPU** and the next row shows **RAM** (Task-Manager style, stacked).
- Or force a row to a specific metric in its settings.

## Settings (Property Inspector)

- **Metric** — `Auto (by row: CPU then RAM)`, `CPU`, or `Memory`.
- **Refresh** — `0.5s` (default) / `1s` / `2s`.
- **Theme** — `Dark` (default) or `Light`.
- **Show labels** — overlay the metric name, current %, and sub-label
  (cores / used·total GB) plus the 100%/0 axis.

Keep the settings identical across all keys of one row.

## How it works

- Node main service (official UlanziDeck SDK). One process samples CPU
  (`os.cpus()` idle/total deltas) and memory (`os.totalmem`/`freemem`) every
  refresh tick and repaints each placed key.
- Keys are grouped into per-row strips using their `col_row` id. For each strip a
  single wide **SVG** graph is built (Win10 colours: CPU cyan `#17a2d6`, Memory
  violet `#c56fe6`, grid + area fill + value), then cropped per key via the SVG
  `viewBox` so the line is continuous across the row. Pure SVG — **no native
  dependencies** (only `ws`, bundled).

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
        └── layout.js        group keys into per-row strips, auto CPU/RAM
```

Built with the [UlanziDeck Plugin SDK](https://github.com/UlanziTechnology/UlanziDeckPlugin-SDK). Apache-2.0.
