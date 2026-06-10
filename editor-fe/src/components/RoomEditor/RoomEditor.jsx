import { useEffect, useRef, useState, useCallback } from 'react';
import { useContainerSize } from '../../konva';
import { useRoomStore } from '../../konva/rooms/useRoomStore';
import { roomsToCanvas, canvasToRooms } from '../../konva/rooms/roomSerializers';
import { containFit } from '../../konva/utils';
import RoomCanvas from '../../konva/rooms/RoomCanvas';
import RoomToolbar from './RoomToolbar';
import '../WallEditor/FloorEditor.css';
import './RoomEditor.css';

export default function RoomEditor({ floorplan, floorData, onBack, onNext, floorName, isLastStep }) {
  const [canvasSize, setCanvasRef] = useContainerSize();
  const [naturalSize, setNaturalSize] = useState(null);
  const [detecting, setDetecting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [apiRoomsCache, setApiRoomsCache] = useState(null); // image-space rooms after detect/load
  const [renameTarget, setRenameTarget] = useState(null); // { id, name, category }
  const [renameValue, setRenameValue] = useState('');
  const [categoryValue, setCategoryValue] = useState(null);
  const detectionTriggered = useRef(false);

  const { state, setMode, loadRooms, addRoom, renameRoom, deleteRoom, toggleStatus, setCategoryRoom } = useRoomStore();

  const CATEGORIES = [
    { value: 'floor_space',   label: 'Floor Space' },
    { value: 'closed_office', label: 'Closed Office' },
    { value: 'open_office',   label: 'Open Office Space' },
    { value: 'toilet',        label: 'Toilet' },
    { value: 'other',         label: 'Other' },
  ];

  const LEGEND = [
    { label: 'Floor Space',      color: '#ca9900' },
    { label: 'Closed Office',    color: '#2563eb' },
    { label: 'Open Office',      color: '#16a34a' },
    { label: 'Toilet',           color: '#db2777' },
    { label: 'Other',            color: '#4b5563' },
  ];

  const AUTO_NAMED = { floor_space: 'Floor', toilet: 'Toilet' };

  // Resolve natural image size
  useEffect(() => {
    if (!floorplan?.url) return;
    const metaW = floorData?.metadata?.image_size?.width;
    const metaH = floorData?.metadata?.image_size?.height;
    if (metaW && metaH) { setNaturalSize({ width: metaW, height: metaH }); return; }
    const img = new Image();
    img.onload = () => setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
    img.src = floorplan.url;
  }, [floorplan?.url, floorData]);

  // Re-serialize cached image-space rooms whenever canvasSize changes.
  useEffect(() => {
    if (!naturalSize || !canvasSize || !apiRoomsCache?.length) return;
    const canvas = roomsToCanvas(apiRoomsCache, naturalSize.width, naturalSize.height, canvasSize.width, canvasSize.height);
    loadRooms(canvas);
  }, [naturalSize, canvasSize, apiRoomsCache, loadRooms]);

  // Initial load: use floorData if rooms exist, otherwise trigger detection once.
  useEffect(() => {
    if (!naturalSize || !canvasSize || !floorName) return;

    const apiRooms = floorData?.elements?.rooms;
    if (apiRooms?.length) {
      setApiRoomsCache(apiRooms);
      return;
    }

    // Auto-detect rooms from walls — only once per mount.
    if (detectionTriggered.current) return;
    detectionTriggered.current = true;
    setDetecting(true);
    fetch(`/api/floors/${encodeURIComponent(floorName)}/rooms/detect`, { method: 'POST' })
      .then(r => r.json())
      .then(({ rooms: detected }) => {
        setApiRoomsCache(detected);
      })
      .catch(console.error)
      .finally(() => setDetecting(false));
  }, [floorData, naturalSize, canvasSize, floorName]);

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key.toLowerCase() === 'a') { setMode('pan'); return; }
      if (e.key.toLowerCase() === 's' && !(e.metaKey || e.ctrlKey)) { setMode('select'); return; }
      if (e.key.toLowerCase() === 't') { setMode(state.mode === 'toggle' ? 'select' : 'toggle'); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        setMode(state.mode === 'delete' ? 'select' : 'delete');
        return;
      }
      if (e.key === 'Escape') { setMode('select'); setRenameTarget(null); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state.mode, setMode]);

  function handleRoomClick(room) {
    if (state.mode === 'delete') {
      deleteRoom(room.id);
      return;
    }
    if (state.mode === 'toggle') {
      // The floor boundary (largest polygon, always first) cannot be toggled.
      const isFloor = state.rooms[0]?.id === room.id;
      if (!isFloor) toggleStatus(room.id);
      return;
    }
    if (state.mode === 'select') {
      setRenameTarget({ id: room.id, name: room.name, category: room.category });
      setRenameValue(room.name);
      setCategoryValue(room.category ?? null);
    }
  }

  // dragRect is canvas-space { x, y, w, h }; convert to image-space polygon for storage.
  function handleAddRoom(dragRect) {
    if (!naturalSize || !canvasSize) return;
    const { offsetX, offsetY, scale } = containFit(naturalSize.width, naturalSize.height, canvasSize.width, canvasSize.height);
    const toImg = (v, off) => (v - off) / scale;
    const x1 = toImg(dragRect.x, offsetX),           y1 = toImg(dragRect.y, offsetY);
    const x2 = toImg(dragRect.x + dragRect.w, offsetX), y2 = toImg(dragRect.y + dragRect.h, offsetY);
    const area = Math.abs((x2 - x1) * (y2 - y1));

    const nextId = Math.max(0, ...state.rooms.map(r => r.id)) + 1;
    const manualCount = state.rooms.filter(r => r.wall_ids === null).length + 1;

    // Store canvas-space points directly (serializer handles the image-space conversion on save).
    const points = [
      dragRect.x, dragRect.y,
      dragRect.x + dragRect.w, dragRect.y,
      dragRect.x + dragRect.w, dragRect.y + dragRect.h,
      dragRect.x, dragRect.y + dragRect.h,
    ];

    addRoom({
      id: nextId,
      name: `Space ${manualCount}`,
      area: Math.round(area),
      status: 'active',
      category: 'open_office',
      wall_ids: null,
      points,
    });
  }

  function commitRename() {
    if (!renameTarget) return;
    const trimmed = renameValue.trim();
    if (trimmed) renameRoom(renameTarget.id, trimmed);
    if (categoryValue !== renameTarget.category) setCategoryRoom(renameTarget.id, categoryValue);
    setRenameTarget(null);
  }

  async function persistRooms() {
    if (!naturalSize || !canvasSize || !floorName) return null;
    const rooms = canvasToRooms(state.rooms, naturalSize.width, naturalSize.height, canvasSize.width, canvasSize.height);
    await fetch(`/api/floors/${encodeURIComponent(floorName)}/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rooms }),
    });
    // Re-fetch latest boundary to merge
    const res = await fetch(`/api/floors/${encodeURIComponent(floorName)}/boundary`);
    return res.ok ? await res.json() : null;
  }

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await persistRooms();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }, [state.rooms, naturalSize, canvasSize, floorName]);

  const handleNext = useCallback(async () => {
    setSaving(true);
    try {
      const updatedData = await persistRooms();
      if (onNext) onNext(updatedData);
    } finally {
      setSaving(false);
    }
  }, [state.rooms, naturalSize, canvasSize, floorName, onNext]);

  return (
    <section className="floor-editor">
      <div className="floor-editor__header">
        <div>
          <span className="eyebrow">Room Mapping</span>
          <p>
            {detecting
              ? 'Detecting rooms from walls…'
              : `${state.rooms.length} room${state.rooms.length !== 1 ? 's' : ''} detected. Select to rename · Toggle to activate/deactivate · Add to draw a space · Delete to remove drawn spaces.`}
          </p>
        </div>
        <div className="floor-editor__header-actions">
          <button className="button button--ghost" type="button" onClick={onBack}>Back</button>
          <button
            className="button button--ghost"
            type="button"
            onClick={handleSave}
            disabled={saving || detecting || !floorName || !naturalSize || !canvasSize}
          >
            {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save'}
          </button>
          <button
            className="button button--primary"
            type="button"
            onClick={handleNext}
            disabled={saving || detecting || !floorName || !naturalSize || !canvasSize}
          >
            {saving ? 'Saving…' : isLastStep ? 'Finish' : 'Next'}
          </button>
        </div>
      </div>

      <RoomToolbar mode={state.mode} setMode={setMode} />

      <div className="floor-editor__canvas-wrap" ref={setCanvasRef}>
        {detecting && (
          <div className="room-detecting-overlay">
            <span>Detecting rooms…</span>
          </div>
        )}
        {!detecting && canvasSize && (
          <RoomCanvas
            roomState={state}
            roomActions={{ onRoomClick: handleRoomClick, onAddRoom: handleAddRoom }}
            imageUrl={floorplan.url}
            size={canvasSize}
          />
        )}
        <div className="room-legend">
          {LEGEND.map(({ label, color }) => (
            <div key={label} className="room-legend__item">
              <span className="room-legend__dot" style={{ background: color }} />
              {label}
            </div>
          ))}
        </div>
      </div>

      {renameTarget && (
        <div className="room-rename-backdrop" onClick={() => setRenameTarget(null)}>
          <div className="room-rename-modal" onClick={e => e.stopPropagation()}>
            <h3 className="room-rename-modal__title">Edit Space</h3>
            <input
              className="text-input"
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') setRenameTarget(null);
              }}
              disabled={categoryValue in AUTO_NAMED}
              autoFocus={!(categoryValue in AUTO_NAMED)}
            />
            <div className="room-category-group">
              <span className="room-category-group__label">Space category</span>
              {CATEGORIES.map(({ value, label }) => (
                <label key={value} className="room-category-option">
                  <input
                    type="radio"
                    name="room-category"
                    value={value}
                    checked={categoryValue === value}
                    onChange={() => {
                      setCategoryValue(value);
                      if (value in AUTO_NAMED) setRenameValue(AUTO_NAMED[value]);
                    }}
                  />
                  {label}
                </label>
              ))}
            </div>
            <div className="room-rename-modal__actions">
              <button className="button button--ghost" type="button" onClick={() => setRenameTarget(null)}>
                Cancel
              </button>
              <button className="button button--primary" type="button" onClick={commitRename}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
