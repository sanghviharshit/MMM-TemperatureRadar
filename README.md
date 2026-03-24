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
        updateInterval: 5 * 60 * 1000, // 5 minutes
        units: "celsius", // "celsius" or "fahrenheit"
        entities: [
            { room: "Living Room", entity_id: "sensor.living_room_temperature" },
            { room: "Kitchen", entity_id: "sensor.kitchen_temperature" },
            { room: "Bedroom", entity_id: "sensor.bedroom_temperature" },
            // Add more rooms as needed
        ]
    }
}
```

### Configuration Options

| Option | Description | 
|--------|-------------| 
| haUrl | Your Home Assistant URL. Leave empty to use demo data. | 
| haToken | Your Home Assistant long-lived access token. Required if using Home Assistant. | 
| width | Width of the chart. Default: `"200px"` |
| height | Height of the chart. Default: `"200px"` |
| updateInterval | How often to update the data (in milliseconds). Default: 300000 (5 minutes) |
| units | Temperature unit to display. `"celsius"` or `"fahrenheit"`. Default: `"celsius"` |
| entities | Array of objects containing room names and their corresponding Home Assistant entity IDs |
| chartColor | Color for the radar line, fill, and bullets. Any CSS color string. Default: `"#808080"` |
| coloredBullets | Color data point circles by temperature (blue→green→red gradient). Default: `false` |
| showValues | Show temperature values on axis labels. Default: `true` |
| showLastUpdated | Show "Updated X min ago" text below the chart. Default: `true` |
| notificationName | Notification name to listen for from other modules. Default: `"TEMPERATURE_UPDATE"` |

### Data Sources

The module supports two ways of receiving temperature data, and both can work simultaneously:

**Home Assistant (pull)** — Configure `haUrl` and `haToken` to fetch from HA on an interval.

**Module notifications (push)** — Any other MagicMirror² module can send temperature data via the notification system. This allows integration with MQTT, Zigbee2MQTT, or any custom module without needing Home Assistant.

```javascript
// Any module can push data like this:
this.sendNotification("TEMPERATURE_UPDATE", [
    { room: "Living Room", temperature: 21.5, unit_of_measurement: "°C" },
    { room: "Bedroom", temperature: 20.1, unit_of_measurement: "°F" },
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
