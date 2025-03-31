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
                const demoTemp = config.demoData.find(d => d.room === entity.room);
                return { 
                    state: demoTemp ? demoTemp.temperature : 20,
                    attributes: { unit_of_measurement: "°C" } // Default to Celsius for demo data
                };
            })
        );

        Promise.all(promises)
            .then(results => {
                const temperatures = results.map((data, index) => ({
                    room: config.entities[index].room,
                    temperature: parseFloat(data.state),
                    unit_of_measurement: data.attributes?.unit_of_measurement || "°C" // Get unit from HA or default to Celsius
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