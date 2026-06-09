import React from 'react';
import { Line, Circle, Group } from 'react-konva';

const SNAP_RADIUS = 8;

// A single door rendered as a red line with small endpoint circles.
function DoorLine({ door, mode, onDelete }) {
  const isDelete = mode === 'delete';
  return (
    <Group>
      <Line
        points={[door.start.x, door.start.y, door.end.x, door.end.y]}
        stroke={isDelete ? '#dc2626' : '#ef4444'}
        strokeWidth={3}
        lineCap="round"
        hitStrokeWidth={12}
        shadowEnabled={isDelete}
        shadowColor="#dc2626"
        shadowBlur={6}
        shadowOpacity={0.45}
        onClick={() => { if (isDelete) onDelete(); }}
        onTap={() => { if (isDelete) onDelete(); }}
      />
      {[door.start, door.end].map((pt, i) => (
        <Circle
          key={i}
          x={pt.x} y={pt.y}
          radius={4}
          fill="#ef4444"
          stroke="#fff"
          strokeWidth={1.5}
          listening={false}
        />
      ))}
    </Group>
  );
}

// DoorLayer renders:
//   - all wall segments (read-only, dimmed orange)
//   - all doors (red lines)
//   - an in-progress door preview while placing the first/second point
//   - a snap indicator circle when cursor is on a wall
export default function DoorLayer({
  walls,           // array of shape objects { id, points: [x1,y1,x2,y2], ... }
  doors,           // array of door objects { id, wallId, start, end }
  mode,            // 'select' | 'add-door' | 'delete' | 'pan'
  doorStart,       // { x, y } | null  — first placed point
  previewEnd,      // { x, y } | null  — cursor snap point
  snapPoint,       // { x, y } | null  — highlighted snap circle
  onDeleteDoor,    // (id) => void
}) {
  return (
    <>
      {/* Read-only wall segments */}
      {walls.map(wall => (
        <Line
          key={wall.id}
          points={wall.points}
          stroke="rgba(249,115,22,0.85)"
          strokeWidth={4}
          lineCap="round"
          listening={false}
        />
      ))}

      {/* Placed doors */}
      {doors.map(door => (
        <DoorLine
          key={door.id}
          door={door}
          mode={mode}
          onDelete={() => onDeleteDoor(door.id)}
        />
      ))}

      {/* In-progress door preview */}
      {mode === 'add-door' && doorStart && previewEnd && (
        <Line
          points={[doorStart.x, doorStart.y, previewEnd.x, previewEnd.y]}
          stroke="#ef4444"
          strokeWidth={2.5}
          dash={[6, 4]}
          opacity={0.65}
          listening={false}
        />
      )}

      {/* First-point anchor while drawing */}
      {mode === 'add-door' && doorStart && (
        <Circle
          x={doorStart.x} y={doorStart.y}
          radius={5}
          fill="#ef4444"
          stroke="#fff"
          strokeWidth={2}
          listening={false}
        />
      )}

      {/* Snap indicator */}
      {(mode === 'add-door') && snapPoint && (
        <Circle
          x={snapPoint.x} y={snapPoint.y}
          radius={7}
          fill="rgba(239,68,68,0.25)"
          stroke="#ef4444"
          strokeWidth={2}
          listening={false}
        />
      )}
    </>
  );
}
