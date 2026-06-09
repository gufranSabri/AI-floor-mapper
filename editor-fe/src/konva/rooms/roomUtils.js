// Point-in-polygon test using ray casting (flat [x0,y0,x1,y1,...] points array).
export function pointInPolygon(px, py, flatPts) {
  let inside = false;
  const n = flatPts.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = flatPts[i * 2], yi = flatPts[i * 2 + 1];
    const xj = flatPts[j * 2], yj = flatPts[j * 2 + 1];
    const intersect = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// Among all rooms, find the smallest one containing the point.
export function hitTestRooms(px, py, rooms) {
  const hits = rooms.filter(r => pointInPolygon(px, py, r.points));
  if (!hits.length) return null;
  return hits.reduce((best, r) => (r.area < best.area ? r : best));
}

// Semantic fill colours:
//   index 0  = floor boundary  → light teal
//   active   → green
//   inactive → grey
const COLOURS = {
  floor:          { fill: 'rgba(234,179,8,0.15)',   fillHover: 'rgba(234,179,8,0.32)',   stroke: 'rgba(234,179,8,0.55)'  },
  active:         { fill: 'rgba(34,197,94,0.15)',   fillHover: 'rgba(34,197,94,0.32)',   stroke: 'rgba(34,197,94,0.55)'  },
  activeDelete:   { fill: 'rgba(34,197,94,0.15)',   fillHover: 'rgba(181,68,68,0.28)',   stroke: 'rgba(181,68,68,0.60)'  },
  inactive:       { fill: 'rgba(239,68,68,0.15)',   fillHover: 'rgba(239,68,68,0.30)',   stroke: 'rgba(239,68,68,0.55)'  },
  inactiveDelete: { fill: 'rgba(239,68,68,0.15)',   fillHover: 'rgba(181,68,68,0.35)',   stroke: 'rgba(181,68,68,0.65)'  },
};

export function roomColours(isFloor, status, mode, hovered) {
  const isDelete = mode === 'delete';

  if (isFloor) {
    const c = COLOURS.floor;
    return { fill: hovered ? c.fillHover : c.fill, stroke: c.stroke };
  }

  if (status === 'inactive') {
    const c = isDelete ? COLOURS.inactiveDelete : COLOURS.inactive;
    return { fill: hovered ? c.fillHover : c.fill, stroke: c.stroke };
  }

  // active
  const c = isDelete ? COLOURS.activeDelete : COLOURS.active;
  return { fill: hovered ? c.fillHover : c.fill, stroke: c.stroke };
}
