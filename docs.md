# RasmView — Technical Documentation

## Table of Contents

1. [Architecture overview](#1-architecture-overview)
2. [Repository layout](#2-repository-layout)
3. [Backend — editor-be](#3-backend--editor-be)
4. [AI pipeline — floor_ingestion](#4-ai-pipeline--floor_ingestion)
5. [Frontend — editor-fe](#5-frontend--editor-fe)
6. [Konva canvas module](#6-konva-canvas-module)
7. [Data model — boundary JSON](#7-data-model--boundary-json)
8. [API reference](#8-api-reference)
9. [Docker setup](#9-docker-setup)
10. [Environment variables](#10-environment-variables)

---

## 1. Architecture overview

```
Browser (React/Vite)
        │  HTTP (port 3000 in dev / port 80 via Nginx in Docker)
        │  /api/* and /uploads/* proxied to backend
        ▼
Flask backend (Python, port 5001)
        │  imports directly as a Python package
        ▼
floor_ingestion  (YOLO + OpenCV + Shapely)
        │  reads model weights from disk
        ▼
YOLO model weights  (best.pt — trained on CubiCasa5K)
```

The frontend never calls YOLO directly. All AI inference goes through Flask HTTP endpoints. Detection results are written as JSON files on the server alongside the uploaded image. The frontend reads those files through subsequent API calls.

---

## 2. Repository layout

```
AI_engine_POC/
├── docker-compose.yml          One-command startup
├── .dockerignore
├── README.md
├── docs.md                     (this file)
│
├── editor-be/                  Flask API server
│   ├── app.py                  App factory — registers all blueprints
│   ├── api/
│   │   ├── upload.py           File upload and signed-URL serving
│   │   ├── process.py          YOLO detection trigger
│   │   ├── floors.py           Floor CRUD, boundary read/write/reset
│   │   ├── rooms.py            Room detection and save
│   │   ├── objects.py          Template management and object detection
│   │   ├── geocode.py          Nominatim reverse geocode proxy
│   │   └── signed_url.py       HMAC token generation/verification
│   ├── uploads/                Runtime: uploaded images + results per floor
│   └── templates/              Runtime: object template images
│
├── floor_ingestion/            AI package (no web server)
│   ├── __init__.py             Exports: process_floorplan, detect_objects, detect_rooms_from_walls
│   └── detector/
│       ├── main.py             process_floorplan() — full wall/room pipeline
│       ├── detectors.py        YOLO inference + floor boundary detection (OpenCV)
│       ├── object_detector.py  Template-matching object detection (OpenCV)
│       ├── room_detector.py    detect_rooms_from_walls()
│       └── yolo/
│           └── runs/
│               └── cubicasa_yolo26m/weights/best.pt   Trained weights
│
└── editor-fe/                  React frontend
    ├── src/
    │   ├── App.jsx             Top-level state machine and step router
    │   ├── components/         One folder per workflow step
    │   │   ├── Home/           Upload / floor selection
    │   │   ├── MapStage/       Leaflet world-positioning map
    │   │   ├── WallEditor/     Wall review + editing UI
    │   │   ├── DoorEditor/     Door placement UI
    │   │   ├── RoomEditor/     Room detection + labelling UI
    │   │   ├── ObjectEditor/   Template upload + object detection UI
    │   │   └── CompletionPage/ Final summary
    │   └── konva/              All Konva canvas logic (see §6)
    ├── vite.config.js
    └── .env                    VITE_LAST_STEP
```

---

## 3. Backend — editor-be

### Flask application

`app.py` creates a standard Flask app, sets the max upload size to 40 MB, enables CORS globally, and registers six blueprints. Each blueprint maps to one file in `api/`.

### Signed URLs

Uploaded images are served through `/api/uploads/<path>` with time-limited HMAC tokens. `signed_url.py` generates tokens using the `UPLOAD_SECRET` environment variable and an expiry timestamp. The default TTL is one hour, configurable via `UPLOAD_TOKEN_TTL` (seconds).

Tokens are embedded in URLs as `?token=<hex>&expires=<unix>`. On every request to `/api/uploads/*`, `verify_path()` re-derives the expected HMAC and rejects mismatches or expired tokens with 403.

### Upload directory layout

```
uploads/
└── <floor-stem>/               Named after the uploaded file without extension
    ├── <original-image>.(png|jpg|…)
    ├── <stem>_boundary.json    Detection output + manual edits
    ├── <stem>_boundary_original.json  Copy made before the first manual edit
    ├── <stem>_map_status.json  World positioning data (lat/lng/scale/rotation)
    └── <stem>_objects.json     Detected and/or manually placed objects
```

---

## 4. AI pipeline — floor_ingestion

### process_floorplan()

Called by `POST /api/process`. Accepts an image path, YOLO weights path, and output directory. Internally:

1. Runs YOLO inference to detect wall segments and room bounding boxes.
2. Applies OpenCV post-processing: deduplication of overlapping walls, endpoint snapping, dangling wall pruning, triangle collapsing, shared-wall merging.
3. Detects the floor boundary (outer contour via OpenCV).
4. Detects enclosed spaces from the cleaned wall graph using `tag_and_detect_enclosed_spaces`.
5. Writes `<stem>_boundary.json` — the full structured result including walls, rooms, and boundary polygon.

### detect_rooms_from_walls()

Called by `POST /api/floors/<name>/rooms/detect`. Takes the wall segments already saved in `boundary.json` and re-runs the room detection algorithm without re-running YOLO. Used when the user edits walls manually and then requests room re-detection.

### detect_objects()

Called by `POST /api/floors/<name>/objects/detect`. Runs OpenCV template matching (multi-scale) for each object class directory found under `templates/`. Applies NMS with a configurable IoU threshold. Returns a dict keyed by object class name, each containing a list of detected bounding boxes in image-space coordinates.

### YOLO model

The model is a YOLO26m variant trained on CubiCasa5K floor plan data. Weights are at `floor_ingestion/detector/yolo/runs/cubicasa_yolo26m/weights/best.pt`. The model detects walls and room outlines as bounding boxes; post-processing converts these to the structured segment/polygon JSON.

---

## 5. Frontend — editor-fe

### Technology

| Library | Role |
|---|---|
| React 18 | UI framework |
| Vite 5 | Build tool and dev server |
| Konva / react-konva | Canvas rendering (see §6) |
| Leaflet / react-leaflet | Interactive map in World Positioning step |
| use-image | Hook for async image loading into Konva |

### App.jsx — step state machine

`App` is a flat state machine driven by a `stage` string. Possible values: `upload`, `map`, `editor`, `doors`, `rooms`, `objects`, `done`.

The `VITE_LAST_STEP` env variable (1–5) controls which step is the final one, showing "Finish" instead of "Next" and skipping to `done` immediately after. This allows deploying the app with fewer steps for simpler use cases.

`floorplan` state holds the metadata of the currently selected floor plan (URL, stored name, aspect ratio). `floorData` holds the latest `boundary.json` content received from the server — it flows forward through each step and is mutated by user edits.

The roadmap header renders completed steps as clickable, allowing backwards navigation without data loss.

### Home component

Handles two paths:

- **Upload new**: drag-and-drop or file picker sends a `multipart/form-data` POST to `/api/upload`. On success the signed image URL and `stored_name` are stored in `floorplan` state and the step advances to `map`.
- **Select existing**: calls `GET /api/floors` to list floors that already have a `boundary.json`. Selecting one loads its data and jumps directly to the `map` step.

### MapStage component

Wraps a Leaflet map. The user searches for a location (proxied through `/api/geocode` to Nominatim), places the floor plan image as a draggable/rotatable Leaflet overlay, and adjusts a scale bar. On "Next", the lat/lng, scale (meters per pixel), and rotation are POSTed to `/api/process` which triggers YOLO detection (or returns cached results if detection already ran).

### WallEditor component

Renders the floor plan image inside `KonvaStage` and overlays the wall segments as Konva `Line` objects. The editor mode is controlled by a toolbar and can be one of:

- `pan` — drag to pan, scroll to zoom
- `draw` — click-drag to draw new wall segments
- `select` — click to select a wall, drag an endpoint handle to move it
- `connect` — click one wall endpoint then another to create a topological connection
- `merge` — click two overlapping walls to merge them into one
- `split` — click on a wall to insert a midpoint, splitting it into two

Changes are saved to the server via `POST /api/floors/<name>/boundary` after each edit action (or explicitly via the Save button).

### DoorEditor component

Similar canvas setup. Click on any wall to begin a door, drag to define its length along the wall, release to place. The snap-to-wall logic projects the cursor onto the nearest wall segment and snaps placement to that line.

### RoomEditor component

Shows the floor plan with room polygons drawn as filled Konva shapes. "Detect Rooms" calls `POST /api/floors/<name>/rooms/detect` which re-runs the room algorithm from current walls. Rooms can be renamed inline. Room polygons are read-only in this step.

### ObjectEditor component

Two panels:

1. **Templates** — list of object classes with template images uploaded via `POST /api/objects/templates/<name>`. Users can add/delete classes and upload multiple reference images per class.
2. **Detections** — runs `POST /api/floors/<floor>/objects/detect` and displays bounding boxes on the floor plan canvas as Konva `Rect` shapes. Detections can be toggled per class and saved.

---

## 6. Konva canvas module

The `src/konva/` directory is a self-contained canvas subsystem. Nothing outside it manipulates Konva directly.

```
konva/
├── index.js                    Re-exports the public API
├── utils.js                    containFit() — letterbox layout math
├── stage/
│   ├── KonvaStage.jsx          Generic Stage with pan + zoom
│   └── useContainerSize.js     ResizeObserver hook for canvas dimensions
├── core/
│   ├── useShapeStore.js        Generic shape state + undo/redo
│   └── useConnectionStore.js   Wall-domain extension with topology
├── walls/
│   ├── WallCanvas.jsx          Wall rendering + interaction
│   ├── WallLayer.jsx           Konva Layer wrapping wall shapes + handles
│   ├── wallUtils.js            makeLine()
│   └── wallSerializers.js      wallsToShapes() / shapesToWalls()
├── doors/
│   ├── DoorCanvas.jsx
│   ├── DoorLayer.jsx
│   ├── doorUtils.js            makeDoor(), snapToWall(), closestPointOnSegment()
│   ├── doorSerializers.js      doorsToCanvas() / canvasToDoors()
│   └── useDoorStore.js
└── rooms/
    ├── RoomCanvas.jsx
    ├── RoomLayer.jsx
    ├── roomUtils.js
    ├── roomSerializers.js      roomsToCanvas() / canvasToRooms()
    └── useRoomStore.js
```

### KonvaStage

`KonvaStage` is the single `<Stage>` used by every editor step. It manages:

- **Scroll-to-zoom**: cursor-anchored — the point under the cursor stays fixed while the scale changes. Zoom range is 0.25×–10× in 8% steps per wheel tick.
- **Pan mode**: when `mode === 'pan'`, the stage is `draggable`. All other modes disable dragging so clicks register on shapes.
- **Two layers**: an image layer (`listening={false}` — never receives pointer events) and an interactive layer for shapes. This separation prevents the background image from capturing clicks meant for shapes.
- **`passThroughClick`**: when true, click events fire even when the target is a child shape rather than the bare stage. Used in door placement where clicks on wall shapes need to trigger door creation.

The stage exposes `onStageClick`, `onStageMouseMove`, `onStageMouseDown`, `onStageMouseUp` callbacks, all called with `contentPos` — the click position transformed back into content-space coordinates (accounting for the current pan offset and zoom scale).

### containFit

`utils.js` exports `containFit(imgW, imgH, canvasW, canvasH)` which computes the letterboxed layout for an image rendered with `object-fit: contain`. Returns `{ offsetX, offsetY, fitW, fitH, scale }`. This is the single source of truth for coordinate conversion between image-space (pixels in the original uploaded image) and canvas-space (pixels on screen). Every serializer uses it.

### useShapeStore

A generic React state store built on `useReducer`. Manages:

- `shapes[]` — array of plain shape objects: `{ id, type, points[], stroke, strokeWidth }`
- `selectedId` — currently selected shape
- `mode` — current editor mode string
- Full undo/redo history via a past/present/future stack

The `UNDOABLE` set lists which action types push the current state onto `past`. Mode changes and selections are not undoable.

Exposed actions: `addShape`, `updateShape`, `deleteShape`, `select`, `deselect`, `moveShape`, `loadShapes`, `clearAll`, `undo`, `redo`, `setMode`.

### useConnectionStore

Extends `useShapeStore` with a topological connection graph for walls. Built on a combined reducer that manages both the shape slice and a connection slice in a single unified undo history — a single Ctrl+Z undoes both the shape mutation and its corresponding connection change atomically.

Additional state: `connections[]` — each connection links two wall endpoints: `{ id, lineId, endIdx, lineId2, endIdx2 }` where `endIdx` is 0 (start) or 1 (end).

Additional actions:

| Action | Effect |
|---|---|
| `moveEndpoint(lineId, endIdx, x, y)` | Moves one endpoint and propagates the new position to all transitively connected endpoints (BFS over the connection graph). Undoable. |
| `moveEndpointLive(…)` | Same but not undoable — used during mouse-drag for smooth preview; `moveEndpoint` is called on mouse-up to commit. |
| `moveLine(lineId, dx, dy)` | Translates an entire wall segment. Snaps all connected endpoints of adjacent walls to follow. |
| `splitLine(lineId, x, y)` | Removes one wall, inserts two new walls joined at `(x, y)`, and remaps all connections from the original to the two halves. |
| `mergeWalls(keepId, removeId)` | Removes one wall, remaps its connections to the nearest endpoints of the kept wall, deduplicates the resulting connection list. |
| `addConnection / disconnectLine / disconnectEndpoint` | Direct connection graph edits. |

### Serializers

Each domain (walls, doors, rooms) has a pair of functions:

- **`xToCanvas()`** — converts API JSON (image-space coords) to canvas-space Konva objects. Applies `containFit` to map image pixels to screen pixels.
- **`canvasToX()`** — the inverse: converts canvas-space Konva objects back to image-space for saving to the server.

All coordinate math goes through these two functions and `containFit`. No other code in the frontend knows about pixel scaling.

### Door snapping

`doorUtils.js` provides `snapToWall(px, py, walls, snapRadius)` which finds the closest point on any wall segment within `snapRadius` canvas pixels. Uses `closestPointOnSegment` — a standard parametric line projection `t = dot(AP, AB) / dot(AB, AB)` clamped to [0, 1]. The returned `{ wallId, x, y }` is used to lock door placement to the exact wall geometry.

---

## 7. Data model — boundary JSON

`<stem>_boundary.json` is the central data file for each floor. It is written by YOLO detection and read/written by every subsequent editing step.

```jsonc
{
  "image": {
    "width": 1200,      // original image dimensions in pixels
    "height": 900
  },
  "boundary": [         // outer floor polygon — image-space [x, y] pairs
    [10, 10], [1190, 10], [1190, 890], [10, 890]
  ],
  "elements": {
    "walls": [
      {
        "id": "abc-uuid",
        "type": "segment",        // always "segment" for user-editable walls
        "class": "Wall Internal",
        "points": [[120, 80], [340, 80]],   // image-space [x, y] pairs
        "connected_to": [
          { "id": "def-uuid", "point": [340, 80] }
        ]
      }
    ],
    "doors": [
      {
        "wall_id": "abc-uuid",
        "start": [150, 80],   // image-space
        "end":   [200, 80]
      }
    ],
    "rooms": [
      {
        "id": "room-1",
        "name": "Room 1",
        "area": 14.3,         // square meters (approximate)
        "status": "active",
        "wall_ids": ["abc-uuid", "def-uuid"],  // null for manually drawn rooms
        "polygon": [[120, 80], [340, 80], [340, 260], [120, 260]]
      }
    ]
  }
}
```

`_map_status.json` stores world positioning:

```jsonc
{
  "stored_name": "plan.png",
  "lat": 26.3927,
  "lng": 50.1233,
  "scaleMeters": 0.05,   // meters per pixel
  "rotation": 12.5        // degrees clockwise
}
```

`_objects.json` stores detection results, keyed by object class:

```jsonc
{
  "fire_extinguisher": [
    { "x": 340, "y": 120, "w": 24, "h": 24, "score": 0.87 }
  ]
}
```

---

## 8. API reference

All endpoints are on the Flask backend (default port 5001). In dev, Vite proxies `/api/*` and `/uploads/*` from port 3000 to port 5001.

### Upload

#### `POST /api/upload`
Upload a floor plan image.
- Body: `multipart/form-data`, field `file` (PNG, JPG, JPEG, WEBP, GIF, max 40 MB).
- Response: `{ "stored_name": "<uuid>.<ext>", "url": "/api/uploads/…?token=…&expires=…" }`

#### `GET /api/uploads/<path>?token=<hex>&expires=<unix>`
Serve a signed upload. Returns 403 if the token is invalid or expired.

### Processing

#### `POST /api/process`
Trigger YOLO floor plan detection (or return cached result).
- Body JSON: `{ "stored_name": "…", "lat": 0.0, "lng": 0.0, "scaleMeters": 0.05, "rotation": 0.0 }`
- If `<stem>_boundary.json` already exists, skips detection and only updates `_map_status.json`.
- Response: the `boundary.json` content.
- Requires `YOLO_WEIGHTS` and `OUTPUT_DIR` env vars.

### Floors

#### `GET /api/floors`
List all floors that have completed detection.
- Response: `{ "floors": [{ "name", "stored_name", "preview_url", "map_status" }] }`

#### `GET /api/floors/<name>/boundary`
Return the `boundary.json` for a floor.

#### `POST /api/floors/<name>/boundary`
Save updated boundary data (walls, doors, rooms) back to disk.
- Body: the full boundary JSON object.
- Automatically prunes doors whose referenced wall no longer exists.
- Clears rooms only when the `walls` array changed (door-only saves preserve rooms).
- On first save, copies the original AI result to `_boundary_original.json`.

#### `POST /api/floors/<name>/boundary/reset`
Restore the boundary to the original AI detection output.
- If no original exists, returns the current boundary unchanged.

#### `POST /api/floors/cleanup`
Delete all floor subdirectories that lack a `boundary.json` (incomplete uploads).
- Response: `{ "removed": ["name1", …] }`

#### `DELETE /api/floors/<name>`
Permanently delete a floor and all its files.

### Rooms

#### `POST /api/floors/<name>/rooms/detect`
Re-run room detection from the current wall geometry without re-running YOLO.
- Reads walls from `boundary.json`, calls `detect_rooms_from_walls()`, writes back.
- Response: `{ "rooms": […] }`

#### `POST /api/floors/<name>/rooms`
Save a manually edited rooms array.
- Body: `{ "rooms": […] }`

### Objects

#### `GET /api/objects/templates`
List all object template classes.
- Response: `{ "templates": [{ "name", "count", "files", "preview_url" }] }`

#### `POST /api/objects/templates/<name>`
Upload one or more template images for an object class.
- Body: `multipart/form-data`, field `files` (multiple files allowed).

#### `GET /api/objects/templates/<name>/<filename>`
Serve a template image.

#### `DELETE /api/objects/templates/<name>`
Delete an object class and all its template images.

#### `POST /api/floors/<floor>/objects/detect`
Run template-matching detection for all (or one) object class against the floor image.
- Body JSON (optional): `{ "threshold": 0.7, "iou_threshold": 0.4, "object_filter": "fire_extinguisher" }`
- Merges results into existing `_objects.json` (per-class replacement, other classes preserved).
- Response: detection results dict.

#### `GET /api/floors/<floor>/objects`
Return `_objects.json` for a floor (empty object `{}` if none).

#### `POST /api/floors/<floor>/objects/save`
Persist manually edited object data directly.
- Body: the full objects dict.

### Geocoding

#### `GET /api/geocode?q=<query>`
Proxy a location search to Nominatim (OpenStreetMap).
- Response: `{ "results": [{ "display_name", "lat", "lng" }] }`

---

## 9. Docker setup

Three files added at the repo root:

**`docker-compose.yml`** — defines two services:
- `backend`: builds from `editor-be/Dockerfile` with `context: .` (repo root) so both `editor-be/` and `floor_ingestion/` are available in the build context.
- `frontend`: builds from `editor-fe/Dockerfile`, depends on `backend`.
- A named volume `uploads` is mounted at `/app/editor-be/uploads` to persist data across container restarts.

**`editor-be/Dockerfile`** — Python 3.11-slim base. Installs system libraries needed by OpenCV (`libgl1`, `libglib2.0-0`, `libgomp1`). Installs Python deps. Copies `editor-be/` and `floor_ingestion/` (including YOLO weights). Sets `WORKDIR` to `editor-be/` and runs `python app.py`.

**`editor-fe/Dockerfile`** — Two-stage build. Stage 1: Node 20 Alpine, `npm ci`, `npm run build`. Stage 2: Nginx Alpine, copies the Vite dist output, uses a custom `nginx.conf`.

**`editor-fe/nginx.conf`** — Serves the React SPA with `try_files` for client-side routing. Proxies `/api/` and `/uploads/` to `http://backend:5001` (Docker service name resolution).

**`.dockerignore`** — Excludes `node_modules`, `__pycache__`, `.pyc` files, and the large `floor_ingestion/data/` training dataset directory from the build context.

---

## 10. Environment variables

| Variable | Service | Required | Default | Description |
|---|---|---|---|---|
| `OUTPUT_DIR` | backend | Yes | — | Absolute path to the uploads directory |
| `YOLO_WEIGHTS` | backend | Yes | — | Absolute path to the YOLO `.pt` weights file |
| `UPLOAD_SECRET` | backend | No | random (changes on restart) | HMAC key for signed URLs — set a stable value in production |
| `UPLOAD_TOKEN_TTL` | backend | No | `3600` | Signed URL lifetime in seconds |
| `PORT` | backend | No | `5001` | Flask listen port |
| `VITE_LAST_STEP` | frontend build | No | `5` | 1–5: which step shows "Finish" instead of "Next" |
