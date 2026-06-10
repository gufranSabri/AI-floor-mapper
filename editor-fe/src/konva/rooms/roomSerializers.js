import { containFit } from '../utils';

// Convert API rooms (image-space polygons) → canvas-space room objects.
export function roomsToCanvas(rooms, imgW, imgH, canvasW, canvasH) {
  if (!rooms?.length) return [];
  const { offsetX, offsetY, scale } = containFit(imgW, imgH, canvasW, canvasH);

  return rooms.map(room => ({
    id: room.id,
    name: room.name,
    area: room.area,
    status: room.status ?? 'active',
    category: room.category ?? null,
    wall_ids: room.wall_ids ?? null,   // null = manually drawn (non-wall room)
    points: room.polygon.flatMap(([x, y]) => [
      offsetX + x * scale,
      offsetY + y * scale,
    ]),
  }));
}

// Convert canvas-space rooms → API rooms (image-space polygons).
export function canvasToRooms(rooms, imgW, imgH, canvasW, canvasH) {
  const { offsetX, offsetY, scale } = containFit(imgW, imgH, canvasW, canvasH);

  return rooms.map(room => {
    const pts = room.points;
    const polygon = [];
    for (let i = 0; i < pts.length; i += 2) {
      polygon.push([(pts[i] - offsetX) / scale, (pts[i + 1] - offsetY) / scale]);
    }
    return {
      id: room.id,
      name: room.name,
      area: room.area,
      status: room.status ?? 'active',
      category: room.category ?? null,
      wall_ids: room.wall_ids ?? null,
      polygon,
    };
  });
}
