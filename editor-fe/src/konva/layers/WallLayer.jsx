import React from 'react';
import { Line, Circle, Group } from 'react-konva';

// ── Constants ─────────────────────────────────────────────────────────────────
const EP_RADIUS = 6;
const EP_HIT    = 14;

// ── CanvasLine ────────────────────────────────────────────────────────────────
// Renders a single wall segment: the line body + two draggable endpoint circles.

function CanvasLine({
  shape, isSelected, mode, connectBuffer, mergeBuffer, isConnected,
  splitPoint, onSelect, onMoveEndpoint, onCommitEndpoint, onMoveLine,
  onEndpointClick, onDisconnectEndpoint,
  onLineMouseMove, onLineMouseLeave, onLineSplitClick, onMergeClick,
  onDrawEndpointClick, onDeleteShape,
}) {
  const pts          = shape.points;
  const isDisconnect = mode === 'disconnect';
  const isSplit      = mode === 'split';
  const isSelect     = mode === 'select';
  const isMerge      = mode === 'merge';
  const isDelete     = mode === 'delete';
  const isMergeFirst = isMerge && mergeBuffer === shape.id;

  function epStroke(idx) {
    if (isDisconnect && isConnected(idx))                                    return '#e05555';
    if (connectBuffer?.lineId === shape.id && connectBuffer?.endIdx === idx) return '#f59e0b';
    if (isConnected(idx))                                                    return '#f59e0b';
    if (isSelected)                                                          return '#16a34a';
    return '#22c55e';
  }

  function epFill(idx) {
    if (isDisconnect && isConnected(idx))                                    return '#e05555';
    if (connectBuffer?.lineId === shape.id && connectBuffer?.endIdx === idx) return 'rgba(245,158,11,0.2)';
    if (isConnected(idx))                                                    return 'rgba(245,158,11,0.2)';
    return 'rgba(34,197,94,0.2)';
  }

  let lineColor = isSelected ? '#ea580c' : '#f97316';
  if (isMergeFirst) lineColor = '#a855f7';
  if (isDelete)     lineColor = '#ef4444';

  function handleLineDragEnd(e) {
    const dx = e.target.x(), dy = e.target.y();
    e.target.position({ x: 0, y: 0 });
    onMoveLine(dx, dy);
  }

  return (
    <Group>
      <Line
        points={shape.points}
        stroke={isSplit && splitPoint ? '#f59e0b' : lineColor}
        strokeWidth={shape.strokeWidth}
        lineCap="round"
        lineJoin="round"
        hitStrokeWidth={14}
        draggable={isSelect && isSelected}
        onDragStart={() => onSelect()}
        onDragEnd={handleLineDragEnd}
        onClick={(e) => {
          if (isDelete) { onDeleteShape?.(); return; }
          if (mode === 'select') onSelect();
          else if (isSplit) onLineSplitClick?.(e);
          else if (isMerge) onMergeClick?.();
        }}
        onTap={() => {
          if (isDelete) { onDeleteShape?.(); return; }
          if (mode === 'select') onSelect();
          else if (isMerge) onMergeClick?.();
        }}
        onMouseMove={isSplit ? (e) => onLineMouseMove(e) : undefined}
        onMouseLeave={isSplit ? onLineMouseLeave : undefined}
        shadowEnabled={isSelected || isMergeFirst}
        shadowColor={isMergeFirst ? '#a855f7' : '#ea580c'}
        shadowBlur={10}
        shadowOpacity={0.5}
      />

      {isSplit && splitPoint && (
        <Circle
          x={splitPoint.x} y={splitPoint.y}
          radius={7} fill="#f59e0b" stroke="#fff" strokeWidth={2}
          opacity={0.9} listening={false}
        />
      )}

      {[0, 1].map(idx => (
        <Circle
          key={idx}
          x={pts[idx * 2]} y={pts[idx * 2 + 1]}
          radius={EP_RADIUS} hitRadius={EP_HIT}
          fill={epFill(idx)} stroke={epStroke(idx)} strokeWidth={2}
          draggable={isSelect}
          onDragStart={(e) => { e.cancelBubble = true; }}
          onDragMove={(e) => onMoveEndpoint(idx, e.target.x(), e.target.y())}
          onDragEnd={(e) => { e.cancelBubble = true; onCommitEndpoint(idx, e.target.x(), e.target.y()); }}
          onClick={(e) => {
            e.cancelBubble = true;
            if (isDelete) { onDeleteShape?.(); return; }
            if (mode === 'line') onDrawEndpointClick?.({ x: pts[idx * 2], y: pts[idx * 2 + 1] });
            else if (mode === 'connect') onEndpointClick(idx);
            else if (isDisconnect && isConnected(idx)) onDisconnectEndpoint(idx);
            else if (isSelect) onSelect();
          }}
          onTap={(e) => {
            e.cancelBubble = true;
            if (isDelete) { onDeleteShape?.(); return; }
            if (mode === 'line') onDrawEndpointClick?.({ x: pts[idx * 2], y: pts[idx * 2 + 1] });
            else if (mode === 'connect') onEndpointClick(idx);
            else if (isDisconnect && isConnected(idx)) onDisconnectEndpoint(idx);
          }}
        />
      ))}
    </Group>
  );
}

