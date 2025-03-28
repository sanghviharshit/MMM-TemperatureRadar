/**
 * @file MMM-TemperatureRadar.js
 *
 * @author Harshit S
 * @version 1.0.0
 * @description A MagicMirror² module that displays temperature readings from multiple
 * rooms in a radar chart using the Home Assistant API. If no Home Assistant
 * configuration is provided, it will display demo data.
 * @license MIT
 */

Module.register("MMM-TemperatureRadar", {
	// Your existing code with better comments...
	defaults: {
		updateInterval: 5 * 60 * 1000, // Update every 5 minutes
		haUrl: "", // Home Assistant URL (e.g., "http://homeassistant.local:8123")
		haToken: "", // Long-lived access token from Home Assistant
		width: "200px", // Chart width
		height: "200px", // Chart height
		entities: [
			{ room: "Living Room", entity_id: "sensor.living_room_temperature" },
			{ room: "Kitchen", entity_id: "sensor.kitchen_temperature" },
			{ room: "Bedroom", entity_id: "sensor.bedroom_temperature" },
			{ room: "Bathroom", entity_id: "sensor.bathroom_temperature" },
			{ room: "Office", entity_id: "sensor.office_temperature" },
			{ room: "Outdoor", entity_id: "sensor.outdoor_temperature" }
		],
		// Demo data used when Home Assistant is not configured
		demoData: [
			{ room: "Living Room", temperature: 21.5 },
			{ room: "Kitchen", temperature: 22.3 },
			{ room: "Bedroom", temperature: 20.8 },
			{ room: "Bathroom", temperature: 23.1 },
			{ room: "Office", temperature: 21.7 },
			{ room: "Outdoor", temperature: 5.5 }
		]
	},

    start: function() {
        Log.info("Starting module: " + this.name);
        this.temperatures = [];
        this.loaded = false;
        this.chart = null;
        this.root = null;
        
        // Use demo data if HA not configured
        if (!this.config.haUrl || !this.config.haToken) {
            Log.info("Using demo data");
            this.temperatures = [...this.config.demoData];
            this.loaded = true;
            this.updateDom(); // Add this line
        } else {
            Log.info("Fetching from HA");
            this.sendSocketNotification("GET_TEMPERATURES", this.config);
        }
        
        this.scheduleUpdate();
    },

    socketNotificationReceived: function(notification, payload) {
        if (notification === "TEMPERATURES_RESULT") {
            Log.info("Received temperatures:", payload);
            this.temperatures = payload;
            this.loaded = true;
            this.updateDom();
        }
    },

    getDom: function() {
        const wrapper = document.createElement("div");
        wrapper.className = "temperature-radar-wrapper";
        const chartDiv = document.createElement("div");
        
		chartDiv.id = "temperature-radar-chart";
        chartDiv.style.width = this.config.width;
        chartDiv.style.height = this.config.height;
        
        if (!this.loaded) {
            wrapper.innerHTML = "Loading...";
            return wrapper;
        }
        
        wrapper.appendChild(chartDiv);
        
        // Create chart after a short delay to ensure DOM is ready
        if (this.loaded && this.temperatures.length > 0) {
            Log.info("Creating chart with data:", this.temperatures);
            setTimeout(() => {
                this.createChart();
            }, 500);
        }
        
        return wrapper;
    },

	getStyles: function () {
		return ["MMM-TemperatureRadar.css"];
	},

	getScripts: function () {
		return ["https://cdn.amcharts.com/lib/5/index.js", "https://cdn.amcharts.com/lib/5/xy.js", "https://cdn.amcharts.com/lib/5/radar.js", "https://cdn.amcharts.com/lib/5/themes/Animated.js"];
	},

	scheduleUpdate: function () {
		setInterval(() => {
			if (this.config.haUrl && this.config.haToken) {
				this.getTemperatures();
			}
		}, this.config.updateInterval);
	},

	createChart: function () {
		am5.ready(() => {
			// Dispose of previous chart if it exists
			if (this.root) {
				this.root.dispose();
			}

			// Create root element
			this.root = am5.Root.new("temperature-radar-chart");
            this.root._logo.dispose();
			// Set themes
			this.root.setThemes([am5themes_Animated.new(this.root)]);

			// Create chart
			this.chart = this.root.container.children.push(
				am5radar.RadarChart.new(this.root, {
					panX: false,
					panY: false,
					wheelX: "none",
					wheelY: "none"
				})
			);

			// Create X axes and their renderers
			var xRenderer = am5radar.AxisRendererCircular.new(this.root, {
                minGridDistance: 0
            });
			xRenderer.grid.template.setAll({
				stroke: am5.color(0xffffff),
				strokeOpacity: 0.5,
				strokeWidth: 1,
			});

			xRenderer.labels.template.setAll({
				fill: am5.color(0xffffff),
				fontSize: "0.5em",
				radius: 10
			});
			var xAxis = this.chart.xAxes.push(
				am5xy.CategoryAxis.new(this.root, {
					maxDeviation: 0,
					categoryField: "room",
					renderer: xRenderer,
					tooltip: am5.Tooltip.new(this.root, {})
				})
			);

			// Create Y axes and their renderers
			var yRenderer = am5radar.AxisRendererRadial.new(this.root, {
                minGridDistance: 20,
            });

			yRenderer.grid.template.setAll({
				stroke: am5.color(0xffffff),
				strokeOpacity: 0.5,
				strokeWidth: 1,
			});

			yRenderer.labels.template.setAll({
				fill: am5.color(0xffffff),
				fontSize: "0.5em"
			});

			var yAxis = this.chart.yAxes.push(
				am5xy.ValueAxis.new(this.root, {
					renderer: yRenderer,
                    numberFormat: "#'°F'",
				})
			);

			// Create series
			var series = this.chart.series.push(
				am5radar.RadarLineSeries.new(this.root, {
					name: "Temperature",
					xAxis: xAxis,
					yAxis: yAxis,
					valueYField: "temperature",
					categoryXField: "room",
					stroke: am5.color("#808080"), // Add this line to set gray color
					tooltip: am5.Tooltip.new(this.root, {
						labelText: "{valueY}°F"
					})
				})
			);

			// Style series
			series.strokes.template.setAll({
				strokeWidth: 2,
				stroke: am5.color(0x808080),
				strokeOpacity: 0.8
			});

			series.fills.template.setAll({
				fillOpacity: 0.2,
				fill: am5.color("#808080")
			});

			// Add bullets
			series.bullets.push((root, series, dataItem) => {
				return am5.Bullet.new(root, {
					sprite: am5.Circle.new(root, {
						radius: 5,
						fill: am5.color(0x808080)
						// stroke: am5.color(0x808080),
						// strokeWidth: 2
					})
				});
			});

			// Set data
			xAxis.data.setAll(this.temperatures);
			series.data.setAll(this.temperatures);

			// Animate chart and series in
			series.appear(1000);
			this.chart.appear(1000, 100);
		});
	}
});
