import React, { useState } from 'react';
import KonvaStage from '../stage/KonvaStage';
import DoorLayer from './DoorLayer';
import { makeDoor, snapToWall } from './doorUtils';

function getCursor(mode, snapPoint) {
  if (mode === 'pan')      return 'grab';
  if (mode === 'add-door') return snapPoint ? 'crosshair' : 'default';
  if (mode === 'delete')   return 'not-allowed';
  return 'default';
}

export default function DoorCanvas({ walls, doorState, doorActions, imageUrl, size }) {
  const { doors, mode } = doorState;
  const { addDoor, deleteDoor } = doorActions;

  const [doorStart,  setDoorStart]  = useState(null); // first snap point
  const [previewEnd, setPreviewEnd] = useState(null); // cursor snap position
  const [snapPoint,  setSnapPoint]  = useState(null); // highlighted indicator

  function getSnap(pos) {
    return snapToWall(pos.x, pos.y, walls);
  }

  function handleStageClick(pos) {
    if (mode !== 'add-door') return;

    const snap = getSnap(pos);
    if (!snap) return; // must click on a wall

    if (!doorStart) {
      setDoorStart(snap);
      setPreviewEnd(snap);
    } else {
      // Both points must be on a wall (the same or different).
      // We allow the start and end to be on different walls but
      // the door is saved against the wall the start is on.
      if (snap.x === doorStart.x && snap.y === doorStart.y) return; // same point
      addDoor(makeDoor(doorStart.wallId, { x: doorStart.x, y: doorStart.y }, { x: snap.x, y: snap.y }));
      setDoorStart(null);
      setPreviewEnd(null);
      setSnapPoint(null);
    }
  }

  function handleMouseMove(pos) {
    if (mode !== 'add-door') {
      if (snapPoint) setSnapPoint(null);
      if (previewEnd) setPreviewEnd(null);
      return;
    }
    const snap = getSnap(pos);
    setSnapPoint(snap ? { x: snap.x, y: snap.y } : null);
    if (doorStart) setPreviewEnd(snap ? { x: snap.x, y: snap.y } : { x: pos.x, y: pos.y });
  }

  return (
    <KonvaStage
      size={size}
      mode={mode}
      imageUrl={imageUrl}
      imageTint="rgba(180, 150, 230, 0.28)"
      cursor={getCursor(mode, snapPoint)}
      passThroughClick={mode === 'add-door'}
      onStageClick={handleStageClick}
      onStageMouseMove={handleMouseMove}
    >
      <DoorLayer
        walls={walls}
        doors={doors}
        mode={mode}
        doorStart={doorStart}
        previewEnd={previewEnd}
        snapPoint={snapPoint}
        onDeleteDoor={deleteDoor}
      />
    </KonvaStage>
  );
}
