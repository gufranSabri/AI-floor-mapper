import { useEffect, useRef, useState, useCallback } from 'react';
import { useContainerSize, wallsToShapes } from '../../konva';
import { useDoorStore } from '../../konva/doors/useDoorStore';
import { doorsToCanvas, canvasToDoors } from '../../konva/doors/doorSerializers';
import DoorCanvas from '../../konva/doors/DoorCanvas';
import DoorToolbar from './DoorToolbar';
import '../WallEditor/FloorEditor.css';

export default function DoorEditor({ floorplan, floorData, onBack, onNext, floorName, isLastStep }) {
  const [canvasSize, setCanvasRef] = useContainerSize();
  const [naturalSize,  setNaturalSize]  = useState(null);
  const [wallShapes,   setWallShapes]   = useState([]);
  const [saving,       setSaving]       = useState(false);
  const [saved,        setSaved]        = useState(false);

  const { state, canUndo, canRedo, undo, redo, setMode, addDoor, deleteDoor, loadDoors } = useDoorStore();

  const handleSaveRef = useRef(null);

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

  // Load walls as read-only shapes for the canvas
  useEffect(() => {
    if (!naturalSize || !canvasSize) return;
    const walls = floorData?.elements?.walls;
    if (!walls) return;
    const { shapes } = wallsToShapes(walls, naturalSize.width, naturalSize.height, canvasSize.width, canvasSize.height);
    setWallShapes(shapes);
  }, [floorData, naturalSize, canvasSize]);

  // Reload doors whenever floorData or canvasSize changes so pruned/updated doors stay in sync.
  useEffect(() => {
    if (!naturalSize || !canvasSize) return;
    const apiDoors = floorData?.elements?.doors;
    const apiWalls = floorData?.elements?.walls;
    if (!apiDoors?.length) { loadDoors([]); return; }
    const canvas = doorsToCanvas(apiDoors, apiWalls, naturalSize.width, naturalSize.height, canvasSize.width, canvasSize.height);
    loadDoors(canvas);
  }, [floorData, naturalSize, canvasSize, loadDoors]);

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
      if ((meta && e.key === 'y') || (meta && e.shiftKey && e.key === 'z')) { e.preventDefault(); redo(); return; }
      if (meta && e.key === 's') { e.preventDefault(); handleSaveRef.current?.(); return; }
      if (e.key.toLowerCase() === 'a') { setMode('pan'); return; }
      if (e.key.toLowerCase() === 's' && !meta) { setMode('select'); return; }
      if (e.key.toLowerCase() === 'd') { setMode('add-door'); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        setMode(state.mode === 'delete' ? 'select' : 'delete');
        return;
      }
      if (e.key === 'Escape') setMode('select');
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state.mode, setMode, undo, redo]);

  async function fetchAndMergeDoors(doors) {
    const res = await fetch(`/api/floors/${encodeURIComponent(floorName)}/boundary`);
    const latest = res.ok ? await res.json() : floorData;
    return { ...latest, elements: { ...latest?.elements, doors } };
  }

  const handleSave = useCallback(async () => {
    if (!naturalSize || !canvasSize || !floorName) return;
    setSaving(true);
    try {
      const doors = canvasToDoors(state.doors, naturalSize.width, naturalSize.height, canvasSize.width, canvasSize.height);
      const updatedData = await fetchAndMergeDoors(doors);
      await fetch(`/api/floors/${encodeURIComponent(floorName)}/boundary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedData),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }, [state.doors, naturalSize, canvasSize, floorName]);
  handleSaveRef.current = handleSave;

  const handleNext = useCallback(async () => {
    if (!naturalSize || !canvasSize || !floorName) return;
    setSaving(true);
    try {
      const doors = canvasToDoors(state.doors, naturalSize.width, naturalSize.height, canvasSize.width, canvasSize.height);
      const updatedData = await fetchAndMergeDoors(doors);
      await fetch(`/api/floors/${encodeURIComponent(floorName)}/boundary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedData),
      });
      if (onNext) onNext(updatedData);
    } finally {
      setSaving(false);
    }
  }, [state.doors, naturalSize, canvasSize, floorName, onNext]);

  return (
    <section className="floor-editor">
      <div className="floor-editor__header">
        <div>
          <span className="eyebrow">Door Editor</span>
          <p>Click two points on a wall to place a door. Use delete mode to remove doors.</p>
        </div>
        <div className="floor-editor__header-actions">
          <button className="button button--ghost" type="button" onClick={onBack}>Back</button>
          <button
            className="button button--ghost"
            type="button" onClick={handleSave}
            disabled={saving || !floorName || !naturalSize || !canvasSize}
          >
            {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save'}
          </button>
          <button
            className="button button--primary"
            type="button" onClick={handleNext}
            disabled={saving || !floorName || !naturalSize || !canvasSize}
          >
            {saving ? 'Saving…' : isLastStep ? 'Finish' : 'Next'}
          </button>
        </div>
      </div>

      <DoorToolbar
        mode={state.mode}
        setMode={setMode}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={undo}
        onRedo={redo}
      />

      <div className="floor-editor__canvas-wrap" ref={setCanvasRef}>
        {canvasSize && (
          <DoorCanvas
            walls={wallShapes}
            doorState={state}
            doorActions={{ addDoor, deleteDoor }}
            imageUrl={floorplan.url}
            size={canvasSize}
          />
        )}
      </div>
    </section>
  );
}
