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
  const [renameTarget, setRenameTarget] = useState(null); // { id, name }
  const [renameValue, setRenameValue] = useState('');
  const detectionTriggered = useRef(false);

  const { state, setMode, loadRooms, addRoom, renameRoom, deleteRoom, toggleStatus } = useRoomStore();

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
      setRenameTarget({ id: room.id, name: room.name });
      setRenameValue(room.name);
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
      wall_ids: null,
      points,
    });
  }

  function commitRename() {
    if (!renameTarget) return;
    const trimmed = renameValue.trim();
    if (trimmed) renameRoom(renameTarget.id, trimmed);
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
      </div>

      {renameTarget && (
        <div className="room-rename-backdrop" onClick={() => setRenameTarget(null)}>
          <div className="room-rename-modal" onClick={e => e.stopPropagation()}>
            <h3 className="room-rename-modal__title">Rename Room</h3>
            <input
              className="text-input"
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') setRenameTarget(null);
              }}
              autoFocus
            />
            <div className="room-rename-modal__actions">
              <button className="button button--ghost" type="button" onClick={() => setRenameTarget(null)}>
                Cancel
              </button>
              <button className="button button--primary" type="button" onClick={commitRename}>
                Rename
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
