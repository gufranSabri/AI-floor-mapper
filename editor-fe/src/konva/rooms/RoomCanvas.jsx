import React, { useState, useRef } from 'react';
import KonvaStage from '../stage/KonvaStage';
import RoomLayer from './RoomLayer';

const MIN_DRAG_PX = 6; // ignore accidental micro-drags

function getCursor(mode, isDragging) {
  if (mode === 'pan')    return 'grab';
  if (mode === 'delete') return 'not-allowed';
  if (mode === 'toggle') return 'pointer';
  if (mode === 'add')    return isDragging ? 'crosshair' : 'cell';
  return 'default';
}

export default function RoomCanvas({ roomState, roomActions, imageUrl, size }) {
  const { rooms, mode } = roomState;
  const { onRoomClick, onAddRoom } = roomActions;

  const [hoveredId,  setHoveredId]  = useState(null);
  const [dragStart,  setDragStart]  = useState(null); // { x, y } content coords
  const [dragRect,   setDragRect]   = useState(null); // { x, y, w, h } content coords
  const isDragging = dragRect !== null;

  function handleMouseDown(pos) {
    if (mode !== 'add') return;
    setDragStart(pos);
    setDragRect(null);
  }

  function handleMouseMove(pos) {
    if (mode !== 'add' || !dragStart) return;
    const w = pos.x - dragStart.x;
    const h = pos.y - dragStart.y;
    if (Math.abs(w) < MIN_DRAG_PX && Math.abs(h) < MIN_DRAG_PX) return;
    setDragRect({ x: Math.min(dragStart.x, pos.x), y: Math.min(dragStart.y, pos.y), w: Math.abs(w), h: Math.abs(h) });
  }

  function handleMouseUp(pos) {
    if (mode !== 'add' || !dragStart) return;
    if (dragRect && dragRect.w > MIN_DRAG_PX && dragRect.h > MIN_DRAG_PX) {
      onAddRoom(dragRect);
    }
    setDragStart(null);
    setDragRect(null);
  }

  function handleClick(room) {
    if (mode === 'add') return; // clicks during add mode are handled by drag
    onRoomClick(room);
  }

  return (
    <KonvaStage
      size={size}
      mode={mode}
      imageUrl={imageUrl}
      imageTint="rgba(100, 130, 200, 0.18)"
      cursor={getCursor(mode, isDragging)}
      passThroughClick={false}
      onStageMouseDown={handleMouseDown}
      onStageMouseMove={handleMouseMove}
      onStageMouseUp={handleMouseUp}
    >
      <RoomLayer
        rooms={rooms}
        mode={mode}
        hoveredId={hoveredId}
        onHover={setHoveredId}
        onClick={handleClick}
        dragRect={dragRect}
      />
    </KonvaStage>
  );
}
