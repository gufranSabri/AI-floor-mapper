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

const CATEGORY_COLOURS = {
  floor_space:   { fill: 'rgba(234,179,8,0.15)',   fillHover: 'rgba(234,179,8,0.32)',   stroke: 'rgba(202,153,0,0.75)'   },
  closed_office: { fill: 'rgba(59,130,246,0.15)',  fillHover: 'rgba(59,130,246,0.30)',  stroke: 'rgba(37,99,235,0.75)'   },
  open_office:   { fill: 'rgba(34,197,94,0.15)',   fillHover: 'rgba(34,197,94,0.32)',   stroke: 'rgba(22,163,74,0.75)'   },
  toilet:        { fill: 'rgba(236,72,153,0.15)',  fillHover: 'rgba(236,72,153,0.30)',  stroke: 'rgba(219,39,119,0.75)'  },
  other:         { fill: 'rgba(107,114,128,0.15)', fillHover: 'rgba(107,114,128,0.30)', stroke: 'rgba(75,85,99,0.75)'    },
};

const DELETE_HOVER = { fill: 'rgba(181,68,68,0.28)', stroke: 'rgba(181,68,68,0.70)' };
const INACTIVE     = { fill: 'rgba(239,68,68,0.12)', fillHover: 'rgba(239,68,68,0.25)', stroke: 'rgba(239,68,68,0.55)' };

export function categoryStroke(category) {
  return (CATEGORY_COLOURS[category] ?? CATEGORY_COLOURS.floor_space).stroke;
}

export function roomColours(category, status, mode, hovered) {
  const isDelete = mode === 'delete';

  if (status === 'inactive') {
    if (isDelete && hovered) return { fill: DELETE_HOVER.fill, stroke: DELETE_HOVER.stroke };
    return { fill: hovered ? INACTIVE.fillHover : INACTIVE.fill, stroke: INACTIVE.stroke };
  }

  if (isDelete && hovered) return { fill: DELETE_HOVER.fill, stroke: DELETE_HOVER.stroke };
  const c = CATEGORY_COLOURS[category] ?? CATEGORY_COLOURS.floor_space;
  return { fill: hovered ? c.fillHover : c.fill, stroke: c.stroke };
}
