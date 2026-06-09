from __future__ import annotations


def detect_rooms_from_walls(walls: list[dict]) -> list[dict]:
    """
    Derive rooms by polygonizing the wall network using Shapely.

    Args:
        walls: list of wall dicts with 'id' and 'points' keys,
               where points is a list of [x, y] coordinate pairs.

    Returns:
        list of room dicts with id, name, polygon, area, status, wall_ids.
    """
    from shapely.geometry import LineString
    from shapely.ops import polygonize, unary_union

    segments: list[tuple[str, LineString]] = []
    for w in walls:
        pts = w.get("points", [])
        if len(pts) < 2:
            continue
        segments.append((w["id"], LineString([tuple(p) for p in pts])))

    if not segments:
        return []

    multi = unary_union([s[1] for s in segments])
    all_polys = sorted(polygonize(multi), key=lambda p: p.area, reverse=True)

    def _wall_ids_for_poly(poly):
        boundary = poly.boundary
        return [wid for wid, line in segments if boundary.distance(line) < 0.5]

    rooms = []
    for i, poly in enumerate(all_polys):
        exterior = [list(c) for c in poly.exterior.coords]
        rooms.append({
            "id": i + 1,
            "name": "Floor" if i == 0 else f"Room {i}",
            "polygon": exterior,
            "area": round(poly.area, 2),
            "status": "active",
            "wall_ids": _wall_ids_for_poly(poly),
        })

    return rooms
