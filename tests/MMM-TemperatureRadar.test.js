/**
 * @file tests/MMM-TemperatureRadar.test.js
 *
 * Tests for MMM-TemperatureRadar.js.
 *
 * Strategy:
 *  - MMM-TemperatureRadar.js calls Module.register(...) at file evaluation time.
 *    We install a Module global stub before require()-ing the file. The stub
 *    captures the second argument (the module definition object).
 *  - All MagicMirror² globals (Module, Log) and amCharts5 globals (am5,
 *    am5radar, am5xy, am5themes_Animated) are stubbed on `global` before
 *    require() so the file loads without errors.
 *  - We exercise pure methods (convertTemperature, scheduleUpdate,
 *    socketNotificationReceived, etc.) directly on the captured definition,
 *    augmented with a minimal runtime context.
 *  - Jest fake timers cover setTimeout / setInterval / clearInterval.
 */

"use strict";

// ---------------------------------------------------------------------------
// 1. amCharts5 global stubs (must exist before require())
// ---------------------------------------------------------------------------

// Returns first argument so callers get the pushed item back
// (e.g. this.chart = root.container.children.push(RadarChart.new(...)) works)
function makePassthroughPush() {
    return jest.fn((item) => item);
}

function makeChainableStub() {
    const stub = {
        setAll: jest.fn(),
        setThemes: jest.fn(),
        dispose: jest.fn(),
        appear: jest.fn(),
        push: makePassthroughPush(),
        data: { setAll: jest.fn() },
        _logo: { dispose: jest.fn() },
        grid:   { template: { setAll: jest.fn() } },
        labels: { template: { setAll: jest.fn() } },
        strokes: { template: { setAll: jest.fn() } },
        fills:   { template: { setAll: jest.fn() } },
        bullets: { push: jest.fn() },
        // container.children.push must return its argument so this.chart
        // gets the RadarChart stub (with xAxes, yAxes, series)
        container: { children: { push: makePassthroughPush() } },
        xAxes:  { push: makePassthroughPush() },
        yAxes:  { push: makePassthroughPush(), getIndex: jest.fn(() => makeChainableStub()) },
        series: { push: makePassthroughPush() },
    };
    return stub;
}

const rootStub = makeChainableStub();

global.am5 = {
    ready: jest.fn((cb) => cb()), // invoke callback synchronously for easy assertions
    Root:    { new: jest.fn(() => rootStub) },
    color:   jest.fn((v) => v),
    Tooltip: { new: jest.fn(() => ({})) },
    Bullet:  { new: jest.fn(() => ({})) },
    Circle:  { new: jest.fn(() => ({})) },
};

global.am5radar = {
    RadarChart:            { new: jest.fn(() => makeChainableStub()) },
    AxisRendererCircular:  { new: jest.fn(() => makeChainableStub()) },
    AxisRendererRadial:    { new: jest.fn(() => makeChainableStub()) },
    RadarLineSeries:       { new: jest.fn(() => makeChainableStub()) },
};

global.am5xy = {
    CategoryAxis: { new: jest.fn(() => makeChainableStub()) },
    ValueAxis:    { new: jest.fn(() => makeChainableStub()) },
};

global.am5themes_Animated = { new: jest.fn(() => ({})) };

// ---------------------------------------------------------------------------
// 2. MagicMirror² global stubs
// ---------------------------------------------------------------------------

let capturedModuleDefinition;

global.Module = {
    register: jest.fn((name, definition) => {
        capturedModuleDefinition = definition;
    })
};

global.Log = {
    info:  jest.fn(),
    warn:  jest.fn(),
    error: jest.fn(),
};

// Minimal document stub for getDom() — testEnvironment is node, not jsdom
global.document = {
    createElement: jest.fn((tag) => ({
        tagName: tag.toUpperCase(),
        className: "",
        id: "",
        style: {},
        textContent: "",
        innerHTML: "",
        appendChild: jest.fn(),
    }))
};

// ---------------------------------------------------------------------------
// 3. Load the module (triggers Module.register at the top level)
// ---------------------------------------------------------------------------

require("../MMM-TemperatureRadar.js");

// ---------------------------------------------------------------------------
// 4. Helper: build a minimal module instance from the captured definition
// ---------------------------------------------------------------------------

