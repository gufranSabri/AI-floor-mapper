import { containFit } from '../utils';

// ── wallsToShapes ─────────────────────────────────────────────────────────────
// Converts API wall JSON (image-space coords) → Konva shapes + connections
// (canvas-space coords letterboxed via containFit).

export function wallsToShapes(walls, imgW, imgH, canvasW, canvasH) {
  if (!walls?.length) return { shapes: [], connections: [] };

  const { offsetX, offsetY, scale } = containFit(imgW, imgH, canvasW, canvasH);
  const toCanvas = ([x, y]) => [offsetX + x * scale, offsetY + y * scale];
  const shapeId  = (wallId) => `wall-${wallId}`;
  const wallById = new Map(walls.map(w => [w.id, w]));

  const shapes = [];
  for (const wall of walls) {
    const pts = wall.points;
    if (!pts || pts.length < 2) continue;

    if (wall.type === 'segment') {
      const [ax, ay] = toCanvas(pts[0]);
      const [bx, by] = toCanvas(pts[1]);
      shapes.push({ id: shapeId(wall.id), type: 'line', points: [ax, ay, bx, by], stroke: '#f97316', strokeWidth: 2.5 });
    } else if (wall.type === 'polygon') {
      for (let i = 0; i < pts.length; i++) {
        const [ax, ay] = toCanvas(pts[i]);
        const [bx, by] = toCanvas(pts[(i + 1) % pts.length]);
        shapes.push({ id: `wall-${wall.id}-${i}`, type: 'line', points: [ax, ay, bx, by], stroke: '#f97316', strokeWidth: 2.5 });
      }
    }
  }

  const seen = new Set();
  const connections = [];
  for (const wall of walls) {
    if (wall.type !== 'segment' || !wall.connected_to?.length) continue;
    for (const conn of wall.connected_to) {
      const other = wallById.get(conn.id);
      if (!other || other.type !== 'segment') continue;
      const pairKey = wall.id < conn.id ? `${wall.id}:${conn.id}` : `${conn.id}:${wall.id}`;
      if (seen.has(pairKey)) continue;
      seen.add(pairKey);
      const [cx, cy] = conn.point;
      const endIdxA = _pointMatchesEnd(wall.points, cx, cy);
      const endIdxB = _pointMatchesEnd(other.points, cx, cy);
      if (endIdxA === -1 || endIdxB === -1) continue;
      connections.push({
        id: crypto.randomUUID(),
        lineId: shapeId(wall.id), endIdx: endIdxA,
        lineId2: shapeId(conn.id), endIdx2: endIdxB,
      });
    }
  }

  return { shapes, connections };
}

// ── shapesToWalls ─────────────────────────────────────────────────────────────
// Converts Konva shapes + connections → API wall JSON (image-space coords).

export function shapesToWalls(shapes, connections, imgW, imgH, canvasW, canvasH) {
  const { offsetX, offsetY, scale } = containFit(imgW, imgH, canvasW, canvasH);
  const toImage = (v, offset) => (v - offset) / scale;

  // Extract the original wall ID from the shape ID (format: "wall-<uuid>" or "wall-<n>").
  const wallId = (shapeId) => shapeId.replace(/^wall-/, '');
  const shapeById = new Map(shapes.map(s => [s.id, s]));

  return shapes.map((shape) => {
    const [cx1, cy1, cx2, cy2] = shape.points;
    const p0 = [toImage(cx1, offsetX), toImage(cy1, offsetY)];
    const p1 = [toImage(cx2, offsetX), toImage(cy2, offsetY)];

    const connectedTo = [];
    for (const conn of connections) {
      let otherId = null, selfIdx = null;
      if (conn.lineId === shape.id)       { otherId = conn.lineId2; selfIdx = conn.endIdx;  }
      else if (conn.lineId2 === shape.id) { otherId = conn.lineId;  selfIdx = conn.endIdx2; }
      if (otherId === null) continue;
      const otherShape = shapeById.get(otherId);
      if (!otherShape) continue;
      connectedTo.push({ id: wallId(otherId), point: selfIdx === 0 ? p0 : p1 });
    }

    return { id: wallId(shape.id), type: 'segment', class: 'Wall Internal', points: [p0, p1], connected_to: connectedTo };
  });
}

function _pointMatchesEnd(pts, cx, cy) {
  if (Math.abs(pts[0][0] - cx) <= 1 && Math.abs(pts[0][1] - cy) <= 1) return 0;
  if (Math.abs(pts[1][0] - cx) <= 1 && Math.abs(pts[1][1] - cy) <= 1) return 1;
  return -1;
}
