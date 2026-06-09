import React, { useState } from 'react';
import KonvaStage from '../stage/KonvaStage';
import WallLayer from '../layers/WallLayer';
import { makeLine } from './wallUtils';

// ── Cursor map ────────────────────────────────────────────────────────────────
function getCursor(mode, splitHover) {
  if (mode === 'pan')    return 'grab';
  if (mode === 'line')   return 'crosshair';
  if (mode === 'connect') return 'cell';
  if (mode === 'split')  return splitHover ? 'crosshair' : 'default';
  if (mode === 'delete') return 'not-allowed';
  return 'default';
}

// ── WallCanvas ────────────────────────────────────────────────────────────────
// Composes KonvaStage + WallLayer with wall-editor interaction logic:
//   • click-to-draw lines (line mode)
//   • split hover tracking (split mode)
//
// Props:
//   state     — from useConnectionStore
//   actions   — from useConnectionStore
//   imageUrl  — background image URL
//   size      { width, height }

const SNAP_RADIUS = 12;

export default function WallCanvas({ state, actions, imageUrl, size }) {
  const { mode, shapes } = state;
  const { addShape, deselect, splitLine } = actions;

  const [lineStart,  setLineStart]  = useState(null);
  const [previewEnd, setPreviewEnd] = useState(null);
  const [splitHover, setSplitHover] = useState(null);

  function snapToEndpoint(pos) {
    const lines = shapes.filter(s => s.type === 'line');
    for (const line of lines) {
      for (let i = 0; i < 2; i++) {
        const ex = line.points[i * 2], ey = line.points[i * 2 + 1];
        if (Math.hypot(pos.x - ex, pos.y - ey) <= SNAP_RADIUS) return { x: ex, y: ey };
      }
    }
    return pos;
  }

  function closestPointOnSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return { x: x1, y: y1 };
    const t = Math.max(0.05, Math.min(0.95, ((px - x1) * dx + (py - y1) * dy) / lenSq));
    return { x: x1 + t * dx, y: y1 + t * dy };
  }

  function handleStageClick(pos) {
    if (mode === 'select') { deselect(); return; }
    if (mode === 'line') {
      const snapped = snapToEndpoint(pos);
      if (!lineStart) {
        setLineStart(snapped);
        setPreviewEnd(snapped);
      } else {
        addShape(makeLine(lineStart.x, lineStart.y, snapped.x, snapped.y));
        setLineStart(null);
        setPreviewEnd(null);
      }
    }
  }

  function handleMouseMove(pos) {
    if (mode === 'line' && lineStart) setPreviewEnd(snapToEndpoint(pos));
    if (mode !== 'split' && splitHover) setSplitHover(null);
    if (mode === 'split') {
      // Update splitHover for whichever line the pointer is currently over.
      // WallLayer fires onLineMouseMove per-line; we track it here centrally.
    }
  }

  // Expose split hover handlers to WallLayer via actions extension
  const extendedActions = {
    ...actions,
    onLineSplitMouseMove(lineId) {
      if (mode !== 'split') return;
      // We can't call getContentPointer here — KonvaStage owns the stage ref.
      // Instead WallLayer passes the raw konva event; we read it via a callback.
    },
    onLineSplitMouseLeave(lineId) {
      if (mode !== 'split') return;
      setSplitHover(prev => (prev?.lineId === lineId ? null : prev));
    },
  };

  // KonvaStage exposes onStageMouseMove with the content-space pointer.
  // We use it to update the split snap point when hovering over a wall.
  function handleStageMoveForSplit(pos) {
    if (mode !== 'split' || !splitHover) return;
    const line = shapes.find(s => s.id === splitHover.lineId);
    if (!line) { setSplitHover(null); return; }
    const [x1, y1, x2, y2] = line.points;
    const pt = closestPointOnSegment(pos.x, pos.y, x1, y1, x2, y2);
    setSplitHover(prev => prev ? { ...prev, x: pt.x, y: pt.y } : null);
  }

  // WallLayer needs to trigger split hover when the pointer enters a line.
  // We patch in an onLineMouseMove that sets the hovered line and computes snap.
  const wallLayerActions = {
    ...extendedActions,
    onLineSplitMouseMove(lineId, pos) {
      if (mode !== 'split' || !pos) return;
      const line = shapes.find(s => s.id === lineId);
      if (!line) return;
      const [x1, y1, x2, y2] = line.points;
      const pt = closestPointOnSegment(pos.x, pos.y, x1, y1, x2, y2);
      setSplitHover({ lineId, x: pt.x, y: pt.y });
    },
    splitLine(lineId, x, y) {
      splitLine(lineId, x, y);
      setSplitHover(null);
    },
    onDrawEndpointClick(pos) {
      if (mode !== 'line') return;
      if (!lineStart) {
        setLineStart(pos);
        setPreviewEnd(pos);
      } else {
        addShape(makeLine(lineStart.x, lineStart.y, pos.x, pos.y));
        setLineStart(null);
        setPreviewEnd(null);
      }
    },
  };

  return (
    <KonvaStage
      size={size}
      mode={mode}
      imageUrl={imageUrl}
      imageTint="rgba(180, 150, 230, 0.28)"
      cursor={getCursor(mode, splitHover)}
      onStageClick={handleStageClick}
      onStageMouseMove={(pos) => { handleMouseMove(pos); handleStageMoveForSplit(pos); }}
    >
      <WallLayer
        state={state}
        actions={wallLayerActions}
        splitHover={splitHover}
        lineStart={lineStart}
        previewEnd={previewEnd}
      />
    </KonvaStage>
  );
}