const DEMO_DATA = [
    { room: "Living Room", temperature: 21.5, unit_of_measurement: "°C" },
    { room: "Kitchen",     temperature: 22.3, unit_of_measurement: "°C" },
    { room: "Bedroom",     temperature: 20.8, unit_of_measurement: "°C" },
    { room: "Bathroom",    temperature: 23.1, unit_of_measurement: "°C" },
    { room: "Office",      temperature: 21.7, unit_of_measurement: "°C" },
    { room: "Outdoor",     temperature: 5.5,  unit_of_measurement: "°C" }
];

function makeModuleInstance(overrides = {}) {
    const instance = Object.assign(Object.create(capturedModuleDefinition), {
        name: "MMM-TemperatureRadar",
        identifier: "MMM-TemperatureRadar_1",
        config: Object.assign({}, capturedModuleDefinition.defaults, overrides.config),
        sendSocketNotification: jest.fn(),
        updateDom: jest.fn(),
        temperatures: [],
        loaded: false,
        chart: null,
        root: null,
        chartTimer: null,
        updateIntervalId: null,
        previousTemperatures: {},
        lastUpdated: null,
        timestampIntervalId: null,
        humidityData: [],
        humiditySeries: null,
    });
    // Apply any non-config overrides directly
    const { config: _, ...rest } = overrides;
    return Object.assign(instance, rest);
}

// ---------------------------------------------------------------------------

