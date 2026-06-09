# Occupancy Sensor API Specification

## Required Endpoints

### `GET /{building}/{floor}/sensors`

Returns all sensor names on a given floor in a given building.

#### Response — `200 OK`

```json
{
  "building": "Al-Midra Tower",
  "floor": 3,
  "sensors": [
    "Sensor1",
    "Sensor2",
    "Sensor3"
  ]
}
```

BusinessLine
AdminGeneral
AdminArea
Department
Division

#### Error responses
| HTTP status | `error` value | Meaning |
|-------------|---------------|---------|
| `404` | `"floor_not_found"` | No floor with that number exists in the specified building |
| `404` | `"building_not_found"` | No building with that name exists |

```json
{ "error": "floor_not_found", "message": "Floor 3 not found in Al-Midra Tower." }
```

---

### `GET /{building}/{floor}/{sensor_name}`

Returns the layout and occupancy data for a specific sensor over a given time window.

#### Query parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `start` | string (ISO 8601) | Yes | Start of the time window, e.g. `2025-01-01T08:00:00Z` |
| `end` | string (ISO 8601) | Yes | End of the time window, e.g. `2025-01-31T18:00:00Z` |

#### Response — `200 OK`

```json
{
  "sensor_name": "Sensor1",
  "bounding_box": {
    "x1": 400,
    "y1": 180,
    "x2": 520,
    "y2": 300
  },
  "seats": [
    {
      "seat_id": "Sensor1-001",
      "x": 412,
      "y": 208,
      "assigned": true,
      "organization_code": "1231322",
      "organization_name": "Finance",
      "business_line": "Upstream",
      "admin_area": "Dhahran",
      "department": "Reservoir Engineering",
      "division": "Well Performance",
      "occupancy_rate": 0.74
    },
    {
      "seat_id": "Sensor1-002",
      "x": 445,
      "y": 208,
      "assigned": false,
      "organization_code": null,
      "organization_name": null,
      "business_line": null,
      "admin_area": null,
      "department": null,
      "division": null,
      "occupancy_rate": 0.12
    }
  ]
}
```

#### Response fields

**Top-level**

| Field | Type | Description |
|-------|------|-------------|
| `sensor_name` | string | Echo of the requested sensor name |
| `bounding_box` | object | Pixel coordinates of the top-left (`x1`, `y1`) and bottom-right (`x2`, `y2`) corners of the area covered by this sensor |
| `seats` | array | All seats within this sensor's coverage area.  |

**`bounding_box` object**

| Field | Type | Description |
|-------|------|-------------|
| `x1` | integer | Pixel X of the top-left corner |
| `y1` | integer | Pixel Y of the top-left corner |
| `x2` | integer | Pixel X of the bottom-right corner |
| `y2` | integer | Pixel Y of the bottom-right corner |

**Seat object**

| Field | Type | Description |
|-------|------|-------------|
| `seat_id` | string | Stable unique identifier for the seat |
| `x` | integer | Pixel X of the seat's centre point, where top-left corner of the sensor's coverage area is (0, 0) |
| `y` | integer | Pixel Y of the seat's centre point, where top-left corner of the sensor's coverage area is (0, 0) |
| `assigned` | boolean | `true` if this seat is assigned to an organization, `false` otherwise |
| `organization_code` | string \| null | Code for the occupying organization. `null` if `assigned` is `false` |
| `organization_name` | string \| null | Full name of the occupying organization. `null` if `assigned` is `false` |
| `business_line` | string \| null | Business line of the occupying organization. `null` if `assigned` is `false` |
| `admin_area` | string \| null | Admin area. `null` if `assigned` is `false` |
| `department` | string \| null | Department name. `null` if `assigned` is `false` |
| `division` | string \| null | Division name. `null` if `assigned` is `false` |
| `occupancy_rate` | float | Fraction of time this seat was occupied during the requested window (`0.0`–`1.0`). Returned regardless of assignment status. |

#### Error responses

| HTTP status | `error` value | Meaning |
|-------------|---------------|---------|
| `404` | `"sensor_not_found"` | No sensor with that name exists on the specified building and floor |

```json
{ "error": "sensor_not_found", "message": "No sensor named 'Sensor1' found on floor 3 of Al-Midra Tower." }
```
