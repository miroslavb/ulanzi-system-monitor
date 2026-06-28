# ulanzi-system-monitor

An **Ulanzi Deck** plugin that shows live **CPU** and **memory** graphs in the
style of the **Windows 10 Task Manager**, tiled across a row of keys to form one
wide graph.

![preview](com.ulanzi.sysmonitor.ulanziPlugin/preview.png)

The D200H "information window" is a built-in Ulanzi Studio widget and is **not**
accessible to plugins, so the SDK only lets a plugin draw to the LCD **keys**.
This plugin turns a **row of keys** into a wide graph: it renders one
Task-Manager-style SVG across the row and crops it per key via the SVG `viewBox`,
so the line is continuous. Place it on two rows for CPU (top) + RAM (bottom).

The plugin itself lives in
[`com.ulanzi.sysmonitor.ulanziPlugin/`](com.ulanzi.sysmonitor.ulanziPlugin/) —
see its [README](com.ulanzi.sysmonitor.ulanziPlugin/README.md) for usage and
settings.

## Install (Windows)

Download the zip from [**Releases**](../../releases), fully quit Ulanzi Studio,
unzip `com.ulanzi.sysmonitor.ulanziPlugin\` into
`%APPDATA%\Ulanzi\UlanziDeck\Plugins\`, then restart Ulanzi Studio and drop the
**System Monitor** action across a row of keys.

## Build & test

```bash
./pack.sh                  # vendors `ws`, zips the plugin into dist/
node test/test-sysmon.mjs  # layout, SVG render + slicing, sampler (any OS)
```

Built with the [UlanziDeck Plugin SDK](https://github.com/UlanziTechnology/UlanziDeckPlugin-SDK). Apache-2.0.
