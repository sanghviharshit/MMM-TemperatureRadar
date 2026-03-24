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

// Demo data used when Home Assistant is not configured or fetch fails.
// unit_of_measurement is pre-attached so convertTemperature always has a fromUnit.
const DEMO_DATA = [
	{ room: "Living Room", temperature: 21.5, unit_of_measurement: "°C" },
	{ room: "Kitchen",     temperature: 22.3, unit_of_measurement: "°C" },
	{ room: "Bedroom",     temperature: 20.8, unit_of_measurement: "°C" },
	{ room: "Bathroom",    temperature: 23.1, unit_of_measurement: "°C" },
	{ room: "Office",      temperature: 21.7, unit_of_measurement: "°C" },
	{ room: "Outdoor",     temperature: 5.5,  unit_of_measurement: "°C" }
];

Module.register("MMM-TemperatureRadar", {
	defaults: {
		updateInterval: 5 * 60 * 1000, // Update every 5 minutes
		haUrl: "", // Home Assistant URL (e.g., "http://homeassistant.local:8123")
		haToken: "", // Long-lived access token from Home Assistant
		width: "200px", // Chart width
		height: "200px", // Chart height
		units: "celsius", // "celsius" or "fahrenheit"
		minValue: null, // fixed Y axis minimum (null = auto)
		maxValue: null, // fixed Y axis maximum (null = auto)
		chartColor: "#808080", // series line, fill, and bullet color
		coloredBullets: false, // color data points by temperature (blue→green→red)
		showValues: true, // show temperature values on axis labels
		showTrends: true, // show ▲/▼ trend indicators when temperature is changing
		showLastUpdated: true, // show "Updated X min ago" below chart
		staleThreshold: 10 * 60 * 1000, // ms before data is considered stale (default 10 min)
		thresholdLow: null, // temperature below this is highlighted (in display units, null = disabled)
		thresholdHigh: null, // temperature above this is highlighted (in display units, null = disabled)
		thresholdColor: "#ff4444", // color for out-of-range bullets
		rotateChart: false, // slowly rotate the radar chart
		rotateSpeed: 60, // seconds per full rotation
		humidityColor: "#4488cc", // humidity series color
		notificationName: "TEMPERATURE_UPDATE", // notification name to listen for from other modules
		humidityNotificationName: "HUMIDITY_UPDATE", // notification for humidity push data
		entities: [
			{ room: "Living Room", entity_id: "sensor.living_room_temperature" },
			{ room: "Kitchen",     entity_id: "sensor.kitchen_temperature" },
			{ room: "Bedroom",     entity_id: "sensor.bedroom_temperature" },
			{ room: "Bathroom",    entity_id: "sensor.bathroom_temperature" },
			{ room: "Office",      entity_id: "sensor.office_temperature" },
			{ room: "Outdoor",     entity_id: "sensor.outdoor_temperature" }
		],
		humidityEntities: [], // Array of {room, entity_id} for humidity sensors
	},

	start: function() {
		Log.info("Starting module: " + this.name);
		this.temperatures = [];
		this.loaded = false;
		this.chart = null;
		this.root = null;
		this.xAxis = null;
		this.series = null;
		this.chartTimer = null;
		this.updateIntervalId = null;
		this.timestampIntervalId = null;
		this.lastUpdated = null;
		this.previousTemperatures = {};
		this.humidityData = [];
		this.humiditySeries = null;

		// Use demo data if HA not configured
		if (!this.config.haUrl || !this.config.haToken) {
			Log.info(this.name + ": No HA config — using demo data (listening for " + this.config.notificationName + " notifications)");
			this.temperatures = [...DEMO_DATA];
			this.loaded = true;
			this.lastUpdated = new Date();
			this.scheduleTimestampRefresh();
			this.updateDom();
		} else {
			Log.info(this.name + ": Fetching from HA");
			this.sendSocketNotification("GET_TEMPERATURES", {
				haUrl: this.config.haUrl,
				haToken: this.config.haToken,
				entities: this.config.entities
			});
			if (this.config.humidityEntities.length > 0) {
				this.sendSocketNotification("GET_HUMIDITY", {
					haUrl: this.config.haUrl,
					haToken: this.config.haToken,
					entities: this.config.humidityEntities
				});
			}
			this.scheduleUpdate();
		}
	},

	stop: function() {
		Log.info("Stopping module: " + this.name);
		if (this.updateIntervalId) {
			clearInterval(this.updateIntervalId);
			this.updateIntervalId = null;
		}
		if (this.timestampIntervalId) {
			clearInterval(this.timestampIntervalId);
			this.timestampIntervalId = null;
		}
		if (this.chartTimer) {
			clearTimeout(this.chartTimer);
			this.chartTimer = null;
		}
		if (this.root) {
			this.root.dispose();
			this.root = null;
			this.chart = null;
			this.xAxis = null;
			this.series = null;
			this.humiditySeries = null;
		}
	},

	suspend: function() {
		Log.info("Suspending module: " + this.name);
		if (this.updateIntervalId) {
			clearInterval(this.updateIntervalId);
			this.updateIntervalId = null;
		}
		if (this.timestampIntervalId) {
			clearInterval(this.timestampIntervalId);
			this.timestampIntervalId = null;
		}
	},

	resume: function() {
		Log.info("Resuming module: " + this.name);
		this.scheduleUpdate();
		this.scheduleTimestampRefresh();
	},

	notificationReceived: function(notification, payload, sender) {
		if (notification === this.config.notificationName && Array.isArray(payload)) {
			Log.info(this.name + ": Received temperatures from " + (sender ? sender.name : "unknown"));
			this.processTemperatureData(payload);
		}
		if (notification === this.config.humidityNotificationName && Array.isArray(payload)) {
			Log.info(this.name + ": Received humidity from " + (sender ? sender.name : "unknown"));
			this.processHumidityData(payload);
		}
	},

	socketNotificationReceived: function(notification, payload) {
		if (notification === "TEMPERATURES_RESULT") {
			Log.info("Received temperatures:", payload);
			this.processTemperatureData(payload);
		}
		if (notification === "HUMIDITY_RESULT") {
			Log.info("Received humidity:", payload);
			this.processHumidityData(payload);
		}
	},

	processTemperatureData: function(data) {
		// Store previous readings for trend arrows
		if (this.temperatures.length > 0) {
			this.previousTemperatures = {};
			this.temperatures.forEach(function(t) {
				this.previousTemperatures[t.room] = t.temperature;
			}.bind(this));
		}
		this.temperatures = data;
		this.loaded = true;
		this.lastUpdated = new Date();
		this.scheduleTimestampRefresh();
		// If chart exists, update data in place for smooth animation
		if (this.root && this.xAxis && this.series) {
			var convertedTemperatures = this.getConvertedData();
			this.xAxis.data.setAll(convertedTemperatures);
			this.series.data.setAll(convertedTemperatures);
			if (this.humiditySeries && this.humidityData.length > 0) {
				this.humiditySeries.data.setAll(this.getConvertedHumidityData());
			}
			this.updateTimestamp();
		} else {
			this.updateDom();
		}
	},

	processHumidityData: function(data) {
		this.humidityData = data;
		if (this.root && this.humiditySeries) {
			this.humiditySeries.data.setAll(this.getConvertedHumidityData());
		}
	},

	getConvertedHumidityData: function() {
		// Humidity is always in %, no unit conversion needed
		// Use cached room label map built during getConvertedData
		var labels = this.roomLabelMap || {};
		return this.humidityData.map(function(h) {
			return {
				room: labels[h.room] || h.room,
				humidity: parseFloat(h.humidity || h.temperature || h.state || 0)
			};
		});
	},

	formatTimeSince: function(date) {
		var seconds = Math.floor((new Date() - date) / 1000);
		if (seconds < 60) return "just now";
		var minutes = Math.floor(seconds / 60);
		if (minutes < 60) return minutes + " min ago";
		var hours = Math.floor(minutes / 60);
		return hours + "h " + (minutes % 60) + "m ago";
	},

	updateTimestamp: function() {
		if (!this.config.showLastUpdated || !this.lastUpdated) return;
		var el = document.getElementById("temperature-radar-updated-" + this.identifier);
		if (el) {
			el.textContent = "Updated " + this.formatTimeSince(this.lastUpdated);
			var age = new Date() - this.lastUpdated;
			if (age > this.config.staleThreshold) {
				el.classList.add("stale");
			} else {
				el.classList.remove("stale");
			}
		}
	},

	scheduleTimestampRefresh: function() {
		if (this.timestampIntervalId) return; // already running
		this.timestampIntervalId = setInterval(() => {
			this.updateTimestamp();
		}, 60000); // refresh every minute
	},

	getDom: function() {
		const wrapper = document.createElement("div");
		wrapper.className = "temperature-radar-wrapper";

		if (!this.loaded) {
			wrapper.textContent = "Loading...";
			return wrapper;
		}

		const chartDiv = document.createElement("div");
		chartDiv.id = "temperature-radar-chart-" + this.identifier;
		chartDiv.style.width = typeof this.config.width === "number" ? this.config.width + "px" : this.config.width;
		chartDiv.style.height = typeof this.config.height === "number" ? this.config.height + "px" : this.config.height;
		wrapper.appendChild(chartDiv);

		if (this.config.showLastUpdated) {
			const updatedDiv = document.createElement("div");
			updatedDiv.id = "temperature-radar-updated-" + this.identifier;
			updatedDiv.className = "temperature-radar-updated";
			if (this.lastUpdated) {
				updatedDiv.textContent = "Updated " + this.formatTimeSince(this.lastUpdated);
			}
			wrapper.appendChild(updatedDiv);
		}

		// Create chart after a short delay to ensure DOM is ready.
		// Clear any pending timer to prevent stacked chart-creation calls.
		if (this.temperatures.length > 0) {
			Log.info("Creating chart with data:", this.temperatures);
			if (this.chartTimer) {
				clearTimeout(this.chartTimer);
			}
			this.chartTimer = setTimeout(() => {
				this.chartTimer = null;
				this.createChart();
			}, 500);
		}

		return wrapper;
	},

	getStyles: function () {
		return ["MMM-TemperatureRadar.css"];
	},

	getScripts: function () {
		return [
			"https://cdn.amcharts.com/lib/5/index.js",
			"https://cdn.amcharts.com/lib/5/xy.js",
			"https://cdn.amcharts.com/lib/5/radar.js",
			"https://cdn.amcharts.com/lib/5/themes/Animated.js"
		];
	},

	scheduleUpdate: function () {
		// Clear any existing interval
		if (this.updateIntervalId) {
			clearInterval(this.updateIntervalId);
		}

		// Always send GET_TEMPERATURES — the node helper handles the no-HA fallback,
		// ensuring demo-mode also gets periodic refreshes.
		this.updateIntervalId = setInterval(() => {
			this.sendSocketNotification("GET_TEMPERATURES", {
				haUrl: this.config.haUrl,
				haToken: this.config.haToken,
				entities: this.config.entities
			});
			if (this.config.humidityEntities.length > 0) {
				this.sendSocketNotification("GET_HUMIDITY", {
					haUrl: this.config.haUrl,
					haToken: this.config.haToken,
					entities: this.config.humidityEntities
				});
			}
		}, this.config.updateInterval);
	},

	// Returns a hex color string for a temperature value (in display units).
	// Blue (cold) → cyan → green (comfortable) → yellow → red (hot).
	getTemperatureColor: function(temp) {
		// Normalize to Celsius range for color mapping regardless of display unit
		var celsius = temp;
		if (this.config.units === "fahrenheit") {
			celsius = (temp - 32) * 5 / 9;
		}
		// Clamp to 0–40°C range, map to 0–1
		var t = Math.max(0, Math.min(40, celsius)) / 40;

		// Color stops: 0=blue, 0.25=cyan, 0.5=green, 0.75=yellow, 1=red
		var r, g, b;
		if (t < 0.25) {
			var p = t / 0.25;
			r = 0;   g = Math.round(180 * p); b = Math.round(255 * (1 - p * 0.3));
		} else if (t < 0.5) {
			var p = (t - 0.25) / 0.25;
			r = 0;   g = Math.round(180 + 75 * p); b = Math.round(178 * (1 - p));
		} else if (t < 0.75) {
			var p = (t - 0.5) / 0.25;
			r = Math.round(255 * p); g = 255; b = 0;
		} else {
			var p = (t - 0.75) / 0.25;
			r = 255; g = Math.round(255 * (1 - p)); b = 0;
		}
		return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
	},

	convertTemperature: function(temp, fromUnit, toUnit) {
		if (!fromUnit || !toUnit) return temp;
		if (fromUnit === toUnit) return temp;
		if (fromUnit === "°C" && toUnit === "°F") return (temp * 9/5) + 32;
		if (fromUnit === "°F" && toUnit === "°C") return (temp - 32) * 5/9;
		return temp;
	},

	getConvertedData: function() {
		const toUnit = this.config.units === "fahrenheit" ? "°F" : "°C";
		const unitSuffix = this.config.units === "fahrenheit" ? "°F" : "°C";
		this.roomLabelMap = {};
		return this.temperatures.map(temp => {
			var converted = this.convertTemperature(
				temp.temperature,
				temp.unit_of_measurement,
				toUnit
			);
			var label = temp.room;
			if (this.config.showValues) {
				var valueStr = Math.round(converted * 10) / 10 + unitSuffix;
				if (this.config.showTrends && this.previousTemperatures[temp.room] !== undefined) {
					var prev = this.previousTemperatures[temp.room];
					var prevConverted = this.convertTemperature(prev, temp.unit_of_measurement, toUnit);
					var diff = converted - prevConverted;
					if (diff > 0.1) valueStr += " ▲";
					else if (diff < -0.1) valueStr += " ▼";
				}
				label += "\n" + valueStr;
			}
			this.roomLabelMap[temp.room] = label;
			return {
				...temp,
				room: label,
				temperature: converted,
				color: this.getTemperatureColor(converted)
			};
		});
	},

	createChart: function () {
		am5.ready(() => {
			// Dispose of previous chart if it exists
			if (this.root) {
				this.root.dispose();
			}

			// Create root element using the instance-unique chart ID
			this.root = am5.Root.new("temperature-radar-chart-" + this.identifier);
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
			const xRenderer = am5radar.AxisRendererCircular.new(this.root, {
				minGridDistance: 0
			});
			xRenderer.grid.template.setAll({
				stroke: am5.color(0xffffff),
				strokeOpacity: 0.5,
				strokeWidth: 1,
			});

			xRenderer.labels.template.setAll({
				fill: am5.color(0xffffff),
				fontSize: "0.8em",
				radius: 10,
			});

			this.xAxis = this.chart.xAxes.push(
				am5xy.CategoryAxis.new(this.root, {
					maxDeviation: 0,
					categoryField: "room",
					renderer: xRenderer,
					tooltip: am5.Tooltip.new(this.root, {})
				})
			);

			// Create Y axes and their renderers
			const yRenderer = am5radar.AxisRendererRadial.new(this.root, {
				minGridDistance: 20,
			});

			yRenderer.grid.template.setAll({
				stroke: am5.color(0xffffff),
				strokeOpacity: 0.5,
				strokeWidth: 1,
			});

			yRenderer.labels.template.setAll({
				fill: am5.color(0xffffff),
				fontSize: "0.6em",
			});

			var yAxisConfig = {
				renderer: yRenderer,
				numberFormat: this.config.units === "fahrenheit" ? "#'°F'" : "#'°C'",
			};
			if (this.config.minValue !== null) yAxisConfig.min = this.config.minValue;
			if (this.config.maxValue !== null) yAxisConfig.max = this.config.maxValue;
			if (this.config.minValue !== null || this.config.maxValue !== null) yAxisConfig.strictMinMax = true;
			this.chart.yAxes.push(
				am5xy.ValueAxis.new(this.root, yAxisConfig)
			);

			// Create series
			var chartColor = this.config.chartColor;
			this.series = this.chart.series.push(
				am5radar.RadarLineSeries.new(this.root, {
					name: "Temperature",
					xAxis: this.xAxis,
					yAxis: this.chart.yAxes.getIndex(0),
					valueYField: "temperature",
					categoryXField: "room",
					stroke: am5.color(chartColor),
					tooltip: am5.Tooltip.new(this.root, {
						labelText: "{valueY}" + (this.config.units === "fahrenheit" ? "°F" : "°C")
					})
				})
			);

			// Style series
			this.series.strokes.template.setAll({
				strokeWidth: 2,
				stroke: am5.color(chartColor),
				strokeOpacity: 0.8
			});

			this.series.fills.template.setAll({
				visible: true,
				fillOpacity: 0.2,
				fill: am5.color(chartColor)
			});

			// Add bullets only when they convey information (thresholds or colored mode)
			var hasThresholds = this.config.thresholdLow !== null || this.config.thresholdHigh !== null;
			if (hasThresholds || this.config.coloredBullets) {
				var self = this;
				this.series.bullets.push(function(root, series, dataItem) {
					var temp = dataItem.dataContext.temperature;
					var outOfRange = false;
					if (self.config.thresholdLow !== null && temp < self.config.thresholdLow) outOfRange = true;
					if (self.config.thresholdHigh !== null && temp > self.config.thresholdHigh) outOfRange = true;
					var color = outOfRange ? self.config.thresholdColor :
						(self.config.coloredBullets && dataItem.dataContext.color) || chartColor;
					return am5.Bullet.new(root, {
						sprite: am5.Circle.new(root, {
							radius: outOfRange ? 7 : 4,
							fill: am5.color(color)
						})
					});
				});
			}

			// Create humidity series if configured
			if (this.config.humidityEntities.length > 0 || this.humidityData.length > 0) {
				var humidityColor = this.config.humidityColor;

				// Separate Y axis for humidity (0-100% scale), hidden labels to avoid clutter
				var humidityYRenderer = am5radar.AxisRendererRadial.new(this.root, {
					minGridDistance: 20,
				});
				humidityYRenderer.grid.template.setAll({ visible: false });
				humidityYRenderer.labels.template.setAll({ visible: false });

				this.chart.yAxes.push(
					am5xy.ValueAxis.new(this.root, {
						renderer: humidityYRenderer,
						min: 0,
						max: 100,
						strictMinMax: true,
					})
				);

				this.humiditySeries = this.chart.series.push(
					am5radar.RadarLineSeries.new(this.root, {
						name: "Humidity",
						xAxis: this.xAxis,
						yAxis: this.chart.yAxes.getIndex(1),
						valueYField: "humidity",
						categoryXField: "room",
						stroke: am5.color(humidityColor),
						tooltip: am5.Tooltip.new(this.root, {
							labelText: "{valueY}%"
						})
					})
				);

				this.humiditySeries.strokes.template.setAll({
					strokeWidth: 2,
					stroke: am5.color(humidityColor),
					strokeOpacity: 0.8,
					strokeDasharray: [4, 4]
				});

				this.humiditySeries.fills.template.setAll({
					visible: false
				});
			}

			// Set data
			var convertedTemperatures = this.getConvertedData();
			this.xAxis.data.setAll(convertedTemperatures);
			this.series.data.setAll(convertedTemperatures);

			if (this.humiditySeries && this.humidityData.length > 0) {
				this.humiditySeries.data.setAll(this.getConvertedHumidityData());
			}

			// Animate chart and series in
			this.series.appear(1000);
			if (this.humiditySeries) this.humiditySeries.appear(1000);
			this.chart.appear(1000, 100);

			// Animate chart rotation via startAngle
			if (this.config.rotateChart) {
				var chart = this.chart;
				var speed = this.config.rotateSpeed;
				var startTime = Date.now();
				this.root.events.on("frameended", function() {
					var elapsed = (Date.now() - startTime) / 1000;
					var angle = (elapsed / speed) * 360 % 360;
					chart.set("startAngle", 270 + angle);
					chart.set("endAngle", 270 + angle + 360);
				});
			}
		});
	}
});
