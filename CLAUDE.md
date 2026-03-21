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
├── screenshot.png            # Visual demo shown in README
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

**Data flow:**
1. Module calls `this.sendSocketNotification("GET_TEMPERATURES", config)` on startup and on each update interval.
2. `node_helper.js` receives the notification, fetches temperature data from Home Assistant (or returns demo data), then calls `this.sendSocketNotification("TEMPERATURES_RESULT", data)`.
3. Module receives data via `socketNotificationReceived()` and re-renders the chart.

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
    haUrl: "",          // Home Assistant base URL (empty = demo mode)
    haToken: "",        // HA long-lived access token
    width: "200px",     // Chart width
    height: "200px",    // Chart height
    updateInterval: 5 * 60 * 1000,  // 5 minutes in ms
    entities: [],       // Array of {room, entity_id} objects
    units: "celsius",   // "celsius" or "fahrenheit"
}
```

### Demo Data Fallback

When `haUrl` is empty or fetching fails, the module uses hardcoded demo data with 6 rooms and predefined temperatures. This ensures the module always renders something visible. Preserve this behavior when making changes.

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
        updateInterval: 5 * 60 * 1000,
        units: "celsius",
        entities: [
            { room: "Living Room", entity_id: "sensor.living_room_temperature" },
            { room: "Bedroom",     entity_id: "sensor.bedroom_temperature" },
        ]
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
- **Lifecycle methods**: The module implements `stop()`, `suspend()`, and `resume()`. `stop()` clears all timers and disposes the amCharts root. `suspend()` pauses the update interval; `resume()` restarts it. Always keep these in sync with `scheduleUpdate()`.
- **Chart disposal**: Always call `this.root.dispose()` (amCharts5 root disposal) before re-creating the chart to prevent memory leaks. `stop()` handles this on module teardown.
- **CDN scripts**: amCharts 5 is loaded from CDN. Do not add it as an npm dependency.
- **MagicMirror² globals**: `Log`, `Module`, `NodeHelper` are injected by the framework — do not import them.
- **node-fetch v2**: The project uses `node-fetch@2` (CommonJS). Do not upgrade to v3+ (ESM-only) without migrating `node_helper.js` to ESM.
- **Branch convention**: Feature branches follow the pattern `claude/<description>-<id>`.
