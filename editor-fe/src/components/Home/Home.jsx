import { useRef, useState, useEffect } from 'react';
import { DEFAULT_CENTER } from '../../assets/map_vars.jsx';
import './Home.css';

function ProcessedFloorsPicker({ setFloorplan, setFloorData, setStage }) {
  const [floors, setFloors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(null);
  const [deleting, setDeleting] = useState(null);

  useEffect(() => {
    fetch('/api/floors')
      .then((r) => r.json())
      .then((data) => setFloors(data.floors ?? []))
      .catch(() => setFloors([]))
      .finally(() => setLoading(false));
  }, []);

  async function handleOpen(floor) {
    setOpening(floor.name);
    try {
      const res = await fetch(`/api/floors/${encodeURIComponent(floor.name)}/boundary`);
      if (!res.ok) throw new Error('Boundary not found');
      const data = await res.json();

      setFloorplan({
        fileName: floor.stored_name,
        url: floor.preview_url,
        stored_name: floor.stored_name,
        aspectRatio: 1,
        lat: floor.map_status?.lat ?? DEFAULT_CENTER[0],
        map_status: floor.map_status ?? null,
      });
      setFloorData(data);
      setStage('map');
    } catch {
      // silently ignore
    } finally {
      setOpening(null);
    }
  }

  async function handleDelete(floor, e) {
    e.stopPropagation();
    if (!confirm(`Delete "${floor.name}"? This cannot be undone.`)) return;
    setDeleting(floor.name);
    try {
      await fetch(`/api/floors/${encodeURIComponent(floor.name)}`, { method: 'DELETE' });
      setFloors((prev) => prev.filter((f) => f.name !== floor.name));
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="floors-picker">
      <div className="floors-picker__header">
        <span className="eyebrow">Processed floors</span>
        <h2>Continue where you left off</h2>
        <p>Select an already-processed floor to continue editing.</p>
      </div>

      <div className="floors-picker__list">
        {loading && <div className="floors-picker__empty">Loading…</div>}
        {!loading && floors.length === 0 && (
          <div className="floors-picker__empty">No processed floors yet.</div>
        )}
        {floors.map((floor) => {
          const lat = floor.map_status?.lat;
          const lng = floor.map_status?.lng;
          const isOpening = opening === floor.name;
          const isDeleting = deleting === floor.name;
          const busy = opening !== null || deleting !== null;
          return (
            <div key={floor.name} className="floors-picker__row">
              <button
                type="button"
                className={`floors-picker__item${isOpening ? ' floors-picker__item--selected' : ''}`}
                onClick={() => handleOpen(floor)}
                disabled={busy}
              >
                <img
                  className="floors-picker__thumb"
                  src={floor.preview_url}
                  alt={floor.name}
                />
                <div className="floors-picker__meta">
                  <span className="floors-picker__name">
                    {isOpening ? 'Opening…' : floor.name}
                  </span>
                  {lat != null && lng != null && (
                    <span className="floors-picker__coords">
                      {lat.toFixed(4)}, {lng.toFixed(4)}
                    </span>
                  )}
                </div>
              </button>
              <button
                type="button"
                className="floors-picker__delete"
                onClick={(e) => handleDelete(floor, e)}
                disabled={busy}
                title="Delete floor"
              >
                {isDeleting ? '…' : '✕'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function UploadSection({ setError, setUploading, setFloorplan, setStage, uploading, error }) {
  const [floorplanName, setFloorplanName] = useState('');
  const inputRef = useRef(null);
  const canUpload = floorplanName.trim().length > 0;

  const onUpload = async (file) => {
    if (!canUpload) return;
    setError('');
    setUploading(true);

    const previewUrl = URL.createObjectURL(file);

    try {
      const payload = new FormData();
      payload.append('file', file);
      payload.append('name', floorplanName.trim());

      const response = await fetch('/api/upload', { method: 'POST', body: payload });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Upload failed.');

      setFloorplan({
        fileName: data.file_name,
        url: data.preview_url,
        stored_name: data.stored_name,
        aspectRatio: 1,
        lat: DEFAULT_CENTER[0],
      });

      setStage('map');
    } catch (uploadError) {
      setFloorplan({
        fileName: file.name,
        url: previewUrl,
        aspectRatio: 1,
        lat: DEFAULT_CENTER[0],
      });

      setStage('map');
      setError(uploadError.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="upload-section">
      <div className="upload-section__top">
        <span className="eyebrow">New floorplan</span>
        <h2>Upload a floorplan</h2>
        <p>
          Drop in a plan image, then place it on a map so the building footprint lines up with the real world.
        </p>

        <div className="control-group" style={{ marginTop: 14 }}>
          <label htmlFor="floorplan-name">Floor name</label>
          <input
            id="floorplan-name"
            type="text"
            className="text-input"
            value={floorplanName}
            onChange={(e) => setFloorplanName(e.target.value)}
            placeholder="e.g. Level 3 West Wing"
            autoFocus
          />
        </div>
      </div>

      <div
        className={`dropzone${!canUpload ? ' dropzone--disabled' : ''}`}
        onClick={() => canUpload && inputRef.current?.click()}
        onDragOver={(e) => { if (canUpload) e.preventDefault(); }}
        onDrop={(e) => {
          e.preventDefault();
          if (!canUpload) return;
          const file = e.dataTransfer.files?.[0];
          if (file) onUpload(file);
        }}
      >
        <div className="dropzone__badge">Drag & drop</div>
        <div className="dropzone__title">Upload your floorplan image</div>
        <div className="dropzone__subtitle">PNG, JPG, JPEG, WEBP, or GIF</div>
        {!canUpload && (
          <div className="dropzone__blocked">Enter a floor name above to enable upload</div>
        )}
        <button
          type="button"
          className="button button--ghost"
          disabled={!canUpload}
          onClick={(e) => { e.stopPropagation(); if (canUpload) inputRef.current?.click(); }}
        >
          Browse files
        </button>
        <input
          ref={inputRef}
          className="sr-only"
          type="file"
          accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
          disabled={!canUpload}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onUpload(file);
          }}
        />
      </div>

      {error ? <div className="alert alert--error">{error}</div> : null}
    </div>
  );
}

function Home({ setFloorplan, setFloorData, setStage }) {
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    fetch('/api/floors/cleanup', { method: 'POST' }).catch(() => {});
  }, []);

  return (
    <section className="home-page">
      <div className="home-page__left">
        <UploadSection
          setError={setError}
          setUploading={setUploading}
          setFloorplan={setFloorplan}
          setStage={setStage}
          uploading={uploading}
          error={error}
        />
      </div>

      <div className="home-page__divider" />

      <div className="home-page__right">
        <ProcessedFloorsPicker
          setFloorplan={setFloorplan}
          setFloorData={setFloorData}
          setStage={setStage}
        />
      </div>
    </section>
  );
}

export default Home;
