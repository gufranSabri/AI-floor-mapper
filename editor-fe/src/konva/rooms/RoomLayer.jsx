import React from 'react';
import { Line, Rect } from 'react-konva';
import { roomColours } from './roomUtils';

// Rooms are sorted largest-to-smallest by the backend (index 0 = floor boundary).
export default function RoomLayer({ rooms, mode, hoveredId, onHover, onClick, dragRect }) {
  const isDelete = mode === 'delete';

  return (
    <>
      {rooms.map((room, idx) => {
        const isFloor = idx === 0;
        const hovered = hoveredId === room.id;
        const { fill, stroke } = roomColours(isFloor, room.status, mode, hovered);

        // In delete mode only non-wall rooms are interactive; wall rooms are dimmed.
        const isWallRoom = room.wall_ids !== null;
        const suppressDelete = isDelete && isWallRoom;

        return (
          <Line
            key={room.id}
            points={room.points}
            closed
            fill={fill}
            stroke={stroke}
            strokeWidth={hovered ? 2 : 1}
            opacity={suppressDelete ? 0.4 : 1}
            listening={!suppressDelete}
            onMouseEnter={() => !suppressDelete && onHover(room.id)}
            onMouseLeave={() => onHover(null)}
            onClick={() => !suppressDelete && onClick(room)}
            onTap={() => !suppressDelete && onClick(room)}
          />
        );
      })}

      {/* Drag-to-draw preview */}
      {dragRect && (
        <Rect
          x={dragRect.x}
          y={dragRect.y}
          width={dragRect.w}
          height={dragRect.h}
          fill="rgba(28,107,94,0.12)"
          stroke="rgba(28,107,94,0.7)"
          strokeWidth={1.5}
          dash={[6, 4]}
          listening={false}
        />
      )}
    </>
  );
}
