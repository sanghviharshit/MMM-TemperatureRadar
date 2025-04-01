const NodeHelper = require("node_helper");
const fetch = require("node-fetch");

module.exports = NodeHelper.create({
    start: function() {
        console.log("Starting node helper for: " + this.name);
    },

    getTemperatures: function(config) {
        console.log("Fetching temperatures from HA");
        
        if (!config.haUrl || !config.haToken) {
            console.log("No HA config, sending demo data");
            // Add unit_of_measurement to demo data
            const demoDataWithUnits = config.demoData.map(data => ({
                ...data,
                unit_of_measurement: "°C" // Demo data is in Celsius
            }));
            this.sendSocketNotification("TEMPERATURES_RESULT", demoDataWithUnits);
            return;
        }

        const promises = config.entities.map(entity =>
            fetch(`${config.haUrl}/api/states/${entity.entity_id}`, {
                headers: {
                    "Authorization": `Bearer ${config.haToken}`,
                    "Content-Type": "application/json"
                }
            })
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response.json();
            })
            .catch(error => {
                console.error(`Error fetching data for ${entity.room}:`, error);
                return null; // Return null instead of demo data on error
            })
        );

        Promise.all(promises)
            .then(results => {
                // Filter out null results and map the valid ones
                const temperatures = results
                    .map((data, index) => ({
                        room: config.entities[index].room,
                        data: data
                    }))
                    .filter(item => item.data !== null)
                    .map(item => ({
                        room: item.room,
                        temperature: parseFloat(item.data.state),
                        unit_of_measurement: item.data.attributes?.unit_of_measurement || "°C"
                    }));
                
                console.log("Sending temperatures:", temperatures);
                this.sendSocketNotification("TEMPERATURES_RESULT", temperatures);
            })
            .catch(error => {
                console.error("Error fetching temperatures:", error);
                console.log("Falling back to demo data");
                // Add unit_of_measurement to demo data
                const demoDataWithUnits = config.demoData.map(data => ({
                    ...data,
                    unit_of_measurement: "°C" // Demo data is in Celsius
                }));
                this.sendSocketNotification("TEMPERATURES_RESULT", demoDataWithUnits);
            });
    },

    socketNotificationReceived: function(notification, payload) {
        console.log("Node helper received notification:", notification);
        if (notification === "GET_TEMPERATURES") {
            this.getTemperatures(payload);
        }
    }
});