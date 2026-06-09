import uuid as _uuid
from shapely.geometry import Polygon as ShapelyPolygon, MultiPolygon


def polygon_to_wall_segments(poly):
    """Return exterior ring edges of a Shapely polygon as (p1, p2) tuples."""
    coords = list(poly.exterior.coords)
    return [(coords[i], coords[i + 1]) for i in range(len(coords) - 1)]

def clean_overlapping_rooms(rooms_data, walls_list):
    """
    For each pair of rooms that partially overlap, subtract the smaller room's
    area from the larger room and replace its wall segments.

    Rooms where the smaller is fully inside the larger are left untouched.
    """
    def bbox_poly(room):
        x1, y1, x2, y2 = room["bbox"]
        return ShapelyPolygon([(x1, y1), (x2, y1), (x2, y2), (x1, y2)])

    effective_polys = [bbox_poly(r) for r in rooms_data]

    n = len(rooms_data)
    # Use i < j to visit each pair exactly once.
    for i in range(n):
        for j in range(i + 1, n):
            poly_i = effective_polys[i]
            poly_j = effective_polys[j]

            if not poly_i.intersects(poly_j):
                continue

            if poly_i.area >= poly_j.area:
                big_idx, small_idx = i, j
            else:
                big_idx, small_idx = j, i

            big_poly   = effective_polys[big_idx]
            small_poly = effective_polys[small_idx]

            # Small fully inside big — leave both unchanged.
            if big_poly.contains(small_poly):
                continue

            remainder = big_poly.difference(small_poly)
            if remainder.is_empty:
                continue

            if isinstance(remainder, MultiPolygon):
                remainder = max(remainder.geoms, key=lambda g: g.area)

            effective_polys[big_idx] = remainder

            big_room = rooms_data[big_idx]
            new_segments = polygon_to_wall_segments(remainder)

            old_ids_to_remove = {wid for wid in big_room["wall_ids"] if wid is not None}
            walls_list[:] = [w for w in walls_list if w["id"] not in old_ids_to_remove]

            new_wall_ids = []
            for seg in new_segments:
                p1, p2 = seg
                wid = str(_uuid.uuid4())
                walls_list.append({
                    "id": wid,
                    "type": "segment",
                    "class": "Wall Internal",
                    "points": [[round(p1[0]), round(p1[1])],
                               [round(p2[0]), round(p2[1])]],
                })
                new_wall_ids.append(wid)

            big_room["wall_ids"] = new_wall_ids

    return rooms_data, walls_list
