# CLAUDE.md — MMM-TemperatureRadar

This file provides guidance for AI assistants working on this codebase.

## Project Overview

**MMM-TemperatureRadar** is a [MagicMirror²](https://magicmirror.builders/) module that displays temperature data from multiple rooms as a radar (spider) chart. It integrates with [Home Assistant](https://www.home-assistant.io/) to fetch live sensor data, and falls back to demo data when Home Assistant is not configured.

- **License**: MIT
- **Author**: Harshit Sanghvi
- **MagicMirror² version compatibility**: MagicMirror² v2+

## Repository Structure

```
MMM-TemperatureRadar/
├── MMM-TemperatureRadar.js   # Main module file (frontend, runs in browser)
├── node_helper.js            # Backend helper (runs in Node.js)
├── MMM-TemperatureRadar.css  # Module styles
├── package.json              # npm metadata; dependencies: node-fetch@2; devDependencies: jest
├── README.md                 # User-facing documentation and config reference
├── LICENSE                   # MIT License
├── screenshots/              # Screenshot images shown in README
├── .gitignore                # Excludes node_modules/, package-lock.json, coverage/
├── tests/
│   ├── node_helper.test.js            # Jest tests for node_helper.js
│   └── MMM-TemperatureRadar.test.js   # Jest tests for the module frontend
└── .github/
    └── workflows/
        └── ci.yml            # GitHub Actions CI (Node 18.x and 20.x matrix)
```

No build system. Jest is used for testing (`npm test`). CI runs via GitHub Actions (`.github/workflows/ci.yml`).

## Architecture

### MagicMirror² Module Pattern

MagicMirror² modules consist of two parts that communicate via socket notifications:

| File | Runtime | Role |
|------|---------|------|
| `MMM-TemperatureRadar.js` | Browser | DOM rendering, chart creation, UI state |
| `node_helper.js` | Node.js | HTTP requests to Home Assistant API |

**Data flow (two modes, can work simultaneously):**

*Pull mode (Home Assistant):*
1. Module calls `this.sendSocketNotification("GET_TEMPERATURES", {haUrl, haToken, entities})` on startup and on each update interval.
2. `node_helper.js` receives the notification, fetches temperature data from Home Assistant (or returns demo data), then calls `this.sendSocketNotification("TEMPERATURES_RESULT", data)`.
3. Module receives data via `socketNotificationReceived()` and re-renders the chart.

*Push mode (inter-module notifications):*
1. Any MagicMirror² module sends `this.sendNotification("TEMPERATURE_UPDATE", data)` where data is an array of `{room, temperature, unit_of_measurement}`.
2. Module receives data via `notificationReceived()` and updates the chart.
3. The notification name is configurable via `config.notificationName`.

Both modes go through `processTemperatureData()`, which updates data in place when the chart exists (smooth animation) or triggers a full DOM rebuild on first load.

Humidity follows the same pattern: `GET_HUMIDITY`/`HUMIDITY_RESULT` socket notifications for HA pull mode, and `HUMIDITY_UPDATE` broadcast notification for push mode. Both go through `processHumidityData()`. Humidity has its own Y axis (0-100% scale) so it doesn't distort the temperature axis.

### Chart Library

The radar chart is rendered using **amCharts 5**, loaded at runtime from CDN:

```
https://cdn.amcharts.com/lib/5/index.js
https://cdn.amcharts.com/lib/5/xy.js
https://cdn.amcharts.com/lib/5/radar.js
https://cdn.amcharts.com/lib/5/themes/Animated.js
```

These are declared in `getScripts()` and loaded by MagicMirror² before `getDom()` is called. Chart creation is deferred 500ms via `setTimeout` to ensure DOM readiness.

## Key Conventions

### Logging

- **Module (`MMM-TemperatureRadar.js`)**: Use `Log.info()`, `Log.warn()`, `Log.error()` — the MagicMirror² global logger.
- **Node helper (`node_helper.js`)**: Use `console.log()` / `console.error()`.

### Configuration Defaults

All config options have defaults defined in the `defaults` object within `MMM-TemperatureRadar.js`. Always add new options there with sensible fallbacks — never assume a user-provided value exists.

```js
defaults: {
    // Data
    haUrl: "",          haToken: "",
    updateInterval: 5 * 60 * 1000,
    units: "celsius",
    entities: [ /* 6 default room/entity pairs */ ],
    humidityEntities: [],
    // Display
    width: "200px",     height: "200px",
    chartColor: "#808080",  humidityColor: "#4488cc",
    coloredBullets: false,  showValues: true,
    showTrends: true,       showLastUpdated: true,
    staleThreshold: 10 * 60 * 1000,
    // Thresholds
    thresholdLow: null,     thresholdHigh: null,
    thresholdColor: "#ff4444",
    // Axis
    minValue: null,         maxValue: null,
    // Animation
    rotateChart: false,     rotateSpeed: 60,
    // Integration
    notificationName: "TEMPERATURE_UPDATE",
    humidityNotificationName: "HUMIDITY_UPDATE",
}
```

### Demo Data Fallback

When `haUrl` is empty or fetching fails, the module uses hardcoded demo data with 6 rooms and predefined temperatures. This ensures the module always renders something visible. In notification-only mode (no HA config), demo data is shown until another module pushes data. Preserve this behavior when making changes.

### Temperature Units

`convertTemperature(temp, fromUnit)` in the module handles unit conversion. The `fromUnit` value comes from the Home Assistant API response's `unit_of_measurement` field. Do not hardcode unit assumptions.

### Error Handling

- Node helper wraps fetch calls in try/catch and sends demo data on error.
- Module checks for empty/null data before attempting chart operations.
- Chart root is disposed before re-creating on each data update (prevents memory leaks).

### Async Style

The codebase uses `.then()` / `.catch()` Promise chains, not `async/await`. Match this style when adding new async code.

## Configuration Reference

Example `config.js` entry for MagicMirror²:

```js
{
    module: "MMM-TemperatureRadar",
    position: "top_right",
    config: {
        haUrl: "http://homeassistant.local:8123",
        haToken: "YOUR_LONG_LIVED_ACCESS_TOKEN",
        width: 400,
        height: 400,
        entities: [
            { room: "Living Room", entity_id: "sensor.living_room_temperature" },
            { room: "Bedroom",     entity_id: "sensor.bedroom_temperature" },
        ],
        humidityEntities: [
            { room: "Living Room", entity_id: "sensor.living_room_humidity" },
            { room: "Bedroom",     entity_id: "sensor.bedroom_humidity" },
        ],
        thresholdLow: 18,
        thresholdHigh: 26,
    }
}
```

## Development Workflow

### Installation

```bash
cd ~/MagicMirror/modules
git clone https://github.com/sanghviharshit/MMM-TemperatureRadar
cd MMM-TemperatureRadar
npm install
```

### Running Locally

This module requires a running MagicMirror² instance. There is no standalone dev server. To test changes, restart MagicMirror² and observe the module in the browser.

### No Build Step

There is no transpilation, bundling, or minification. Files are served directly. Edit and reload.

### Tests

Jest is used for unit tests. Run with:

```bash
npm test              # run all tests
npm run test:coverage # run with coverage report
```

Tests live in `tests/`. All MagicMirror² globals and amCharts5 CDN globals are stubbed in the test files — see `tests/MMM-TemperatureRadar.test.js` for the setup pattern.

## Home Assistant API

The node helper fetches individual entity states:

```
GET {haUrl}/api/states/{entity_id}
Authorization: Bearer {haToken}
```

Response fields used:
- `state`: the numeric temperature value (skipped if `"unavailable"`)
- `attributes.unit_of_measurement`: e.g. `"°C"` or `"°F"`

## Important Notes for AI Assistants

- **Do not add a build system** unless explicitly requested. The simplicity is intentional.
- **Do not add `async/await`** when modifying existing code — maintain `.then()` style for consistency.
- **Preserve the demo data fallback** — it is a core feature for users without Home Assistant.
- **Lifecycle methods**: The module implements `stop()`, `suspend()`, and `resume()`. `stop()` clears all timers (updateIntervalId, timestampIntervalId, chartTimer) and disposes the amCharts root. `suspend()` pauses both intervals; `resume()` restarts them. Always keep these in sync with `scheduleUpdate()` and `scheduleTimestampRefresh()`.
- **Chart disposal**: Always call `this.root.dispose()` (amCharts5 root disposal) before re-creating the chart to prevent memory leaks. `stop()` handles this on module teardown. On data updates, `processTemperatureData()` updates data in place via `setAll()` for smooth animated transitions instead of full chart rebuild.
- **Instance properties**: `this.xAxis`, `this.series`, and `this.humiditySeries` are stored for in-place data updates. These must be nulled in both `start()` and `stop()`.
- **Bullets**: By default, no bullet circles are rendered (clean look). Bullets only appear when `coloredBullets` is enabled or thresholds are configured. Out-of-range bullets are larger (7px vs 4px).
- **Trend indicators**: `previousTemperatures` stores the last reading per room. ▲/▼ only show when temperature is changing (0.1 threshold). Stable = no indicator.
- **Stale data**: Timestamp gets CSS class `stale` (orange) when data age exceeds `staleThreshold`.
- **Rotation**: Uses amCharts `startAngle`/`endAngle` via `root.events.on("frameended")` so labels stay readable. Not CSS transform.
- **CDN scripts**: amCharts 5 is loaded from CDN. Do not add it as an npm dependency.
- **MagicMirror² globals**: `Log`, `Module`, `NodeHelper` are injected by the framework — do not import them.
- **node-fetch v2**: The project uses `node-fetch@2` (CommonJS). Do not upgrade to v3+ (ESM-only) without migrating `node_helper.js` to ESM.
