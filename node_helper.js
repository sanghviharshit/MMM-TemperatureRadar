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
            this.sendSocketNotification("TEMPERATURES_RESULT", config.demoData);
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
                return { state: demoTemp ? demoTemp.temperature : 20 };
            })
        );

        Promise.all(promises)
            .then(results => {
                const temperatures = results.map((data, index) => ({
                    room: config.entities[index].room,
                    temperature: parseFloat(data.state)
                }));
                
                console.log("Sending temperatures:", temperatures);
                this.sendSocketNotification("TEMPERATURES_RESULT", temperatures);
            })
            .catch(error => {
                console.error("Error fetching temperatures:", error);
                console.log("Falling back to demo data");
                this.sendSocketNotification("TEMPERATURES_RESULT", config.demoData);
            });
    },

    socketNotificationReceived: function(notification, payload) {
        console.log("Node helper received notification:", notification);
        if (notification === "GET_TEMPERATURES") {
            this.getTemperatures(payload);
        }
    }
});