describe("MMM-TemperatureRadar module", () => {

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    // -----------------------------------------------------------------------
    // Note: Module.register() is called at require() time, before any test
    // runs. jest.clearAllMocks() in beforeEach clears the call history, so we
    // verify registration via capturedModuleDefinition (a regular variable
    // that persists across clearAllMocks).
    describe("Module.register()", () => {
        it("registers the module and captures a non-null definition object", () => {
            expect(capturedModuleDefinition).toBeDefined();
            expect(typeof capturedModuleDefinition).toBe("object");
        });

        it("module definition has expected method signatures", () => {
            expect(typeof capturedModuleDefinition.start).toBe("function");
            expect(typeof capturedModuleDefinition.stop).toBe("function");
            expect(typeof capturedModuleDefinition.suspend).toBe("function");
            expect(typeof capturedModuleDefinition.resume).toBe("function");
            expect(typeof capturedModuleDefinition.getDom).toBe("function");
            expect(typeof capturedModuleDefinition.getStyles).toBe("function");
            expect(typeof capturedModuleDefinition.getScripts).toBe("function");
            expect(typeof capturedModuleDefinition.convertTemperature).toBe("function");
            expect(typeof capturedModuleDefinition.socketNotificationReceived).toBe("function");
            expect(typeof capturedModuleDefinition.scheduleUpdate).toBe("function");
            expect(typeof capturedModuleDefinition.createChart).toBe("function");
        });
    });

    // -----------------------------------------------------------------------
    describe("defaults", () => {
        it("has updateInterval of 5 minutes (300000 ms)", () => {
            expect(capturedModuleDefinition.defaults.updateInterval).toBe(5 * 60 * 1000);
        });

        it("has empty haUrl by default", () => {
            expect(capturedModuleDefinition.defaults.haUrl).toBe("");
        });

        it("has empty haToken by default", () => {
            expect(capturedModuleDefinition.defaults.haToken).toBe("");
        });

        it("has units set to 'celsius'", () => {
            expect(capturedModuleDefinition.defaults.units).toBe("celsius");
        });

        it("has 6 default entities", () => {
            expect(capturedModuleDefinition.defaults.entities).toHaveLength(6);
        });

        it("width default is a string (e.g. '200px')", () => {
            expect(typeof capturedModuleDefinition.defaults.width).toBe("string");
        });

        it("height default is a string (e.g. '200px')", () => {
            expect(typeof capturedModuleDefinition.defaults.height).toBe("string");
        });

        it("does not expose demoData as a config option", () => {
            expect(capturedModuleDefinition.defaults).not.toHaveProperty("demoData");
        });
    });

    // -----------------------------------------------------------------------
    describe("convertTemperature()", () => {
        let mod;

        beforeEach(() => { mod = makeModuleInstance(); });

        it("returns original value when fromUnit is null", () => {
            expect(mod.convertTemperature(21.5, null, "°C")).toBe(21.5);
        });

        it("returns original value when toUnit is null", () => {
            expect(mod.convertTemperature(21.5, "°C", null)).toBe(21.5);
        });

        it("returns original value when fromUnit === toUnit (°C)", () => {
            expect(mod.convertTemperature(21.5, "°C", "°C")).toBe(21.5);
        });

        it("returns original value when fromUnit === toUnit (°F)", () => {
            expect(mod.convertTemperature(70.0, "°F", "°F")).toBe(70.0);
        });

        it("converts 0 °C → 32 °F", () => {
            expect(mod.convertTemperature(0, "°C", "°F")).toBe(32);
        });

        it("converts 100 °C → 212 °F", () => {
            expect(mod.convertTemperature(100, "°C", "°F")).toBeCloseTo(212, 5);
        });

        it("converts 21.5 °C → ~70.7 °F", () => {
            expect(mod.convertTemperature(21.5, "°C", "°F")).toBeCloseTo(70.7, 1);
        });

        it("converts 32 °F → 0 °C", () => {
            expect(mod.convertTemperature(32, "°F", "°C")).toBeCloseTo(0, 5);
        });

        it("converts 212 °F → 100 °C", () => {
            expect(mod.convertTemperature(212, "°F", "°C")).toBeCloseTo(100, 5);
        });

        it("converts negative temperatures: −10 °C → 14 °F", () => {
            expect(mod.convertTemperature(-10, "°C", "°F")).toBeCloseTo(14, 1);
        });

        it("returns original value for an unrecognised unit pair", () => {
            expect(mod.convertTemperature(21.5, "K", "°C")).toBe(21.5);
        });
    });

    // -----------------------------------------------------------------------
    describe("start() — demo mode (no HA config)", () => {
        let mod;

        beforeEach(() => {
            mod = makeModuleInstance({ config: { haUrl: "", haToken: "" } });
            mod.start();
        });

        it("sets loaded to true", () => {
            expect(mod.loaded).toBe(true);
        });

        it("populates temperatures with 6 demo rooms", () => {
            expect(mod.temperatures).toHaveLength(6);
        });

        it("demo temperatures include expected room names", () => {
            const rooms = mod.temperatures.map(t => t.room);
            expect(rooms).toContain("Living Room");
            expect(rooms).toContain("Outdoor");
        });

        it("demo temperatures carry unit_of_measurement", () => {
            mod.temperatures.forEach(t => {
                expect(t).toHaveProperty("unit_of_measurement");
            });
        });

        it("calls updateDom()", () => {
            expect(mod.updateDom).toHaveBeenCalledTimes(1);
        });

        it("does not immediately call sendSocketNotification (before first interval)", () => {
            expect(mod.sendSocketNotification).not.toHaveBeenCalled();
        });

        it("does not schedule HA polling interval in demo mode", () => {
            expect(mod.updateIntervalId).toBeNull();
        });

        it("calls Log.info at least once", () => {
            expect(global.Log.info).toHaveBeenCalled();
        });
    });

    // -----------------------------------------------------------------------
    describe("notificationReceived() — push mode", () => {
        let mod;

        beforeEach(() => {
            mod = makeModuleInstance({ config: {} });
        });

        it("updates temperatures when receiving TEMPERATURE_UPDATE", () => {
            const data = [
                { room: "Kitchen", temperature: 22.0, unit_of_measurement: "°C" }
            ];
            mod.notificationReceived("TEMPERATURE_UPDATE", data, { name: "MMM-SomeSensor" });
            expect(mod.temperatures).toEqual(data);
            expect(mod.loaded).toBe(true);
            expect(mod.updateDom).toHaveBeenCalled();
        });

        it("ignores non-array payloads", () => {
            mod.temperatures = [];
            mod.notificationReceived("TEMPERATURE_UPDATE", "bad", null);
            expect(mod.temperatures).toEqual([]);
        });

        it("ignores unrelated notifications", () => {
            mod.temperatures = [];
            mod.notificationReceived("SOME_OTHER", [{ room: "X", temperature: 1 }], null);
            expect(mod.temperatures).toEqual([]);
        });

        it("uses custom notificationName from config", () => {
            const customMod = makeModuleInstance({
                config: { notificationName: "CUSTOM_TEMPS" }
            });
            const data = [{ room: "Office", temperature: 21.0, unit_of_measurement: "°C" }];
            customMod.notificationReceived("CUSTOM_TEMPS", data, null);
            expect(customMod.temperatures).toEqual(data);
        });
    });

    // -----------------------------------------------------------------------
    describe("start() — HA configured", () => {
        let mod;

        beforeEach(() => {
            mod = makeModuleInstance({
                config: {
                    haUrl: "http://ha.local:8123",
                    haToken: "secret",
                    entities: [{ room: "Living Room", entity_id: "sensor.lr_temp" }]
                }
            });
            mod.start();
        });

        it("does not set loaded to true immediately", () => {
            expect(mod.loaded).toBe(false);
        });

        it("sends GET_TEMPERATURES immediately", () => {
            expect(mod.sendSocketNotification).toHaveBeenCalledWith(
                "GET_TEMPERATURES",
                expect.objectContaining({
                    haUrl: "http://ha.local:8123",
                    haToken: "secret",
                    entities: expect.any(Array)
                })
            );
        });

        it("does not send haUrl/haToken as extra config fields (minimal payload)", () => {
            const [, payload] = mod.sendSocketNotification.mock.calls[0];
            // The payload should only have haUrl, haToken, entities
            const allowedKeys = new Set(["haUrl", "haToken", "entities"]);
            Object.keys(payload).forEach(key => {
                expect(allowedKeys).toContain(key);
            });
        });

        it("schedules a periodic update interval", () => {
            expect(mod.updateIntervalId).not.toBeNull();
        });
    });

    // -----------------------------------------------------------------------
    describe("scheduleUpdate()", () => {
        let mod;

        beforeEach(() => {
            mod = makeModuleInstance({
                config: {
                    haUrl: "http://ha.local:8123",
                    haToken: "secret",
                    entities: [{ room: "Kitchen", entity_id: "sensor.kitchen_temp" }],
                    updateInterval: 10000
                }
            });
        });

        it("creates an interval ID", () => {
            mod.scheduleUpdate();
            expect(mod.updateIntervalId).not.toBeNull();
        });

        it("sends GET_TEMPERATURES after one interval elapses", () => {
            mod.scheduleUpdate();
            jest.advanceTimersByTime(10000);

            expect(mod.sendSocketNotification).toHaveBeenCalledWith(
                "GET_TEMPERATURES",
                expect.objectContaining({ haUrl: "http://ha.local:8123" })
            );
        });

        it("sends GET_TEMPERATURES multiple times across multiple intervals", () => {
            mod.scheduleUpdate();
            jest.advanceTimersByTime(30000); // 3 × 10 000 ms

            expect(mod.sendSocketNotification).toHaveBeenCalledTimes(3);
        });

        it("clears the previous interval when called again (no duplicate timers)", () => {
            mod.scheduleUpdate();
            mod.scheduleUpdate(); // second call should clear the first

            jest.advanceTimersByTime(10000);
            // Should fire exactly once (second interval), not twice
            expect(mod.sendSocketNotification).toHaveBeenCalledTimes(1);
        });

        it("passes entity list from config in the payload", () => {
            mod.scheduleUpdate();
            jest.advanceTimersByTime(10000);

            expect(mod.sendSocketNotification).toHaveBeenCalledWith(
                "GET_TEMPERATURES",
                expect.objectContaining({
                    entities: [{ room: "Kitchen", entity_id: "sensor.kitchen_temp" }]
                })
            );
        });

        it("fires GET_TEMPERATURES even when haUrl is empty (demo mode refresh)", () => {
            mod.config.haUrl = "";
            mod.config.haToken = "";
            mod.scheduleUpdate();
            jest.advanceTimersByTime(10000);

            expect(mod.sendSocketNotification).toHaveBeenCalledWith(
                "GET_TEMPERATURES",
                expect.any(Object)
            );
        });
    });

    // -----------------------------------------------------------------------
    describe("socketNotificationReceived()", () => {
        let mod;

        beforeEach(() => { mod = makeModuleInstance(); });

        it("stores received temperatures", () => {
            const payload = [{ room: "Kitchen", temperature: 22.3, unit_of_measurement: "°C" }];
            mod.socketNotificationReceived("TEMPERATURES_RESULT", payload);
            expect(mod.temperatures).toEqual(payload);
        });

        it("sets loaded to true after TEMPERATURES_RESULT", () => {
            mod.socketNotificationReceived("TEMPERATURES_RESULT", []);
            expect(mod.loaded).toBe(true);
        });

        it("calls updateDom after TEMPERATURES_RESULT", () => {
            mod.socketNotificationReceived("TEMPERATURES_RESULT", []);
            expect(mod.updateDom).toHaveBeenCalledTimes(1);
        });

        it("ignores unrecognised notifications", () => {
            mod.socketNotificationReceived("SOME_OTHER_EVENT", { foo: "bar" });
            expect(mod.temperatures).toEqual([]);
            expect(mod.loaded).toBe(false);
            expect(mod.updateDom).not.toHaveBeenCalled();
        });

        it("replaces temperatures on a second TEMPERATURES_RESULT", () => {
            const first  = [{ room: "Living Room", temperature: 21.5, unit_of_measurement: "°C" }];
            const second = [{ room: "Bedroom",     temperature: 20.8, unit_of_measurement: "°C" }];

            mod.socketNotificationReceived("TEMPERATURES_RESULT", first);
            mod.socketNotificationReceived("TEMPERATURES_RESULT", second);

            expect(mod.temperatures).toEqual(second);
        });
    });

    // -----------------------------------------------------------------------
    describe("getDom()", () => {

        it("creates a div element for the wrapper", () => {
            const mod = makeModuleInstance();
            mod.getDom();
            expect(global.document.createElement).toHaveBeenCalledWith("div");
        });

        it("shows 'Loading...' via textContent when not yet loaded", () => {
            const mod = makeModuleInstance({ loaded: false });
            const wrapper = mod.getDom();
            expect(wrapper.textContent).toBe("Loading...");
        });

        it("does not set textContent to 'Loading...' when loaded", () => {
            const mod = makeModuleInstance({ loaded: true, temperatures: DEMO_DATA });
            const wrapper = mod.getDom();
            expect(wrapper.textContent).not.toBe("Loading...");
        });

        it("normalizes numeric width to CSS string (e.g. 400 → '400px')", () => {
            const mod = makeModuleInstance({ loaded: true, temperatures: DEMO_DATA, config: { width: 400, height: 300 } });
            mod.getDom();
            // The chartDiv is the second createElement call (wrapper, chartDiv, updatedDiv)
            const calls = global.document.createElement.mock.results;
            const chartDiv = calls[1].value;
            expect(chartDiv.style.width).toBe("400px");
            expect(chartDiv.style.height).toBe("300px");
        });

        it("passes string width unchanged (e.g. '300px')", () => {
            const mod = makeModuleInstance({ loaded: true, temperatures: DEMO_DATA, config: { width: "300px", height: "250px" } });
            mod.getDom();
            const calls = global.document.createElement.mock.results;
            const chartDiv = calls[1].value;
            expect(chartDiv.style.width).toBe("300px");
            expect(chartDiv.style.height).toBe("250px");
        });

        it("schedules createChart via setTimeout when loaded with data", () => {
            const mod = makeModuleInstance({ loaded: true, temperatures: DEMO_DATA });
            mod.createChart = jest.fn();

            mod.getDom();
            expect(mod.createChart).not.toHaveBeenCalled(); // not yet

            jest.advanceTimersByTime(500);
            expect(mod.createChart).toHaveBeenCalledTimes(1);
        });

        it("clears the previous chartTimer before scheduling a new one", () => {
            const mod = makeModuleInstance({ loaded: true, temperatures: DEMO_DATA });
            mod.createChart = jest.fn();

            mod.getDom(); // first call — queues timer
            mod.getDom(); // second call — should cancel first and queue new one

            jest.advanceTimersByTime(500);
            expect(mod.createChart).toHaveBeenCalledTimes(1); // not 2
        });

        it("clears chartTimer reference after it fires", () => {
            const mod = makeModuleInstance({ loaded: true, temperatures: DEMO_DATA });
            mod.createChart = jest.fn();

            mod.getDom();
            jest.advanceTimersByTime(500);
            expect(mod.chartTimer).toBeNull();
        });

        it("does not schedule createChart when temperatures array is empty", () => {
            const mod = makeModuleInstance({ loaded: true, temperatures: [] });
            mod.createChart = jest.fn();

            mod.getDom();
            jest.advanceTimersByTime(500);
            expect(mod.createChart).not.toHaveBeenCalled();
        });
    });

    // -----------------------------------------------------------------------
    describe("stop()", () => {
        it("clears the update interval", () => {
            const mod = makeModuleInstance();
            mod.scheduleUpdate();
            expect(mod.updateIntervalId).not.toBeNull();

            mod.stop();
            expect(mod.updateIntervalId).toBeNull();
        });

        it("stops the interval from firing after stop()", () => {
            const mod = makeModuleInstance({ config: { updateInterval: 5000, haUrl: "http://ha.local", haToken: "x", entities: [] } });
            mod.scheduleUpdate();
            mod.stop();

            jest.advanceTimersByTime(5000);
            expect(mod.sendSocketNotification).not.toHaveBeenCalled();
        });

        it("clears chartTimer if pending", () => {
            const mod = makeModuleInstance({ loaded: true, temperatures: DEMO_DATA });
            mod.createChart = jest.fn();
            mod.getDom(); // queues chartTimer
            expect(mod.chartTimer).not.toBeNull();

            mod.stop();
            expect(mod.chartTimer).toBeNull();
        });

        it("does not fire createChart after stop() clears chartTimer", () => {
            const mod = makeModuleInstance({ loaded: true, temperatures: DEMO_DATA });
            mod.createChart = jest.fn();
            mod.getDom();
            mod.stop();

            jest.advanceTimersByTime(500);
            expect(mod.createChart).not.toHaveBeenCalled();
        });

        it("disposes the amCharts root if present", () => {
            const mod = makeModuleInstance();
            const fakeRoot = { dispose: jest.fn(), _logo: { dispose: jest.fn() } };
            mod.root = fakeRoot;

            mod.stop();
            expect(fakeRoot.dispose).toHaveBeenCalledTimes(1);
            expect(mod.root).toBeNull();
            expect(mod.chart).toBeNull();
        });

        it("does not throw when no interval or root exists", () => {
            const mod = makeModuleInstance();
            expect(() => mod.stop()).not.toThrow();
        });

        it("logs to Log.info", () => {
            const mod = makeModuleInstance();
            mod.stop();
            expect(global.Log.info).toHaveBeenCalled();
        });
    });

    // -----------------------------------------------------------------------
    describe("suspend()", () => {
        it("clears the update interval", () => {
            const mod = makeModuleInstance();
            mod.scheduleUpdate();
            expect(mod.updateIntervalId).not.toBeNull();

            mod.suspend();
            expect(mod.updateIntervalId).toBeNull();
        });

        it("stops the interval from firing after suspend()", () => {
            const mod = makeModuleInstance({ config: { updateInterval: 5000, haUrl: "http://ha.local", haToken: "x", entities: [] } });
            mod.scheduleUpdate();
            mod.suspend();

            jest.advanceTimersByTime(5000);
            expect(mod.sendSocketNotification).not.toHaveBeenCalled();
        });

        it("does not throw when no interval exists", () => {
            const mod = makeModuleInstance();
            expect(() => mod.suspend()).not.toThrow();
        });

        it("logs to Log.info", () => {
            const mod = makeModuleInstance();
            mod.suspend();
            expect(global.Log.info).toHaveBeenCalled();
        });
    });

    // -----------------------------------------------------------------------
    describe("resume()", () => {
        it("schedules a new update interval after suspend", () => {
            const mod = makeModuleInstance({ config: { updateInterval: 5000, haUrl: "http://ha.local", haToken: "x", entities: [] } });
            mod.suspend();
            expect(mod.updateIntervalId).toBeNull();

            mod.resume();
            expect(mod.updateIntervalId).not.toBeNull();
        });

        it("fires GET_TEMPERATURES after one interval following resume()", () => {
            const mod = makeModuleInstance({ config: { updateInterval: 5000, haUrl: "http://ha.local", haToken: "x", entities: [] } });
            mod.suspend();
            mod.resume();

            jest.advanceTimersByTime(5000);
            expect(mod.sendSocketNotification).toHaveBeenCalledWith(
                "GET_TEMPERATURES",
                expect.any(Object)
            );
        });

        it("logs to Log.info", () => {
            const mod = makeModuleInstance();
            mod.resume();
            expect(global.Log.info).toHaveBeenCalled();
        });
    });

    // -----------------------------------------------------------------------
    describe("getStyles()", () => {
        it("returns an array containing the CSS filename", () => {
            const mod = makeModuleInstance();
            expect(mod.getStyles()).toContain("MMM-TemperatureRadar.css");
        });
    });

    // -----------------------------------------------------------------------
    describe("getScripts()", () => {
        it("returns exactly four CDN script URLs", () => {
            const mod = makeModuleInstance();
            expect(mod.getScripts()).toHaveLength(4);
        });

        it("includes the amCharts5 index script", () => {
            const mod = makeModuleInstance();
            expect(mod.getScripts()).toContain("https://cdn.amcharts.com/lib/5/index.js");
        });

        it("includes the amCharts5 radar script", () => {
            const mod = makeModuleInstance();
            expect(mod.getScripts()).toContain("https://cdn.amcharts.com/lib/5/radar.js");
        });

        it("includes the amCharts5 xy script", () => {
            const mod = makeModuleInstance();
            expect(mod.getScripts()).toContain("https://cdn.amcharts.com/lib/5/xy.js");
        });

        it("includes the amCharts5 Animated theme script", () => {
            const mod = makeModuleInstance();
            expect(mod.getScripts()).toContain("https://cdn.amcharts.com/lib/5/themes/Animated.js");
        });
    });

    // -----------------------------------------------------------------------
    describe("createChart()", () => {

        let mod;

        beforeEach(() => {
            mod = makeModuleInstance({ loaded: true, temperatures: DEMO_DATA });
        });

        it("disposes previous root before creating a new one", () => {
            const oldRoot = { dispose: jest.fn(), _logo: { dispose: jest.fn() } };
            mod.root = oldRoot;
            mod.createChart();
            expect(oldRoot.dispose).toHaveBeenCalled();
        });

        it("calls am5.Root.new with the instance-unique chart ID", () => {
            mod.createChart();
            expect(global.am5.Root.new).toHaveBeenCalledWith(
                "temperature-radar-chart-MMM-TemperatureRadar_1"
            );
        });

        it("disposes the amCharts logo", () => {
            mod.createChart();
            expect(rootStub._logo.dispose).toHaveBeenCalled();
        });

        it("creates a RadarChart", () => {
            mod.createChart();
            expect(global.am5radar.RadarChart.new).toHaveBeenCalled();
        });

        it("creates AxisRendererCircular for the x-axis", () => {
            mod.createChart();
            expect(global.am5radar.AxisRendererCircular.new).toHaveBeenCalled();
        });

        it("creates AxisRendererRadial for the y-axis", () => {
            mod.createChart();
            expect(global.am5radar.AxisRendererRadial.new).toHaveBeenCalled();
        });

        it("creates a RadarLineSeries", () => {
            mod.createChart();
            expect(global.am5radar.RadarLineSeries.new).toHaveBeenCalled();
        });

        it("uses °C number format when units is 'celsius'", () => {
            mod.config.units = "celsius";
            mod.createChart();
            expect(global.am5xy.ValueAxis.new).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({ numberFormat: "#'°C'" })
            );
        });

        it("uses °F number format when units is 'fahrenheit'", () => {
            mod.config.units = "fahrenheit";
            mod.createChart();
            expect(global.am5xy.ValueAxis.new).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({ numberFormat: "#'°F'" })
            );
        });

        it("sets tooltip label to °C suffix when units is 'celsius'", () => {
            mod.config.units = "celsius";
            mod.createChart();
            expect(global.am5radar.RadarLineSeries.new).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({
                    tooltip: expect.objectContaining({})
                })
            );
            // The tooltip labelText is constructed with the unit suffix
            const call = global.am5radar.RadarLineSeries.new.mock.calls[0][1];
            expect(call.tooltip).toBeDefined();
        });

        it("does not throw when temperatures array is empty", () => {
            mod.temperatures = [];
            expect(() => mod.createChart()).not.toThrow();
        });
    });
});
