import { useState, useEffect, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet';

import { MIN_WIDTH_METERS, MAX_WIDTH_METERS, DEFAULT_CENTER } from '../../assets/map_vars.jsx';
import LocationSearch from './LocationSearch.jsx';
import './MapStage.css';

function metersPerPixel(lat, zoom) {return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;}

function formatMeters(value) {return `${Math.round(value)} m`;}

function MapViewportSync({ center, flyToRef }) {
  const map = useMap();
  const prevCenter = useRef(null);

  useEffect(() => {
    if (
      prevCenter.current &&
      prevCenter.current[0] === center[0] &&
      prevCenter.current[1] === center[1]
    ) return;
    prevCenter.current = center;
    if (!flyToRef.current) return;
    flyToRef.current = false;
    map.flyTo(center, map.getZoom(), { animate: true, duration: 0.8 });
  }, [center, map, flyToRef]);

  return null;
}

function PositioningOverlay({ floorplan, scaleMeters, opacity, rotation, zoom }) {
  const widthPx = scaleMeters / metersPerPixel(floorplan.lat, zoom);
  const heightPx = widthPx / floorplan.aspectRatio;

  return (
    <div
      className="floorplan-overlay"
      style={{
        width: `${widthPx}px`,
        height: `${heightPx}px`,
        opacity,
        transform: `rotate(${rotation}deg)`,
      }}
    >
      <img src={floorplan.url} alt={floorplan.fileName} draggable="false" />
      <div className="floorplan-overlay__grid" />
    </div>
  );
}


function MapTracker({ onZoomChange, onMoveEnd }) {
  const map = useMap();
  useMapEvents({
    zoomend: () => onZoomChange(map.getZoom()),
    moveend: () => {
      const { lat, lng } = map.getCenter();
      onMoveEnd([lat, lng]);
    },
  });
  return null;
}

function MapStatus({ fileName, scaleMeters, mapLocation }) {
  return (
    <div className="map-status">
      <div>
        <div className="map-status__label">Scale</div>
        <div className="map-status__value">{formatMeters(scaleMeters)}</div>
      </div>
      <div>
        <div className="map-status__label">Latitude</div>
        <div className="map-status__value">{mapLocation[0].toFixed(6)}</div>
      </div>
      <div>
        <div className="map-status__label">Longitude</div>
        <div className="map-status__value">{mapLocation[1].toFixed(6)}</div>
      </div>
    </div>
  );
}


function ProcessingModal() {
  return (
    <div className="processing-modal">
      <div className="processing-modal__card">
        <div className="processing-modal__spinner" />
        <div className="processing-modal__title">Processing…</div>
        <div className="processing-modal__sub">Saving map position. If this is a new floorplan, wall detection may take a moment.</div>
      </div>
    </div>
  );
}

function MapStage({floorplan, floorData: initialFloorData, onBack, onNext, isLastStep}) {
  const ms = floorplan?.map_status;

  const [zoom, setZoom] = useState(18);
  const [rotation, setRotation] = useState(ms?.rotation ?? 0);
  const [opacity, setOpacity] = useState(0.84);
  const [scaleMeters, setScaleMeters] = useState(ms?.scaleMeters ?? 78);
  const [mapLocation, setMapLocation] = useState(
    ms?.lat != null && ms?.lng != null ? [ms.lat, ms.lng] : DEFAULT_CENTER
  );
  const [processing, setProcessing] = useState(false);
  const [floorData, setFloorData] = useState(initialFloorData ?? null);
  const [confirmed, setConfirmed] = useState(!!initialFloorData);
  const flyToRef = useRef(false);

  useEffect(() => {
    if (initialFloorData) return;
    if (!floorplan?.stored_name) return;
    const stem = floorplan.stored_name.replace(/\.[^.]+$/, '');
    fetch(`/api/floors/${encodeURIComponent(stem)}/boundary`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data) setFloorData(data); })
      .catch(() => {});
  }, [floorplan?.stored_name, initialFloorData]);

  const handleLocationSelect = ({ display_name, lat, lng }) => {
    flyToRef.current = true;
    setMapLocation([lat, lng]);
  };

  async function onConfirm() {
    setProcessing(true);
    const [lat, lng] = mapLocation;
    const body = { stored_name: floorplan.stored_name, scaleMeters, rotation, lat, lng };

    try {
      const response = await fetch('/api/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      setFloorData(data);
      setConfirmed(true);
    } finally {
      setProcessing(false);
    }
  }

  return (
    <section className="map-stage">
      {processing && <ProcessingModal />}
      <div className="map-stage__header">
        <div>
          <span className="eyebrow">World positioning</span>
          <p>
            Pan and zoom the map to align the building footprint. Use the controls to adjust scale and rotation.
          </p>
        </div>
        <div className="map-stage__header-actions">
          <button className="button button--ghost" type="button" onClick={onBack}>
            Back
          </button>
          <button className="button button--secondary" type="button" onClick={onConfirm} disabled={processing}>
            {processing ? 'Processing…' : 'Confirm'}
          </button>
          <button className="button" type="button" onClick={() => onNext(floorData)} disabled={!confirmed || processing}>
            {isLastStep ? 'Finish' : 'Next →'}
          </button>
        </div>
      </div>

      <div className="map-stage__toolbar">
        <LocationSearch onSelect={handleLocationSelect} />
        <MapStatus fileName={floorplan.fileName} scaleMeters={scaleMeters} mapLocation={mapLocation} />
      </div>

      <div className="map-shell">
        <div className="map-shell__map-wrap">
          <MapContainer center={mapLocation} zoom={18} scrollWheelZoom className="map-shell__map">
            <MapViewportSync center={mapLocation} flyToRef={flyToRef} />
            <MapTracker onZoomChange={setZoom} onMoveEnd={setMapLocation} />
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
          </MapContainer>
          <div className="map-shell__overlay-anchor">
            <PositioningOverlay
              floorplan={floorplan}
              scaleMeters={scaleMeters}
              opacity={opacity}
              rotation={rotation}
              zoom={zoom}
            />
          </div>
        </div>

        <aside className="map-shell__panel">
          <div className="panel-card">
            <div className="panel-card__title">Placement controls</div>
            <div className="control-group">
              <label htmlFor="scale">Scale</label>
              <input
                id="scale"
                type="range"
                min={MIN_WIDTH_METERS}
                max={MAX_WIDTH_METERS}
                value={scaleMeters}
                onChange={(event) => setScaleMeters(Number(event.target.value))}
              />
              <div className="control-group__meta">{formatMeters(scaleMeters)} wide</div>
            </div>

            <div className="control-group">
              <label htmlFor="rotation">Rotation</label>
              <input
                id="rotation"
                type="range"
                min="-90"
                max="90"
                value={rotation}
                onChange={(event) => setRotation(Number(event.target.value))}
              />
              <div className="control-group__meta">{rotation}°</div>
            </div>

            <div className="control-group">
              <label htmlFor="opacity">Opacity</label>
              <input
                id="opacity"
                type="range"
                min="0.2"
                max="1"
                step="0.01"
                value={opacity}
                onChange={(event) => setOpacity(Number(event.target.value))}
              />
              <div className="control-group__meta">{Math.round(opacity * 100)}%</div>
            </div>
          </div>

        </aside>
      </div>
    </section>
  );
}

export default MapStage;
