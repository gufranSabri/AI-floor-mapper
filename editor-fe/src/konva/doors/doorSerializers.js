import { containFit } from '../utils';

// Convert API doors JSON (image-space) → canvas-space door objects.
export function doorsToCanvas(doors, walls, imgW, imgH, canvasW, canvasH) {
  if (!doors?.length) return [];
  const { offsetX, offsetY, scale } = containFit(imgW, imgH, canvasW, canvasH);

  // Build a map from API wall id → canvas shape id
  const wallIdMap = new Map();
  if (walls) {
    walls.forEach(w => wallIdMap.set(w.id, `wall-${w.id}`));
  }

  return doors.map(door => ({
    id: crypto.randomUUID(),
    wallId: wallIdMap.get(door.wall_id) ?? String(door.wall_id),
    start: {
      x: offsetX + door.start[0] * scale,
      y: offsetY + door.start[1] * scale,
    },
    end: {
      x: offsetX + door.end[0] * scale,
      y: offsetY + door.end[1] * scale,
    },
  }));
}

// Convert canvas-space doors → API doors JSON (image-space).
export function canvasToDoors(doors, imgW, imgH, canvasW, canvasH) {
  const { offsetX, offsetY, scale } = containFit(imgW, imgH, canvasW, canvasH);

  return doors.map(door => {
    // Extract numeric wall id from shape id like "wall-3" → 3
    const rawId = door.wallId.replace(/^wall-/, '');
    const wallId = isNaN(Number(rawId)) ? rawId : Number(rawId);
    return {
      wall_id: wallId,
      start: [(door.start.x - offsetX) / scale, (door.start.y - offsetY) / scale],
      end:   [(door.end.x   - offsetX) / scale, (door.end.y   - offsetY) / scale],
    };
  });
}
