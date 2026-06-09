import cv2
import numpy as np
from collections import defaultdict


_ROOM_PALETTE = [
    (255,  80,  80), (80,  180, 255), (80,  255, 140), (255, 200,  60),
    (200,  80, 255), (255, 140,  80), ( 60, 220, 220), (255, 100, 180),
]


def draw_overlay(image_path, walls, rooms):
    """
    Draw translucent room fills and wall segments onto the image.
    Returns the annotated image (numpy array).
    """
    image = cv2.imread(str(image_path))
    id_to_wall = {w["id"]: w for w in walls}

    overlay = image.copy()
    for room_idx, room in enumerate(rooms):
        color = _ROOM_PALETTE[room_idx % len(_ROOM_PALETTE)]
        loop = _walk_wall_loop(room["wall_ids"], id_to_wall)

        if loop and len(loop) >= 3:
            arr = np.array(loop, dtype=np.int32)
            cv2.fillPoly(overlay, [arr.reshape(-1, 1, 2)], color)
            cx = int(arr[:, 0].mean())
            cy = int(arr[:, 1].mean())
        else:
            pts_all = []
            for wid in room["wall_ids"]:
                w = id_to_wall.get(wid)
                if w:
                    pts_all.extend(w["points"])
            if not pts_all:
                continue
            arr = np.array(pts_all, dtype=np.int32)
            cx = int(arr[:, 0].mean())
            cy = int(arr[:, 1].mean())

        cv2.putText(overlay, f"R{room['id']}", (cx - 10, cy),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 2, cv2.LINE_AA)

    cv2.addWeighted(overlay, 0.30, image, 0.70, 0, image)

    for wall in walls:
        pts = wall["points"]
        color = (0, 200, 100) if wall["class"] == "Wall External" else (0, 120, 255)
        thickness = 3 if wall["class"] == "Wall External" else 2
        cv2.line(image, tuple(pts[0]), tuple(pts[1]), color, thickness)
        for pt in pts:
            s = 4
            x, y = int(pt[0]), int(pt[1])
            cv2.rectangle(image, (x - s, y - s), (x + s, y + s), color, -1)

    return image


def _pt_key(pt, tol=4):
    return (round(pt[0] / tol), round(pt[1] / tol))


def _walk_wall_loop(wall_ids, id_to_wall):
    """
    Try to order the walls into a closed polygon by chaining endpoints.
    Returns an ordered list of [x, y] vertices if a closed loop is found,
    otherwise returns None.
    """
    segments = []
    for wid in wall_ids:
        w = id_to_wall.get(wid)
        if w:
            segments.append((list(w["points"][0]), list(w["points"][1])))
    if len(segments) < 3:
        return None

    adj = defaultdict(list)
    for si, (p1, p2) in enumerate(segments):
        k1, k2 = _pt_key(p1), _pt_key(p2)
        adj[k1].append((k2, si, 0))
        adj[k2].append((k1, si, 1))

    start_key = _pt_key(segments[0][0])
    visited_segs = set()
    ordered_pts = [segments[0][0]]
    cur_key = _pt_key(segments[0][1])
    ordered_pts.append(segments[0][1])
    visited_segs.add(0)

    for _ in range(len(segments) - 1):
        moved = False
        for (next_key, si, end) in adj[cur_key]:
            if si in visited_segs:
                continue
            visited_segs.add(si)
            next_pt = segments[si][1] if end == 0 else segments[si][0]
            ordered_pts.append(next_pt)
            cur_key = _pt_key(next_pt)
            moved = True
            break
        if not moved:
            break

    if _pt_key(ordered_pts[-1]) != start_key:
        return None
    return ordered_pts[:-1]
