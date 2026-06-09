export function makeDoor(wallId, start, end) {
  return {
    id: crypto.randomUUID(),
    wallId,
    start, // { x, y } in canvas coords
    end,   // { x, y } in canvas coords
  };
}

export function closestPointOnSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return { x: x1, y: y1, t: 0 };
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  return { x: x1 + t * dx, y: y1 + t * dy, t };
}

// Find the closest point on any wall segment to (px, py), within snapRadius.
// Returns { wallId, x, y } or null.
export function snapToWall(px, py, walls, snapRadius = 16) {
  let best = null;
  let bestDist = snapRadius;
  for (const wall of walls) {
    const [x1, y1, x2, y2] = wall.points;
    const pt = closestPointOnSegment(px, py, x1, y1, x2, y2);
    const d = Math.hypot(px - pt.x, py - pt.y);
    if (d < bestDist) {
      bestDist = d;
      best = { wallId: wall.id, x: pt.x, y: pt.y };
    }
  }
  return best;
}
