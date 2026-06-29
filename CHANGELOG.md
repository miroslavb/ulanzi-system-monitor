# Changelog

All notable changes to the **System Monitor** Ulanzi Deck plugin.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [1.3.0] - 2026-06-29

### Added
- **Remote host monitoring over Tailscale.** A new standalone, zero-dependency
  metrics agent ([`agent/sysmon-agent.mjs`](agent/README.md)) runs on each host
  and serves CPU/RAM JSON over HTTP. The plugin polls it from its Node process
  (no browser → no CORS) and keeps a rolling history per source, identical to the
  local graph.
- **Host Switch action** — a cycler key. Its settings hold a list of hosts
  (alias + agent address + an **MDI icon**, chosen from a searchable picker), plus
  an optional "this PC" local source. Pressing the key cycles to the next host and
  switches the data source for **all** System Monitor graph keys on the deck. The
  key renders the current host's alias + icon, with an accent ring when it is the
  active source and a red dot when the selected remote host is unreachable.
- Curated Material Design icon set (`plugin/monitor/mdi-lite.js`, ~80 host/system
  icons) for the picker — deliberately small instead of the full ~7000-icon
  bundle, so the Property Inspector stays fast. The PI copy is generated from the
  canonical Node module by `pack.sh` so the two can't drift.

### Changed
- The graph keys now read from a **selectable data source** (local or a remote
  host) instead of always the local machine. With no Host Switch key present,
  behaviour is unchanged (local only).

## [1.2.2] - 2026-06-29

### Fixed
- Crop tiles via `transform`-translate inside a `0,0` viewBox (the D200H SVG
  renderer ignores a non-zero viewBox origin) so multi-key graphs actually tile.

## [1.2.1] - 2026-06-29

### Fixed
- Visual grid cell-picker in the Property Inspector; removed 100%/0 axis labels;
  single-text value chip (no overlap).

## [1.2.0] - 2026-06-28

### Changed
- Independent per-key rendering keyed by the stable `actionid` (robust against the
  D200H's unstable/duplicate `col_row` key ids).

## [1.1.0] - 2026-06-28

### Added
- 2D matrix blocks, working labels toggle, smaller non-overlapping labels.

## [1.0.0] - 2026-06-28

### Added
- Initial release: Win10-Task-Manager-style CPU/RAM graphs tiled across keys.
