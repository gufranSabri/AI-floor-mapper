import React, { useRef, useState } from 'react';
import { Stage, Layer, Image as KonvaImage, Rect } from 'react-konva';
import useImage from 'use-image';
import { containFit } from '../utils';

// ── Constants ─────────────────────────────────────────────────────────────────
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 10;
const ZOOM_FACTOR = 1.08;

// ── ImageLayer ────────────────────────────────────────────────────────────────
// Renders an image letterboxed inside the canvas with an optional tint overlay.

function ImageLayer({ src, canvasW, canvasH, tint }) {
  const [image] = useImage(src, 'anonymous');
  if (!image) return null;

  const { offsetX, offsetY, fitW, fitH } = containFit(
    image.naturalWidth || image.width,
    image.naturalHeight || image.height,
    canvasW, canvasH,
  );

  return (
    <>
      <KonvaImage image={image} x={offsetX} y={offsetY} width={fitW} height={fitH} listening={false} />
      {tint && <Rect x={offsetX} y={offsetY} width={fitW} height={fitH} fill={tint} listening={false} />}
    </>
  );
}

// ── KonvaStage ────────────────────────────────────────────────────────────────
// Generic stage with:
//   • scroll-to-zoom (cursor-anchored)
//   • pan mode (drag the stage)
//   • optional background image + tint overlay
//   • children rendered in a second, interactive layer
//
// Props:
//   size          { width, height }
//   mode          string — only 'pan' is handled here; others pass through
//   imageUrl      optional background image URL
//   imageTint     optional CSS color string for overlay (e.g. 'rgba(0,0,0,0.2)')
//   cursor        CSS cursor string
//   onStageClick  (contentPos: {x,y}, e) => void  — fired for bare-stage clicks
//   onStageMouseMove (contentPos: {x,y}) => void
//   children      rendered in the interactive layer

export default function KonvaStage({
  size = { width: 0, height: 0 }, mode, imageUrl, imageTint,
  cursor = 'default',
  passThroughClick = false,
  onStageClick, onStageMouseMove, onStageMouseDown, onStageMouseUp,
  children,
}) {
  const stageRef = useRef();
  const [, setViewport] = useState({ x: 0, y: 0, scale: 1 });
  const isPan = mode === 'pan';

  function getContentPointer() {
    const stage = stageRef.current;
    const pos = stage.getPointerPosition();
    return {
      x: (pos.x - stage.x()) / stage.scaleX(),
      y: (pos.y - stage.y()) / stage.scaleX(),
    };
  }

  function handleWheel(e) {
    e.evt.preventDefault();
    const stage = stageRef.current;
    const pointer = stage.getPointerPosition();
    const oldScale = stage.scaleX();
    const dir = e.evt.deltaY < 0 ? 1 : -1;
    const newScale = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, oldScale * (dir > 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR)));
    const origin = { x: (pointer.x - stage.x()) / oldScale, y: (pointer.y - stage.y()) / oldScale };
    const newPos  = { x: pointer.x - origin.x * newScale,   y: pointer.y - origin.y * newScale };
    stage.scale({ x: newScale, y: newScale });
    stage.position(newPos);
    stage.batchDraw();
    setViewport({ scale: newScale, ...newPos });
  }

  function handleDragMove(e) {
    if (!isPan) return;
    setViewport(v => ({ ...v, x: e.target.x(), y: e.target.y() }));
  }

  function handleClick(e) {
    if (isPan) return;
    // In passthrough modes (e.g. door placement) every click counts, not just bare-stage clicks.
    if (!passThroughClick && e.target !== e.target.getStage() && e.target.name() !== 'bg') return;
    onStageClick?.(getContentPointer(), e);
  }

  function handleMouseMove() {
    onStageMouseMove?.(getContentPointer());
  }

  function handleMouseDown() {
    if (!isPan) onStageMouseDown?.(getContentPointer());
  }

  function handleMouseUp() {
    if (!isPan) onStageMouseUp?.(getContentPointer());
  }

  return (
    <Stage
      ref={stageRef}
      width={size.width}
      height={size.height}
      style={{ cursor, display: 'block' }}
      draggable={isPan}
      onDragMove={handleDragMove}
      onDragEnd={handleDragMove}
      onWheel={handleWheel}
      onClick={handleClick}
      onMouseMove={handleMouseMove}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
    >
      {imageUrl && (
        <Layer listening={false}>
          <ImageLayer src={imageUrl} canvasW={size.width} canvasH={size.height} tint={imageTint} />
        </Layer>
      )}

      <Layer>
        {children}
      </Layer>
    </Stage>
  );
}
