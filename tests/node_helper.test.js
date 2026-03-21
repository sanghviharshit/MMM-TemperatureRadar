/**
 * @file tests/node_helper.test.js
 *
 * Tests for node_helper.js.
 *
 * Strategy:
 *  - jest.mock('node-fetch') intercepts all fetch calls.
 *  - NodeHelper is replaced with a minimal stub whose .create() captures the
 *    handler object and returns it with a spy on sendSocketNotification.
 *  - We call getTemperatures() and socketNotificationReceived() directly.
 */

"use strict";

jest.mock("node-fetch");
const fetch = require("node-fetch");

// ---- NodeHelper stub -------------------------------------------------------
// node_helper.js does:  module.exports = NodeHelper.create({ ... })
// Our stub returns the passed object augmented with a sendSocketNotification spy.
// The variable must be prefixed with 'mock' so Jest allows referencing it
// inside the jest.mock() factory (Jest hoists mock factories and restricts
// which variables they can close over).
let mockCapturedHandler;
jest.mock("node_helper", () => ({
    create: (definition) => {
        mockCapturedHandler = {
            ...definition,
            name: "MMM-TemperatureRadar",
            sendSocketNotification: jest.fn(),
        };
        return mockCapturedHandler;
    }
}), { virtual: true }); // virtual: true because node_helper is not a real npm package

// Require AFTER mocks are in place
const helper = require("../node_helper");

// Flushes all pending microtasks + macrotasks in the queue so that
// Promise chains (fetch → .then → Promise.all → .then) fully resolve
// before assertions run.
const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

// ---------------------------------------------------------------------------