// ── WallLayer ─────────────────────────────────────────────────────────────────
// Renders all wall shapes + the in-progress draw preview line.
// Intended to be used as children of KonvaStage.
//
// Props:
//   state         — from useConnectionStore
//   actions       — from useConnectionStore
//   splitHover    { lineId, x, y } | null
//   lineStart     { x, y } | null  (draw-mode first click)
//   previewEnd    { x, y } | null  (draw-mode cursor position)

export default function WallLayer({
  state, actions,
  splitHover, lineStart, previewEnd,
}) {
  const { shapes, connections, selectedId, mode, connectBuffer, mergeBuffer } = state;
  const {
    select, moveEndpoint, moveEndpointLive, moveLine,
    addConnection, setConnectBuffer, disconnectEndpoint,
    setMergeBuffer, mergeWalls, splitLine, deleteShape,
  } = actions;

  function isConnected(lineId, endIdx) {
    return connections.some(c =>
      (c.lineId === lineId && c.endIdx === endIdx) ||
      (c.lineId2 === lineId && c.endIdx2 === endIdx)
    );
  }

  function handleEndpointClick(lineId, endIdx) {
    if (mode !== 'connect') return;
    if (!connectBuffer) { setConnectBuffer({ lineId, endIdx }); return; }
    if (connectBuffer.lineId === lineId && connectBuffer.endIdx === endIdx) { setConnectBuffer(null); return; }
    const lineA = shapes.find(s => s.id === connectBuffer.lineId);
    const ax = lineA.points[connectBuffer.endIdx * 2];
    const ay = lineA.points[connectBuffer.endIdx * 2 + 1];
    moveEndpoint(lineId, endIdx, ax, ay);
    addConnection({ lineId: connectBuffer.lineId, endIdx: connectBuffer.endIdx, lineId2: lineId, endIdx2: endIdx });
  }

  function handleMergeClick(lineId) {
    if (mode !== 'merge') return;
    if (!mergeBuffer) { setMergeBuffer(lineId); return; }
    if (mergeBuffer === lineId) { setMergeBuffer(null); return; }
    const wallA = shapes.find(s => s.id === mergeBuffer);
    const wallB = shapes.find(s => s.id === lineId);
    if (!wallA || !wallB) { setMergeBuffer(null); return; }
    const lenA = Math.hypot(wallA.points[2] - wallA.points[0], wallA.points[3] - wallA.points[1]);
    const lenB = Math.hypot(wallB.points[2] - wallB.points[0], wallB.points[3] - wallB.points[1]);
    const keepId   = lenA >= lenB ? mergeBuffer : lineId;
    const removeId = lenA >= lenB ? lineId : mergeBuffer;
    mergeWalls(keepId, removeId);
  }

  const lines = shapes.filter(s => s.type === 'line');

  return (
    <>
      {lines.map(shape => (
        <CanvasLine
          key={shape.id}
          shape={shape}
          isSelected={selectedId === shape.id}
          mode={mode}
          connectBuffer={connectBuffer}
          mergeBuffer={mergeBuffer}
          isConnected={(endIdx) => isConnected(shape.id, endIdx)}
          splitPoint={splitHover?.lineId === shape.id ? { x: splitHover.x, y: splitHover.y } : null}
          onSelect={() => select(shape.id)}
          onMoveEndpoint={(endIdx, x, y) => moveEndpointLive(shape.id, endIdx, x, y)}
          onCommitEndpoint={(endIdx, x, y) => moveEndpoint(shape.id, endIdx, x, y)}
          onMoveLine={(dx, dy) => moveLine(shape.id, dx, dy)}
          onEndpointClick={(endIdx) => handleEndpointClick(shape.id, endIdx)}
          onDisconnectEndpoint={(endIdx) => disconnectEndpoint(shape.id, endIdx)}
          onLineMouseMove={(e) => {
            const stage = e.target.getStage();
            const ptr   = stage.getPointerPosition();
            const pos   = { x: (ptr.x - stage.x()) / stage.scaleX(), y: (ptr.y - stage.y()) / stage.scaleX() };
            actions.onLineSplitMouseMove?.(shape.id, pos);
          }}
          onLineMouseLeave={() => actions.onLineSplitMouseLeave?.(shape.id)}
          onLineSplitClick={() => splitLine && splitHover?.lineId === shape.id && splitLine(shape.id, splitHover.x, splitHover.y)}
          onMergeClick={() => handleMergeClick(shape.id)}
          onDrawEndpointClick={actions.onDrawEndpointClick}
          onDeleteShape={() => deleteShape(shape.id)}
        />
      ))}

      {mode === 'line' && lineStart && previewEnd && (
        <Line
          points={[lineStart.x, lineStart.y, previewEnd.x, previewEnd.y]}
          stroke="#f97316" strokeWidth={2} dash={[6, 4]} opacity={0.55} listening={false}
        />
      )}
    </>
  );
}
