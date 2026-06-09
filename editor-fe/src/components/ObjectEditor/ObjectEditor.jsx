import { useEffect, useRef, useState, useCallback } from 'react';
import { Stage, Layer, Image as KonvaImage, Rect, Text, Group } from 'react-konva';
import useImage from 'use-image';
import { useContainerSize } from '../../konva';
import { containFit } from '../../konva/utils';
import ObjectToolbar from './ObjectToolbar';
import '../WallEditor/FloorEditor.css';
import './ObjectEditor.css';

const ZOOM_MIN    = 0.25;
const ZOOM_MAX    = 10;
const ZOOM_FACTOR = 1.08;

// ── DetectionCanvas ───────────────────────────────────────────────────────────
// Proper React component (no conditional returns before hooks).
// Handles zoom, pan, bbox-draw, bbox-delete, and template-crop — all inside
// Konva so the stage transform is always respected.
//
// Coordinate pipeline (for any mouse event):
//   clientX/Y  →  canvas-relative px  (getBoundingClientRect)
//               →  content-space px   (undo stage pan + zoom)
//               →  image px           (subtract letterbox offset, divide by fitScale)

function DetectionCanvas({
  imageUrl, size, detections,
  mode,               // 'pan' | 'add' | 'delete' | 'crop'
  naturalSize,
  onDelete,
  onBboxDrawn,        // ({x,y,w,h}) in image px — for bbox-draw (mode='add')
  onCropDrawn,        // ({x,y,w,h}) in image px — for template crop (mode='crop')
}) {
  const [image] = useImage(imageUrl, 'anonymous');
  const stageRef     = useRef(null);
  const [, forceRender] = useState(0);   // trigger re-render after zoom so rects update
  const [hoveredKey, setHoveredKey] = useState(null);

  // draw state — kept in refs so window-level handlers always see current values
  const drawStart  = useRef(null);  // content-space start point
  const [drawRect, setDrawRect] = useState(null); // content-space rect for live preview

  const isPan    = mode === 'pan';
  const isAdd    = mode === 'add';
  const isDelete = mode === 'delete';
  const isCrop   = mode === 'crop';
  const isDrawing = isAdd || isCrop;

  // ── helpers ─────────────────────────────────────────────────────────────────

  // Convert a native MouseEvent → { contentX, contentY, imgX, imgY }
  // This is the single source of truth for all coordinate math.
  function clientToCoords(clientX, clientY, imgW, imgH, offsetX, offsetY, fitScale) {
    const stage  = stageRef.current;
    if (!stage) return null;
    const bounds = stage.container().getBoundingClientRect();
    const canvasX = clientX - bounds.left;
    const canvasY = clientY - bounds.top;
    const contentX = (canvasX - stage.x()) / stage.scaleX();
    const contentY = (canvasY - stage.y()) / stage.scaleX();
    const imgX = (contentX - offsetX) / fitScale;
    const imgY = (contentY - offsetY) / fitScale;
    return { contentX, contentY, imgX, imgY };
  }

  // ── zoom ─────────────────────────────────────────────────────────────────────

  function handleWheel(e) {
    e.evt.preventDefault();
    const stage    = stageRef.current;
    const pointer  = stage.getPointerPosition();
    const oldScale = stage.scaleX();
    const dir      = e.evt.deltaY < 0 ? 1 : -1;
    const newScale = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN,
      oldScale * (dir > 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR)));
    const origin = { x: (pointer.x - stage.x()) / oldScale, y: (pointer.y - stage.y()) / oldScale };
    const newPos  = { x: pointer.x - origin.x * newScale,   y: pointer.y - origin.y * newScale };
    stage.scale({ x: newScale, y: newScale });
    stage.position(newPos);
    stage.batchDraw();
    forceRender(n => n + 1);
  }

  // ── window-level draw handlers (fire even when cursor leaves canvas) ─────────

  useEffect(() => {
    if (!isDrawing) {
      drawStart.current = null;
      setDrawRect(null);
      return;
    }

    function onDown(e) {
      // ignore if click is not on the canvas element
      const stage = stageRef.current;
      if (!stage) return;
      const bounds = stage.container().getBoundingClientRect();
      if (
        e.clientX < bounds.left || e.clientX > bounds.right ||
        e.clientY < bounds.top  || e.clientY > bounds.bottom
      ) return;

      // compute fitScale / offsets fresh at event time
      const img = stage.findOne('Image');
      if (!img) return;
      const imgNode  = img;
      const offsetX  = imgNode.x();
      const offsetY  = imgNode.y();
      const fitScale = imgNode.width()  / (naturalSize?.width  || imgNode.width());

      const coords = clientToCoords(e.clientX, e.clientY,
        naturalSize?.width, naturalSize?.height, offsetX, offsetY, fitScale);
      if (!coords) return;
      drawStart.current = { x: coords.contentX, y: coords.contentY };
      setDrawRect({ x: coords.contentX, y: coords.contentY, w: 0, h: 0 });
    }

    function onMove(e) {
      if (!drawStart.current) return;
      const stage = stageRef.current;
      if (!stage) return;
      const img = stage.findOne('Image');
      if (!img) return;
      const offsetX  = img.x();
      const offsetY  = img.y();
      const fitScale = img.width() / (naturalSize?.width || img.width());

      const coords = clientToCoords(e.clientX, e.clientY,
        naturalSize?.width, naturalSize?.height, offsetX, offsetY, fitScale);
      if (!coords) return;
      setDrawRect({
        x: Math.min(drawStart.current.x, coords.contentX),
        y: Math.min(drawStart.current.y, coords.contentY),
        w: Math.abs(coords.contentX - drawStart.current.x),
        h: Math.abs(coords.contentY - drawStart.current.y),
      });
    }

    function onUp(e) {
      if (!drawStart.current) return;
      const stage = stageRef.current;
      if (!stage) return;
      const img = stage.findOne('Image');
      if (!img) return;
      const offsetX  = img.x();
      const offsetY  = img.y();
      const fitW     = img.width();
      const fitH     = img.height();
      const natW     = naturalSize?.width  || fitW;
      const natH     = naturalSize?.height || fitH;
      const fitScale = fitW / natW;

      const coords = clientToCoords(e.clientX, e.clientY,
        natW, natH, offsetX, offsetY, fitScale);
      if (!coords) return;

      const rx = Math.min(drawStart.current.x, coords.contentX);
      const ry = Math.min(drawStart.current.y, coords.contentY);
      const rw = Math.abs(coords.contentX - drawStart.current.x);
      const rh = Math.abs(coords.contentY - drawStart.current.y);

      drawStart.current = null;
      setDrawRect(null);

      if (rw < 4 || rh < 4) return;

      // convert content-space rect → image pixels
      const imgX  = Math.max(0, Math.round((rx - offsetX) / fitScale));
      const imgY  = Math.max(0, Math.round((ry - offsetY) / fitScale));
      const imgW2 = Math.min(natW - imgX, Math.round(rw / fitScale));
      const imgH2 = Math.min(natH - imgY, Math.round(rh / fitScale));
      if (imgW2 < 2 || imgH2 < 2) return;

      if (isAdd)  onBboxDrawn?.({ x: imgX, y: imgY, w: imgW2, h: imgH2 });
      if (isCrop) onCropDrawn?.({ x: imgX, y: imgY, w: imgW2, h: imgH2 });
    }

    window.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDrawing, isAdd, isCrop, naturalSize, onBboxDrawn, onCropDrawn]);

  // ── render ───────────────────────────────────────────────────────────────────

  if (!image || !size.width || !size.height) return null;

  const natW = naturalSize?.width  || image.naturalWidth  || image.width  || 1;
  const natH = naturalSize?.height || image.naturalHeight || image.height || 1;
  const { offsetX, offsetY, scale: fitScale } = containFit(natW, natH, size.width, size.height);
  const fitW = natW * fitScale;
  const fitH = natH * fitScale;

  const cursor = isPan ? 'grab' : isDrawing ? 'crosshair' : isDelete ? 'not-allowed' : 'default';

  return (
    <Stage
      ref={stageRef}
      width={size.width}
      height={size.height}
      style={{ cursor, display: 'block' }}
      draggable={isPan}
      onDragMove={() => forceRender(n => n + 1)}
      onWheel={handleWheel}
    >
      <Layer listening={false}>
        <KonvaImage image={image} x={offsetX} y={offsetY} width={fitW} height={fitH} />
      </Layer>

      <Layer>
        {detections.map(({ objectName, idx, det }) => {
          const key = `${objectName}-${idx}`;
          const x   = offsetX + det.x * fitScale;
          const y   = offsetY + det.y * fitScale;
          const w   = det.w * fitScale;
          const h   = det.h * fitScale;
          const isHovered = hoveredKey === key;
          const stroke = isDelete && isHovered ? '#e53e3e' : '#d9830a';
          const fill   = isDelete && isHovered ? 'rgba(229,62,62,0.18)' : 'rgba(217,131,10,0.12)';

          return (
            <Group
              key={key}
              onMouseEnter={() => setHoveredKey(key)}
              onMouseLeave={() => setHoveredKey(null)}
              onClick={() => isDelete && onDelete(objectName, idx)}
            >
              <Rect x={x} y={y} width={w} height={h}
                stroke={stroke} strokeWidth={isHovered ? 2.5 : 1.5}
                fill={fill} cornerRadius={2} />
              <Text
                x={x + 3} y={y + 3}
                text={det.score != null
                  ? `${objectName} ${(det.score * 100).toFixed(0)}%`
                  : objectName}
                fontSize={10} fill={stroke} fontStyle="bold"
              />
            </Group>
          );
        })}

        {/* live draw preview in content-space */}
        {drawRect && drawRect.w > 0 && (
          <Rect
            x={drawRect.x} y={drawRect.y} width={drawRect.w} height={drawRect.h}
            stroke={isCrop ? '#1c6b5e' : '#d9830a'}
            strokeWidth={1.5} dash={[6, 3]}
            fill={isCrop ? 'rgba(28,107,94,0.08)' : 'rgba(217,131,10,0.08)'}
            listening={false}
          />
        )}
      </Layer>
    </Stage>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ObjectEditor({ floorplan, floorData, floorName, onBack, onFinish }) {
  const [canvasSize, setCanvasRef] = useContainerSize();
  const [naturalSize, setNaturalSize] = useState(null);

  // 'pan' | 'add' | 'delete' | 'crop'
  const [mode, setMode] = useState('pan');

  const [selectedObject, setSelectedObject] = useState(null);
  const [templates, setTemplates] = useState([]);

  // template-save modal state
  const [pendingCrop, setPendingCrop]   = useState(null);  // { x,y,w,h } image px
  const [namingObject, setNamingObject] = useState(false);
  const [objectName, setObjectName]     = useState('');
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);

  const [detections, setDetections] = useState({});
  const [detecting,  setDetecting]  = useState(false);

  const visibleDetections = selectedObject
    ? (detections[selectedObject] ?? []).map((det, idx) => ({ objectName: selectedObject, idx, det }))
    : [];

  // resolve natural image size
  useEffect(() => {
    if (!floorplan?.url) return;
    const metaW = floorData?.metadata?.image_size?.width;
    const metaH = floorData?.metadata?.image_size?.height;
    if (metaW && metaH) { setNaturalSize({ width: metaW, height: metaH }); return; }
    const img = new Image();
    img.onload = () => setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
    img.src = floorplan.url;
  }, [floorplan?.url, floorData]);

  const loadTemplates = useCallback(async () => {
    try {
      const r = await fetch('/api/objects/templates');
      const { templates: list } = await r.json();
      setTemplates(list ?? []);
    } catch (e) { console.error(e); }
  }, []);
  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  useEffect(() => {
    if (!floorName) return;
    fetch(`/api/floors/${encodeURIComponent(floorName)}/objects`)
      .then(r => r.json())
      .then(data => { if (Object.keys(data).length > 0) setDetections(data); })
      .catch(() => {});
  }, [floorName]);

  // ── bbox draw callback ──────────────────────────────────────────────────────

  const handleBboxDrawn = useCallback(({ x, y, w, h }) => {
    if (!selectedObject) return;
    setDetections(prev => ({
      ...prev,
      [selectedObject]: [...(prev[selectedObject] ?? []),
        { x, y, w, h, score: null, template: 'manual' }],
    }));
  }, [selectedObject]);

  // ── template crop callback ──────────────────────────────────────────────────
  // Called with image-pixel coords — no div-space conversion needed.

  const handleCropDrawn = useCallback(({ x, y, w, h }) => {
    if (!floorplan?.url) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const cvs = document.createElement('canvas');
      cvs.width = w; cvs.height = h;
      cvs.getContext('2d').drawImage(img, x, y, w, h, 0, 0, w, h);
      cvs.toBlob(blob => {
        setPendingCrop({ blob, x, y, w, h });
        setMode('pan');
        setNamingObject(true);
        setObjectName('');
      }, 'image/png');
    };
    img.src = floorplan.url;
  }, [floorplan?.url]);

  async function handleSaveTemplate() {
    if (!objectName.trim() || !pendingCrop?.blob) return;
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('files', pendingCrop.blob, 'template_01.png');
      await fetch(`/api/objects/templates/${encodeURIComponent(objectName.trim())}`, {
        method: 'POST', body: fd,
      });
      await loadTemplates();
      setNamingObject(false);
      setPendingCrop(null);
    } finally { setSaving(false); }
  }

  function cancelNaming() {
    setNamingObject(false);
    setPendingCrop(null);
    setObjectName('');
  }

  // ── detection ───────────────────────────────────────────────────────────────

  async function runDetection() {
    if (!floorName || !selectedObject) return;
    setDetecting(true);
    try {
      const r = await fetch(`/api/floors/${encodeURIComponent(floorName)}/objects/detect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threshold: 0.7, iou_threshold: 0.4, object_filter: selectedObject }),
      });
      const data = await r.json();
      setDetections(prev => ({ ...prev, [selectedObject]: data[selectedObject] ?? [] }));
    } catch (e) { console.error(e); }
    finally { setDetecting(false); }
  }

  async function persistDetections(next) {
    if (!floorName) return;
    await fetch(`/api/floors/${encodeURIComponent(floorName)}/objects/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(next),
    });
  }

  async function handleSave() {
    if (!floorName) return;
    setSaving(true);
    try {
      await persistDetections(detections);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  }

  async function handleFinish() {
    if (floorName) {
      setSaving(true);
      try {
        await persistDetections(detections);
      } catch (e) { console.error(e); }
      finally { setSaving(false); }
    }
    onFinish?.();
  }

  async function handleDeleteDetection(objName, idx) {
    const next = {
      ...detections,
      [objName]: [...(detections[objName] ?? [])],
    };
    next[objName].splice(idx, 1);
    setDetections(next);
    await persistDetections(next);
  }

  async function handleDeleteTemplate(name) {
    await fetch(`/api/objects/templates/${encodeURIComponent(name)}`, { method: 'DELETE' });
    await loadTemplates();
    const next = { ...detections };
    delete next[name];
    setDetections(next);
    await persistDetections(next);
    if (selectedObject === name) { setSelectedObject(null); setMode('pan'); }
  }

  function handleSidebarClick(name) {
    if (selectedObject === name) {
      setSelectedObject(null);
      setMode('pan');
    } else {
      setSelectedObject(name);
      setMode('add');
    }
  }

  const selectedCount = selectedObject ? (detections[selectedObject]?.length ?? 0) : 0;
  const totalPlaced   = Object.values(detections).reduce((s, l) => s + l.length, 0);
  const isCropMode    = mode === 'crop';

  return (
    <section className="floor-editor object-editor">
      <div className="floor-editor__header">
        <div>
          <span className="eyebrow">Object Mapping</span>
          <p>
            {detecting
              ? `Detecting ${selectedObject}…`
              : isCropMode
                ? 'Drag a box around an example of the object on the floor plan.'
                : selectedObject
                  ? `${selectedObject} selected · ${selectedCount} bounding box${selectedCount !== 1 ? 'es' : ''}. Use Add to draw, Delete to remove.`
                  : totalPlaced > 0
                    ? `${totalPlaced} object${totalPlaced !== 1 ? 's' : ''} placed. Select an object from the sidebar to edit.`
                    : 'Select an object from the sidebar, then draw bounding boxes or run Detect.'}
          </p>
        </div>
        <div className="floor-editor__header-actions">
          <button className="button button--ghost" type="button" onClick={onBack}>Back</button>
          <button
            className="button button--ghost"
            type="button"
            onClick={handleSave}
            disabled={saving || detecting}
          >
            {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save'}
          </button>
          <button className="button button--primary" type="button" onClick={handleFinish} disabled={saving || detecting}>
            {saving ? 'Saving…' : 'Finish'}
          </button>
        </div>
      </div>

      <ObjectToolbar
        mode={mode}
        setMode={setMode}
        onDetect={runDetection}
        detecting={detecting}
        disabled={isCropMode}
        selectedObject={selectedObject}
      />

      <div className="object-editor__body">
        <div className="floor-editor__canvas-wrap object-editor__canvas" ref={setCanvasRef}>
          {detecting && (
            <div className="room-detecting-overlay"><span>Detecting {selectedObject}…</span></div>
          )}
          {canvasSize && floorplan?.url && (
            <DetectionCanvas
              imageUrl={floorplan.url}
              size={canvasSize}
              detections={visibleDetections}
              mode={mode}
              naturalSize={naturalSize}
              onDelete={handleDeleteDetection}
              onBboxDrawn={handleBboxDrawn}
              onCropDrawn={handleCropDrawn}
            />
          )}
          {isCropMode && (
            <div className="obj-crop-hint-bar">
              Drag a box around the object, then release
              <button
                className="button button--ghost"
                type="button"
                style={{ marginLeft: 12, padding: '3px 10px', fontSize: '0.78rem' }}
                onClick={() => setMode('pan')}
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        <aside className="object-sidebar">
          <div className="object-sidebar__header">
            <span className="object-sidebar__title">Objects</span>
            <button
              className="button button--primary object-sidebar__add-btn"
              type="button"
              onClick={() => { setSelectedObject(null); setMode('crop'); }}
              disabled={isCropMode}
            >
              + Add Object
            </button>
          </div>

          {!isCropMode && templates.length > 0 && (
            <p className="object-sidebar__select-prompt">
              Click an object to select it, then draw bounding boxes or run Detect.
            </p>
          )}

          <ul className="object-sidebar__list">
            {templates.length === 0 && !isCropMode && (
              <li className="object-sidebar__empty">
                No objects yet. Click "+ Add Object" to define one.
              </li>
            )}
            {templates.map(tpl => {
              const count    = detections[tpl.name]?.length ?? 0;
              const isActive = selectedObject === tpl.name;
              return (
                <li
                  key={tpl.name}
                  className={`object-sidebar__item${isActive ? ' object-sidebar__item--selected' : ''}`}
                  onClick={() => handleSidebarClick(tpl.name)}
                >
                  {tpl.preview_url && (
                    <img src={tpl.preview_url} alt={tpl.name} className="object-sidebar__thumb" />
                  )}
                  <div className="object-sidebar__info">
                    <span className="object-sidebar__name">{tpl.name}</span>
                    <span className="object-sidebar__meta">
                      {tpl.count} template{tpl.count !== 1 ? 's' : ''}
                      {count > 0 && ` · ${count} placed`}
                    </span>
                  </div>
                  <button
                    className="object-sidebar__delete"
                    type="button"
                    title="Delete object"
                    onClick={e => { e.stopPropagation(); handleDeleteTemplate(tpl.name); }}
                  >
                    ✕
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>
      </div>

      {/* naming modal */}
      {namingObject && (
        <div className="room-rename-backdrop" onClick={cancelNaming}>
          <div className="room-rename-modal" onClick={e => e.stopPropagation()}>
            <h3 className="room-rename-modal__title">Name this Object</h3>
            {pendingCrop?.blob && (
              <div className="obj-modal-preview-wrap">
                <ObjectCropPreview blob={pendingCrop.blob} />
              </div>
            )}
            <input
              className="text-input"
              placeholder="e.g. chair, desk, fire-extinguisher"
              value={objectName}
              onChange={e => setObjectName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleSaveTemplate();
                if (e.key === 'Escape') cancelNaming();
              }}
              autoFocus
            />
            <div className="room-rename-modal__actions">
              <button className="button button--ghost" type="button" onClick={cancelNaming}>
                Cancel
              </button>
              <button
                className="button button--primary"
                type="button"
                onClick={handleSaveTemplate}
                disabled={saving || !objectName.trim()}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function ObjectCropPreview({ blob }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  if (!url) return null;
  return <img src={url} alt="crop preview" className="obj-modal-preview" />;
}
