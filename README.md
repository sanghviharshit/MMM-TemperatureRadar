# MMM-TemperatureRadar

A MagicMirror² module that displays temperature readings from multiple rooms in a radar chart. Integrates with Home Assistant to show real-time temperature data, or can display demo data if Home Assistant is not configured.

## Screenshot
![MMM-TemperatureRadar Screenshot](screenshot.png)

## Installation

1. Navigate to your MagicMirror's `modules` directory:
```bash
cd ~/MagicMirror/modules
```
2. Clone this repository:
```bash
git clone https://github.com/sanghviharshit/MMM-TemperatureRadar.git
```

3. Install dependencies:
```bash
cd MMM-TemperatureRadar
npm install
```

## Configuration
Add the following configuration to your config/config.js file:
```javascript
{
    module: "MMM-TemperatureRadar",
    position: "top_right",
    config: {
        haUrl: "http://your-home-assistant-url:8123",
        haToken: "your_long_lived_access_token",
        width: "300px",
        height: "300px",
        updateInterval: 5 * 60 * 1000,
        units: "celsius",
        entities: [
            { room: "Living Room", entity_id: "sensor.living_room_temperature" },
            { room: "Kitchen", entity_id: "sensor.kitchen_temperature" },
            { room: "Bedroom", entity_id: "sensor.bedroom_temperature" },
        ],
        // Optional: humidity overlay (dashed line)
        humidityEntities: [
            { room: "Living Room", entity_id: "sensor.living_room_humidity" },
            { room: "Kitchen", entity_id: "sensor.kitchen_humidity" },
            { room: "Bedroom", entity_id: "sensor.bedroom_humidity" },
        ],
        // Optional: highlight rooms outside comfort range
        thresholdLow: 18,
        thresholdHigh: 26,
    }
}
```

### Configuration Options

| Option | Description | Default |
|--------|-------------|---------|
| **Data** | | |
| haUrl | Home Assistant URL. Leave empty for demo/notification mode. | `""` |
| haToken | Home Assistant long-lived access token. | `""` |
| entities | Array of `{room, entity_id}` for temperature sensors. | 6 demo entities |
| humidityEntities | Array of `{room, entity_id}` for humidity sensors. | `[]` |
| updateInterval | Data refresh interval in milliseconds. | `300000` (5 min) |
| units | `"celsius"` or `"fahrenheit"`. | `"celsius"` |
| **Display** | | |
| width | Chart width (CSS string or number). | `"200px"` |
| height | Chart height (CSS string or number). | `"200px"` |
| chartColor | Color for radar line and fill. | `"#808080"` |
| humidityColor | Color for the humidity overlay series (dashed line). | `"#4488cc"` |
| coloredBullets | Show data point circles colored by temperature (blue→green→red). Off by default for a clean look. | `false` |
| showValues | Show temperature values on axis labels. | `true` |
| showTrends | Show ▲/▼ trend indicators when temperature is changing. | `true` |
| showLastUpdated | Show "Updated X min ago" below the chart. Turns orange when stale. | `true` |
| staleThreshold | Milliseconds before data is considered stale (timestamp turns orange). | `600000` (10 min) |
| **Thresholds** | | |
| thresholdLow | Temperatures below this show highlighted bullet circles (in display units). | `null` (off) |
| thresholdHigh | Temperatures above this show highlighted bullet circles (in display units). | `null` (off) |
| thresholdColor | Color for out-of-range bullet circles. | `"#ff4444"` |
| **Axis** | | |
| minValue | Fixed Y axis minimum (null = auto-scale). | `null` |
| maxValue | Fixed Y axis maximum (null = auto-scale). | `null` |
| **Animation** | | |
| rotateChart | Slowly rotate the radar chart. | `false` |
| rotateSpeed | Seconds per full rotation. | `60` |
| **Integration** | | |
| notificationName | Notification to listen for temperature push data. | `"TEMPERATURE_UPDATE"` |
| humidityNotificationName | Notification to listen for humidity push data. | `"HUMIDITY_UPDATE"` |

### Data Sources

The module supports two ways of receiving temperature data, and both can work simultaneously:

**Home Assistant (pull)** — Configure `haUrl` and `haToken` to fetch from HA on an interval.

**Module notifications (push)** — Any other MagicMirror² module can send temperature data via the notification system. This allows integration with MQTT, Zigbee2MQTT, or any custom module without needing Home Assistant.

```javascript
// Temperature data from any module:
this.sendNotification("TEMPERATURE_UPDATE", [
    { room: "Living Room", temperature: 21.5, unit_of_measurement: "°C" },
    { room: "Bedroom", temperature: 20.1, unit_of_measurement: "°F" },
]);

// Humidity data from any module:
this.sendNotification("HUMIDITY_UPDATE", [
    { room: "Living Room", humidity: 45 },
    { room: "Bedroom", humidity: 52 },
]);
```

When no Home Assistant config is provided, the module starts with demo data and listens for push notifications. When HA is configured, it fetches on an interval but still accepts push notifications (the latest data wins).

### Home Assistant Setup
1. In Home Assistant, go to your profile
2. Scroll to the bottom and create a Long-Lived Access Token
3. Copy this token to the haToken field in your configuration
4. Make sure your entity IDs match those in your Home Assistant instance

## Updating
To update the module to the latest version:

```
cd ~/MagicMirror/modules/MMM-TemperatureRadar
git pull
npm install
```

## Contributing
If you find any bugs or would like to contribute to the module, please create an issue or submit a pull request on GitHub.

## License
This project is licensed under the MIT License - see the LICENSE file for details.
