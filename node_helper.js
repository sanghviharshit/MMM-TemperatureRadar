const NodeHelper = require("node_helper");

// Demo data used when Home Assistant is not configured or fetch fails.
const DEMO_DATA = [
    { room: "Living Room", temperature: 21.5, unit_of_measurement: "°C" },
    { room: "Kitchen",     temperature: 22.3, unit_of_measurement: "°C" },
    { room: "Bedroom",     temperature: 20.8, unit_of_measurement: "°C" },
    { room: "Bathroom",    temperature: 23.1, unit_of_measurement: "°C" },
    { room: "Office",      temperature: 21.7, unit_of_measurement: "°C" },
    { room: "Outdoor",     temperature: 5.5,  unit_of_measurement: "°C" }
];

module.exports = NodeHelper.create({
    start: function() {
        console.log("Starting node helper for: " + this.name);
    },

    getTemperatures: function(config) {
        console.log("Fetching temperatures from HA");

        if (!config.haUrl || !config.haToken) {
            console.log("No HA config, sending demo data");
            this.sendSocketNotification("TEMPERATURES_RESULT", DEMO_DATA);
            return;
        }

        const promises = config.entities.map(entity => {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);

            return fetch(`${config.haUrl}/api/states/${entity.entity_id}`, {
                signal: controller.signal,
                headers: {
                    "Authorization": `Bearer ${config.haToken}`,
                    "Content-Type": "application/json"
                }
            })
            .then(response => {
                clearTimeout(timeoutId);
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response.json();
            })
            .catch(error => {
                clearTimeout(timeoutId);
                console.error(`Error fetching data for ${entity.room}:`, error);
                return null;
            });
        });

        Promise.all(promises)
            .then(results => {
                const temperatures = results
                    .map((data, index) => ({
                        room: config.entities[index].room,
                        data: data
                    }))
                    .filter(item => item.data !== null && item.data.state !== "unavailable")
                    .map(item => ({
                        room: item.room,
                        temperature: parseFloat(item.data.state),
                        unit_of_measurement: item.data.attributes?.unit_of_measurement || "°C"
                    }));

                console.log("Sending temperatures:", temperatures);
                this.sendSocketNotification("TEMPERATURES_RESULT", temperatures);
            })
            .catch(error => {
                console.error("Error processing temperature results:", error);
            });
    },

    getHumidity: function(config) {
        console.log("Fetching humidity from HA");

        if (!config.haUrl || !config.haToken) {
            return;
        }

        const promises = config.entities.map(entity => {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);

            return fetch(`${config.haUrl}/api/states/${entity.entity_id}`, {
                signal: controller.signal,
                headers: {
                    "Authorization": `Bearer ${config.haToken}`,
                    "Content-Type": "application/json"
                }
            })
            .then(response => {
                clearTimeout(timeoutId);
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response.json();
            })
            .catch(error => {
                clearTimeout(timeoutId);
                console.error(`Error fetching humidity for ${entity.room}:`, error);
                return null;
            });
        });

        Promise.all(promises)
            .then(results => {
                const humidity = results
                    .map((data, index) => ({
                        room: config.entities[index].room,
                        data: data
                    }))
                    .filter(item => item.data !== null && item.data.state !== "unavailable")
                    .map(item => ({
                        room: item.room,
                        humidity: parseFloat(item.data.state)
                    }));

                console.log("Sending humidity:", humidity);
                this.sendSocketNotification("HUMIDITY_RESULT", humidity);
            })
            .catch(error => {
                console.error("Error processing humidity results:", error);
            });
    },

    socketNotificationReceived: function(notification, payload) {
        console.log("Node helper received notification:", notification);
        if (notification === "GET_TEMPERATURES") {
            this.getTemperatures(payload);
        }
        if (notification === "GET_HUMIDITY") {
            this.getHumidity(payload);
        }
    }
});
