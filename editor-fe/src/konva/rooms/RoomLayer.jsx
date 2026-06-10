import React from 'react';
import { Line, Rect, Circle, Label, Tag, Text, Group } from 'react-konva';
import { roomColours, categoryStroke } from './roomUtils';

function polygonCentroid(points) {
  const n = points.length / 2;
  let x = 0, y = 0;
  for (let i = 0; i < points.length; i += 2) {
    x += points[i];
    y += points[i + 1];
  }
  return { x: x / n, y: y / n };
}

// Rooms are sorted largest-to-smallest by the backend (index 0 = floor boundary).
export default function RoomLayer({ rooms, mode, hoveredId, onHover, onClick, dragRect }) {
  const isDelete = mode === 'delete';

  return (
    <>
      {rooms.map((room, idx) => {
        const isFloor = idx === 0;
        const hovered = hoveredId === room.id;
        const { fill, stroke } = roomColours(room.category, room.status, mode, hovered);
        const labelColor = categoryStroke(room.category);

        // In delete mode only non-wall rooms are interactive; wall rooms are dimmed.
        const isWallRoom = room.wall_ids !== null;
        const suppressDelete = isDelete && isWallRoom;

        const { x: cx, y: cy } = polygonCentroid(room.points);

        return (
          <React.Fragment key={room.id}>
            <Line
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
            <Group listening={false} opacity={suppressDelete ? 0.4 : 1}>
              <Circle
                x={cx} y={cy}
                radius={4}
                fill="black"
                stroke="white"
                strokeWidth={1.5}
              />
              <Label x={cx + 9} y={cy - 7}>
                <Tag fill="white" opacity={0.82} cornerRadius={2} />
                <Text
                  text={room.name}
                  fontSize={11}
                  fontFamily="sans-serif"
                  fontStyle="600"
                  fill={labelColor}
                  padding={3}
                />
              </Label>
            </Group>
          </React.Fragment>
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