describe("node_helper", () => {

    beforeEach(() => {
        jest.clearAllMocks();
        // Re-attach the spy after clearAllMocks resets call counts
        helper.sendSocketNotification = jest.fn();
    });

    // -----------------------------------------------------------------------
    describe("start()", () => {
        it("logs the module name without throwing", () => {
            const consoleSpy = jest.spyOn(console, "log").mockImplementation(() => {});
            expect(() => helper.start()).not.toThrow();
            consoleSpy.mockRestore();
        });
    });

    // -----------------------------------------------------------------------
    describe("getTemperatures() — no HA config (demo data path)", () => {

        it("sends TEMPERATURES_RESULT with DEMO_DATA when haUrl is empty", () => {
            helper.getTemperatures({ haUrl: "", haToken: "", entities: [] });

            expect(helper.sendSocketNotification).toHaveBeenCalledTimes(1);
            expect(helper.sendSocketNotification).toHaveBeenCalledWith(
                "TEMPERATURES_RESULT",
                expect.arrayContaining([
                    expect.objectContaining({ room: "Living Room", temperature: 21.5 })
                ])
            );
            expect(fetch).not.toHaveBeenCalled();
        });

        it("sends TEMPERATURES_RESULT with DEMO_DATA when haToken is missing", () => {
            helper.getTemperatures({ haUrl: "http://ha.local:8123", haToken: "", entities: [] });

            expect(helper.sendSocketNotification).toHaveBeenCalledWith(
                "TEMPERATURES_RESULT",
                expect.any(Array)
            );
            expect(fetch).not.toHaveBeenCalled();
        });

        it("sends exactly 6 demo rooms", () => {
            helper.getTemperatures({ haUrl: "", haToken: "", entities: [] });

            const [, payload] = helper.sendSocketNotification.mock.calls[0];
            expect(payload).toHaveLength(6);
        });

        it("demo data items have the required shape", () => {
            helper.getTemperatures({ haUrl: "", haToken: "", entities: [] });

            const [, payload] = helper.sendSocketNotification.mock.calls[0];
            payload.forEach(item => {
                expect(item).toHaveProperty("room");
                expect(item).toHaveProperty("temperature");
                expect(item).toHaveProperty("unit_of_measurement");
                expect(typeof item.temperature).toBe("number");
            });
        });

        it("demo data unit_of_measurement is °C", () => {
            helper.getTemperatures({ haUrl: "", haToken: "", entities: [] });

            const [, payload] = helper.sendSocketNotification.mock.calls[0];
            payload.forEach(item => {
                expect(item.unit_of_measurement).toBe("°C");
            });
        });
    });

    // -----------------------------------------------------------------------
    describe("getTemperatures() — successful HA fetch", () => {

        const VALID_CONFIG = {
            haUrl: "http://ha.local:8123",
            haToken: "secret-token",
            entities: [
                { room: "Living Room", entity_id: "sensor.living_room_temperature" },
                { room: "Bedroom",     entity_id: "sensor.bedroom_temperature" },
            ]
        };

        function makeFetchResponse(state, unit = "°C") {
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve({
                    state,
                    attributes: { unit_of_measurement: unit }
                })
            });
        }

        it("calls fetch once per entity with the correct URL", () => {
            fetch
                .mockReturnValueOnce(makeFetchResponse("21.5"))
                .mockReturnValueOnce(makeFetchResponse("20.8"));

            helper.getTemperatures(VALID_CONFIG);

            expect(fetch).toHaveBeenCalledTimes(2);
            expect(fetch).toHaveBeenCalledWith(
                "http://ha.local:8123/api/states/sensor.living_room_temperature",
                expect.any(Object)
            );
        });

        it("sends Bearer auth header on each request", () => {
            fetch
                .mockReturnValueOnce(makeFetchResponse("21.5"))
                .mockReturnValueOnce(makeFetchResponse("20.8"));

            helper.getTemperatures(VALID_CONFIG);

            expect(fetch).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    headers: expect.objectContaining({
                        Authorization: "Bearer secret-token"
                    })
                })
            );
        });

        it("sends Content-Type: application/json on each request", () => {
            fetch.mockReturnValueOnce(makeFetchResponse("21.0"));

            helper.getTemperatures({
                ...VALID_CONFIG,
                entities: [{ room: "Living Room", entity_id: "sensor.living_room_temperature" }]
            });

            expect(fetch).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    headers: expect.objectContaining({
                        "Content-Type": "application/json"
                    })
                })
            );
        });

        it("attaches an AbortSignal to each request for timeout support", () => {
            fetch.mockReturnValueOnce(makeFetchResponse("21.0"));

            helper.getTemperatures({
                ...VALID_CONFIG,
                entities: [{ room: "Living Room", entity_id: "sensor.living_room_temperature" }]
            });

            expect(fetch).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({ signal: expect.any(Object) })
            );
        });

        it("sends TEMPERATURES_RESULT with parsed temperature data", async () => {
            fetch
                .mockReturnValueOnce(makeFetchResponse("21.5", "°C"))
                .mockReturnValueOnce(makeFetchResponse("20.8", "°C"));

            helper.getTemperatures(VALID_CONFIG);
            await flushPromises();

            expect(helper.sendSocketNotification).toHaveBeenCalledWith(
                "TEMPERATURES_RESULT",
                [
                    { room: "Living Room", temperature: 21.5, unit_of_measurement: "°C" },
                    { room: "Bedroom",     temperature: 20.8, unit_of_measurement: "°C" },
                ]
            );
        });

        it("parses temperature state as a float", async () => {
            fetch.mockReturnValueOnce(makeFetchResponse("22.30"));

            helper.getTemperatures({
                ...VALID_CONFIG,
                entities: [{ room: "Kitchen", entity_id: "sensor.kitchen_temperature" }]
            });
            await flushPromises();

            const [, payload] = helper.sendSocketNotification.mock.calls[0];
            expect(payload[0].temperature).toBe(22.3);
            expect(typeof payload[0].temperature).toBe("number");
        });

        it("defaults unit_of_measurement to °C when attribute is absent", async () => {
            fetch.mockReturnValueOnce(Promise.resolve({
                ok: true,
                json: () => Promise.resolve({ state: "19.0", attributes: {} })
            }));

            helper.getTemperatures({
                ...VALID_CONFIG,
                entities: [{ room: "Office", entity_id: "sensor.office_temperature" }]
            });
            await flushPromises();

            const [, payload] = helper.sendSocketNotification.mock.calls[0];
            expect(payload[0].unit_of_measurement).toBe("°C");
        });

        it("preserves the room name from the config entity", async () => {
            fetch.mockReturnValueOnce(makeFetchResponse("21.5"));

            helper.getTemperatures({
                ...VALID_CONFIG,
                entities: [{ room: "My Custom Room", entity_id: "sensor.custom_temp" }]
            });
            await flushPromises();

            const [, payload] = helper.sendSocketNotification.mock.calls[0];
            expect(payload[0].room).toBe("My Custom Room");
        });
    });

    // -----------------------------------------------------------------------
    describe("getTemperatures() — filtering unavailable entities", () => {

        const VALID_CONFIG = {
            haUrl: "http://ha.local:8123",
            haToken: "secret-token",
            entities: [
                { room: "Living Room", entity_id: "sensor.living_room_temperature" },
                { room: "Bedroom",     entity_id: "sensor.bedroom_temperature" },
            ]
        };

        it("excludes entities whose state is 'unavailable'", async () => {
            fetch
                .mockReturnValueOnce(Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ state: "unavailable", attributes: { unit_of_measurement: "°C" } })
                }))
                .mockReturnValueOnce(Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ state: "20.8", attributes: { unit_of_measurement: "°C" } })
                }));

            helper.getTemperatures(VALID_CONFIG);
            await flushPromises();

            const [, payload] = helper.sendSocketNotification.mock.calls[0];
            expect(payload).toHaveLength(1);
            expect(payload[0].room).toBe("Bedroom");
        });

        it("sends an empty array when all entities are unavailable", async () => {
            fetch
                .mockReturnValueOnce(Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ state: "unavailable", attributes: {} })
                }))
                .mockReturnValueOnce(Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ state: "unavailable", attributes: {} })
                }));

            helper.getTemperatures(VALID_CONFIG);
            await flushPromises();

            const [, payload] = helper.sendSocketNotification.mock.calls[0];
            expect(payload).toHaveLength(0);
        });
    });

    // -----------------------------------------------------------------------
    describe("getTemperatures() — fetch error handling", () => {

        const VALID_CONFIG = {
            haUrl: "http://ha.local:8123",
            haToken: "secret-token",
            entities: [
                { room: "Living Room", entity_id: "sensor.living_room_temperature" },
                { room: "Bedroom",     entity_id: "sensor.bedroom_temperature" },
            ]
        };

        it("excludes an entity when fetch rejects (network error)", async () => {
            fetch
                .mockReturnValueOnce(Promise.reject(new Error("Network failure")))
                .mockReturnValueOnce(Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ state: "20.8", attributes: { unit_of_measurement: "°C" } })
                }));

            helper.getTemperatures(VALID_CONFIG);
            await flushPromises();

            const [, payload] = helper.sendSocketNotification.mock.calls[0];
            expect(payload).toHaveLength(1);
            expect(payload[0].room).toBe("Bedroom");
        });

        it("excludes an entity when fetch returns a non-ok HTTP status", async () => {
            fetch
                .mockReturnValueOnce(Promise.resolve({ ok: false, status: 401 }))
                .mockReturnValueOnce(Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ state: "20.8", attributes: { unit_of_measurement: "°C" } })
                }));

            helper.getTemperatures(VALID_CONFIG);
            await flushPromises();

            const [, payload] = helper.sendSocketNotification.mock.calls[0];
            expect(payload).toHaveLength(1);
            expect(payload[0].room).toBe("Bedroom");
        });

        it("sends an empty TEMPERATURES_RESULT when all fetches fail", async () => {
            fetch.mockReturnValue(Promise.reject(new Error("Timeout")));

            helper.getTemperatures(VALID_CONFIG);
            await flushPromises();

            expect(helper.sendSocketNotification).toHaveBeenCalledWith(
                "TEMPERATURES_RESULT",
                []
            );
        });
    });

    // -----------------------------------------------------------------------
    describe("socketNotificationReceived()", () => {

        it("calls getTemperatures when notification is GET_TEMPERATURES", () => {
            const spy = jest.spyOn(helper, "getTemperatures").mockImplementation(() => {});
            const payload = { haUrl: "", haToken: "", entities: [] };

            helper.socketNotificationReceived("GET_TEMPERATURES", payload);

            expect(spy).toHaveBeenCalledWith(payload);
            spy.mockRestore();
        });

        it("does not call getTemperatures for unknown notifications", () => {
            const spy = jest.spyOn(helper, "getTemperatures").mockImplementation(() => {});

            helper.socketNotificationReceived("SOME_OTHER_NOTIFICATION", {});

            expect(spy).not.toHaveBeenCalled();
            spy.mockRestore();
        });
    });
});
