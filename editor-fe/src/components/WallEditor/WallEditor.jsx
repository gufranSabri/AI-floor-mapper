import { useEffect, useRef, useState, useCallback } from 'react';
import { WallCanvas, useConnectionStore, useContainerSize, wallsToShapes, shapesToWalls } from '../../konva';
import EditorToolbar from './WallToolbar';
import './FloorEditor.css';

export default function FloorEditor({ floorplan, floorData, onBack, onNext, onSave, floorName, isLastStep }) {
  const [canvasSize, setCanvasRef] = useContainerSize();
  const [naturalSize,   setNaturalSize]   = useState(null);
  const [shapesLoaded,  setShapesLoaded]  = useState(false);
  const [saving,        setSaving]        = useState(false);
  const [resetting,     setResetting]     = useState(false);
  const [saved,         setSaved]         = useState(false);

  const store = useConnectionStore([]);
  const { state, loadShapes, setMode, deleteShape, deselect, undo, redo, canUndo, canRedo } = store;

  const handleSaveRef = useRef(null);

  // Resolve natural image dimensions
  useEffect(() => {
    if (!floorplan?.url) return;
    const metaW = floorData?.metadata?.image_size?.width;
    const metaH = floorData?.metadata?.image_size?.height;
    if (metaW && metaH) { setNaturalSize({ width: metaW, height: metaH }); return; }
    const img = new Image();
    img.onload = () => setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
    img.src = floorplan.url;
  }, [floorplan?.url, floorData]);

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
      if ((meta && e.key === 'y') || (meta && e.shiftKey && e.key === 'z')) { e.preventDefault(); redo(); return; }
      if (meta && e.key === 's') { e.preventDefault(); handleSaveRef.current?.(); return; }
      const map = { a: 'pan', s: 'select', d: 'line', c: 'connect', x: 'split', v: 'disconnect', m: 'merge' };
      if (map[e.key.toLowerCase()]) { setMode(map[e.key.toLowerCase()]); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        setMode(state.mode === 'delete' ? 'select' : 'delete');
        return;
      }
      if (e.key === 'Escape' && state.mode === 'delete') {
        setMode('select');
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state.mode, state.selectedId, setMode, deleteShape, deselect, undo, redo]);

  // Initial shape load
  useEffect(() => {
    if (shapesLoaded || !naturalSize || !canvasSize) return;
    const walls = floorData?.elements?.walls;
    if (!walls) return;
    const { shapes, connections } = wallsToShapes(walls, naturalSize.width, naturalSize.height, canvasSize.width, canvasSize.height);
    loadShapes(shapes, connections);
    setShapesLoaded(true);
  }, [floorData, naturalSize, canvasSize, shapesLoaded, loadShapes]);

  // Rescale on canvas resize
  const prevCanvasSize = useRef(canvasSize);
  useEffect(() => {
    if (!shapesLoaded || !naturalSize || !canvasSize) return;
    const prev = prevCanvasSize.current;
    if (prev?.width === canvasSize.width && prev?.height === canvasSize.height) return;
    prevCanvasSize.current = canvasSize;
    const walls = floorData?.elements?.walls;
    if (!walls) return;
    const { shapes, connections } = wallsToShapes(walls, naturalSize.width, naturalSize.height, canvasSize.width, canvasSize.height);
    loadShapes(shapes, connections);
  }, [canvasSize, shapesLoaded, naturalSize, floorData, loadShapes]);

  async function fetchAndMergeWalls(walls) {
    const res = await fetch(`/api/floors/${encodeURIComponent(floorName)}/boundary`);
    const latest = res.ok ? await res.json() : floorData;
    return { ...latest, elements: { ...latest?.elements, walls } };
  }

  const handleSave = useCallback(async () => {
    if (!naturalSize || !canvasSize || !floorName) return;
    setSaving(true);
    try {
      const walls = shapesToWalls(state.shapes, state.connections, naturalSize.width, naturalSize.height, canvasSize.width, canvasSize.height);
      const updatedData = await fetchAndMergeWalls(walls);
      await fetch(`/api/floors/${encodeURIComponent(floorName)}/boundary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedData),
      });
      // Re-fetch so App state reflects pruned doors/rooms from the backend.
      const res = await fetch(`/api/floors/${encodeURIComponent(floorName)}/boundary`);
      const savedData = res.ok ? await res.json() : updatedData;
      onSave?.(savedData);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }, [state.shapes, state.connections, naturalSize, canvasSize, floorName, onSave]);
  handleSaveRef.current = handleSave;

  const handleNext = useCallback(async () => {
    if (!naturalSize || !canvasSize || !floorName) return;
    setSaving(true);
    try {
      const walls = shapesToWalls(state.shapes, state.connections, naturalSize.width, naturalSize.height, canvasSize.width, canvasSize.height);
      const updatedData = await fetchAndMergeWalls(walls);
      await fetch(`/api/floors/${encodeURIComponent(floorName)}/boundary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedData),
      });
      // Re-fetch so any backend-side pruning (e.g. orphaned doors) is reflected in the next stage.
      const res = await fetch(`/api/floors/${encodeURIComponent(floorName)}/boundary`);
      const savedData = res.ok ? await res.json() : updatedData;
      if (onNext) onNext(savedData);
    } finally {
      setSaving(false);
    }
  }, [state.shapes, state.connections, naturalSize, canvasSize, floorName, onNext]);

  const handleReset = useCallback(async () => {
    if (!floorName) return;
    setResetting(true);
    try {
      const res = await fetch(`/api/floors/${encodeURIComponent(floorName)}/boundary/reset`, { method: 'POST' });
      if (!res.ok) return;
      const freshData = await res.json();
      setShapesLoaded(false);
      if (onNext) onNext(freshData, { resetOnly: true });
      if (!naturalSize) return;
      const { shapes, connections } = wallsToShapes(freshData?.elements?.walls ?? [], naturalSize.width, naturalSize.height, canvasSize.width, canvasSize.height);
      loadShapes(shapes, connections);
      setShapesLoaded(true);
    } finally {
      setResetting(false);
    }
  }, [floorName, naturalSize, canvasSize, loadShapes, onNext]);

  const actions = {
    setMode: store.setMode,
    addShape: store.addShape,
    updateShape: store.updateShape,
    deleteShape: store.deleteShape,
    select: store.select,
    deselect: store.deselect,
    setConnectBuffer: store.setConnectBuffer,
    setMergeBuffer: store.setMergeBuffer,
    addConnection: store.addConnection,
    disconnectLine: store.disconnectLine,
    disconnectEndpoint: store.disconnectEndpoint,
    clearAll: store.clearAll,
    moveEndpoint: store.moveEndpoint,
    moveEndpointLive: store.moveEndpointLive,
    splitLine: store.splitLine,
    moveLine: store.moveLine,
    mergeWalls: store.mergeWalls,
  };

  return (
    <section className="floor-editor">
      <div className="floor-editor__header">
        <div>
          <span className="eyebrow">Wall Editor</span>
          <p>Drag endpoints to adjust walls. Use the toolbar or keyboard shortcuts to add, connect, split, or delete.</p>
          <div className="floor-editor__warnings">
            <span className="floor-editor__warning">Editing walls will reset all mapped rooms.</span>
            <span className="floor-editor__warning">Editing walls may affect door placement.</span>
          </div>
        </div>
        <div className="floor-editor__header-actions">
          <button className="button button--ghost" type="button" onClick={onBack}>Back</button>
          <button
            className="button button--ghost"
            type="button" onClick={handleSave}
            disabled={saving || resetting || !floorName}
          >
            {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save'}
          </button>
          <button
            className="button button--primary"
            type="button" onClick={handleNext}
            disabled={saving || resetting || !floorName}
          >
            {saving ? 'Saving…' : isLastStep ? 'Finish' : 'Next'}
          </button>
        </div>
      </div>

      <EditorToolbar
        state={state} actions={actions} canvasSize={canvasSize}
        canUndo={canUndo} canRedo={canRedo} onUndo={undo} onRedo={redo}
      />

      <div className="floor-editor__canvas-wrap" ref={setCanvasRef}>
        {canvasSize && <WallCanvas state={state} actions={actions} imageUrl={floorplan.url} size={canvasSize} />}
      </div>
    </section>
  );
}
