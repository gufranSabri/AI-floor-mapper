import math
from collections import defaultdict


def reconcile_room_walls(walls, rooms, tol=6):
    for room in rooms:
        if "bbox" not in room:
            continue
        x1, y1, x2, y2 = room["bbox"]
        lx, ly = x1 - tol, y1 - tol
        hx, hy = x2 + tol, y2 + tol
        room["wall_ids"] = [
            w["id"] for w in walls
            if all(lx <= p[0] <= hx and ly <= p[1] <= hy for p in w["points"])
        ]


def tag_and_detect_enclosed_spaces(walls, rooms):
    """
    Tags all YOLO-detected rooms with type='detected', then finds minimal enclosed
    face cycles in the wall graph using the planar half-edge technique. Newly
    discovered enclosed spaces are appended to rooms in-place.
    """
    for room in rooms:
        room.setdefault("type", "detected")

    enclosed = _find_enclosed_spaces(walls)

    existing_wall_sets = [frozenset(r["wall_ids"]) for r in rooms]
    next_room_id = max((r["id"] for r in rooms), default=0) + 1

    for _, wids in enclosed:
        face_set = frozenset(wids)
        if any(face_set <= s or s <= face_set for s in existing_wall_sets):
            continue
        rooms.append({
            "id": next_room_id,
            "type": "enclosed_space",
            "wall_ids": list(wids),
        })
        existing_wall_sets.append(face_set)
        next_room_id += 1


def _find_enclosed_spaces(walls):
    """
    Find all minimal enclosed face cycles in the wall graph using the planar
    half-edge technique: at every junction, always take the most clockwise next
    edge. Returns a list of (ordered_vertex_list, wall_id_list) tuples.
    """
    pt_tol = 4

    def pk(pt):
        return (round(pt[0] / pt_tol) * pt_tol,
                round(pt[1] / pt_tol) * pt_tol)

    half_edges = []
    for w in walls:
        a, b = pk(w["points"][0]), pk(w["points"][1])
        if a == b:
            continue
        half_edges.append((a, b, w["id"]))
        half_edges.append((b, a, w["id"]))

    outgoing = defaultdict(list)
    for src, dst, wid in half_edges:
        angle = math.atan2(dst[1] - src[1], dst[0] - src[0])
        outgoing[src].append((angle, dst, wid))
    for src in outgoing:
        outgoing[src].sort(key=lambda x: x[0])

    def _next_he(src, dst):
        incoming_angle = math.atan2(src[1] - dst[1], src[0] - dst[0])
        edges = outgoing[src]
        if not edges:
            return None, None
        best = None
        for angle, next_dst, wid in edges:
            diff = (angle - incoming_angle) % (2 * math.pi)
            if diff == 0:
                continue
            if best is None or diff < best[0]:
                best = (diff, next_dst, wid)
        if best is None:
            return None, None
        return best[1], best[2]

    visited_he = set()
    faces = []

    for start_src, start_dst, start_wid in half_edges:
        he_key = (start_src, start_dst)
        if he_key in visited_he:
            continue

        face_verts = [start_src]
        face_wids = [start_wid]
        visited_he.add(he_key)

        prev = start_src
        cur = start_dst

        for _ in range(len(half_edges)):
            nxt, wid = _next_he(cur, prev)
            if nxt is None:
                break
            he_key2 = (cur, nxt)
            if he_key2 in visited_he:
                break
            visited_he.add(he_key2)
            face_verts.append(cur)
            face_wids.append(wid)
            if nxt == start_src:
                faces.append((face_verts, face_wids))
                break
            prev, cur = cur, nxt

    def _signed_area(verts):
        n = len(verts)
        area = 0.0
        for i in range(n):
            x1, y1 = verts[i]
            x2, y2 = verts[(i + 1) % n]
            area += x1 * y2 - x2 * y1
        return area / 2.0

    valid = [(v, w) for v, w in faces if len(v) >= 3]
    if not valid:
        return []

    inner = [(v, w) for v, w in valid if _signed_area(v) > 0]
    return inner
