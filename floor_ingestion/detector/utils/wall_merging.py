import uuid as _uuid

# Maximum pixel drift on the perpendicular axis for a segment to be treated
# as axis-aligned.  Covers slight detection noise on both internal and
# external walls.
SLOPE_SNAP_PX = 15


def _new_wall_id():
    return str(_uuid.uuid4())


def _classify_orientation(pts):
    """
    Return ('H', avg_y, xmin, xmax) or ('V', avg_x, ymin, ymax) when the
    segment is nearly axis-aligned, else (None, None, None, None).
    """
    (x1, y1), (x2, y2) = pts
    dy = abs(y2 - y1)
    dx = abs(x2 - x1)

    if dy <= SLOPE_SNAP_PX and dx > dy:
        return 'H', round((y1 + y2) / 2), min(x1, x2), max(x1, x2)
    if dx <= SLOPE_SNAP_PX and dy > dx:
        return 'V', round((x1 + x2) / 2), min(y1, y2), max(y1, y2)
    return None, None, None, None


def _make_wall(wall_id, p1, p2, wall_class="Wall Internal"):
    return {
        "id": wall_id,
        "type": "segment",
        "class": wall_class,
        "points": [[round(p1[0]), round(p1[1])],
                   [round(p2[0]), round(p2[1])]],
    }


def _seg_len(smin, smax):
    return smax - smin


def _strip_degenerate(rooms_data, walls_list, min_len=2):
    """Remove walls shorter than min_len px and clean up room references."""
    bad = set()
    for w in walls_list:
        (x1, y1), (x2, y2) = w["points"]
        if ((x2 - x1) ** 2 + (y2 - y1) ** 2) ** 0.5 < min_len:
            bad.add(w["id"])
    if bad:
        walls_list[:] = [w for w in walls_list if w["id"] not in bad]
        for room in rooms_data:
            room["wall_ids"] = [wid for wid in room["wall_ids"] if wid not in bad]


def dedup_walls(rooms_data, walls_list, gap_px=3):
    """
    Remove zero-length walls and collapse exact or near-exact duplicates.

    Two walls are duplicates when they are nearly axis-aligned in the same
    direction, their axis values are within gap_px, and one span fully contains
    (or equals) the other.  The shorter one is removed and all room references
    are updated to point to the longer one.

    This must run BEFORE merge_shared_walls so the merger doesn't waste time
    on walls that are already the same.
    """
    # --- strip zero-length walls ---
    zero_ids = {w["id"] for w in walls_list
                if w["points"][0] == w["points"][1]}
    if zero_ids:
        walls_list[:] = [w for w in walls_list if w["id"] not in zero_ids]
        for room in rooms_data:
            room["wall_ids"] = [wid for wid in room["wall_ids"]
                                if wid not in zero_ids]

    # --- build classification table ---
    classified = {}  # wall_id -> (orient, axis, smin, smax)
    for w in walls_list:
        o, axis, smin, smax = _classify_orientation(w["points"])
        if o:
            classified[w["id"]] = (o, axis, smin, smax)

    # --- find duplicate pairs: same orient, axis within gap_px, one span
    #     contains >= 80% of the other ---
    ids_list = [w["id"] for w in walls_list]

    # wall_id -> set of room indices
    wall_owners: dict[int, set] = {}
    for room_idx, room in enumerate(rooms_data):
        for wid in room["wall_ids"]:
            if wid is not None:
                wall_owners.setdefault(wid, set()).add(room_idx)

    to_remove: set[int] = set()          # shorter duplicate to drop
    replacement: dict[int, int] = {}     # removed_id -> kept_id

    for i in range(len(ids_list)):
        for j in range(i + 1, len(ids_list)):
            ia, ib = ids_list[i], ids_list[j]
            if ia in to_remove or ib in to_remove:
                continue
            if ia not in classified or ib not in classified:
                continue

            oa, aa, sa1, sa2 = classified[ia]
            ob, ab, sb1, sb2 = classified[ib]

            if oa != ob:
                continue
            if abs(aa - ab) > gap_px:
                continue

            ov_min = max(sa1, sb1)
            ov_max = min(sa2, sb2)
            len_a = _seg_len(sa1, sa2)
            len_b = _seg_len(sb1, sb2)
            min_len = min(len_a, len_b)
            if min_len <= 0:
                continue

            # One must contain at least 80% of the other's span.
            if (ov_max - ov_min) < min_len * 0.8:
                continue

            # Keep the longer one; discard the shorter.
            if len_a >= len_b:
                keep, drop = ia, ib
            else:
                keep, drop = ib, ia

            to_remove.add(drop)
            replacement[drop] = keep

            # Transfer ownership of the dropped wall to the kept wall.
            for owner_idx in wall_owners.get(drop, set()):
                wall_owners.setdefault(keep, set()).add(owner_idx)

    if not to_remove:
        return rooms_data, walls_list

    walls_list[:] = [w for w in walls_list if w["id"] not in to_remove]

    for room in rooms_data:
        new_ids = []
        seen = set()
        for wid in room["wall_ids"]:
            resolved = replacement.get(wid, wid)
            if resolved not in seen:
                new_ids.append(resolved)
                seen.add(resolved)
        room["wall_ids"] = new_ids

    _strip_degenerate(rooms_data, walls_list)
    return rooms_data, walls_list


def collapse_triangles(rooms_data, walls_list, max_apex_height=15, snap_px=8):
    """
    Remove degenerate triangles from the wall graph.

    A degenerate triangle is three walls A, B, C where:
      - A and B share an apex endpoint
      - C directly connects the other endpoints of A and B (the base)
      - The apex sits within max_apex_height pixels of the base line

    When found, A and B are removed.  The base wall C is kept as the
    canonical wall (longest side wins).  Room references to A/B are
    repointed to C.

    This catches V-shaped pairs of sloped stubs that dedup/merge miss
    because they are not parallel to each other.
    """
    import math

    def _snap(pt):
        return (int(pt[0]) // snap_px, int(pt[1]) // snap_px)

    def _apex_height(apex, p1, p2):
        base = math.dist(p1, p2)
        if base == 0:
            return math.dist(apex, p1)
        # perpendicular distance from apex to line p1->p2
        area2 = abs((p2[0]-p1[0])*(apex[1]-p1[1]) - (apex[0]-p1[0])*(p2[1]-p1[1]))
        return area2 / base

    id_to_wall = {w["id"]: w for w in walls_list}

    wall_owners: dict[int, set] = {}
    for room_idx, room in enumerate(rooms_data):
        for wid in room["wall_ids"]:
            if wid is not None:
                wall_owners.setdefault(wid, set()).add(room_idx)

    # endpoint snap-grid → set of wall ids
    from collections import defaultdict
    pt_map: dict[tuple, set] = defaultdict(set)
    for w in walls_list:
        for pt in w["points"]:
            pt_map[_snap(pt)].add(w["id"])

    to_remove: set[int] = set()
    replacement: dict[int, int] = {}

    for wid_c in list(id_to_wall):
        if wid_c in to_remove:
            continue
        wc = id_to_wall[wid_c]
        if len(wc["points"]) != 2:
            continue
        p1, p2 = [list(p) for p in wc["points"]]
        k1, k2 = _snap(p1), _snap(p2)

        # Find walls that share p1 (other than wc itself)
        for wid_a in list(pt_map[k1]):
            if wid_a == wid_c or wid_a in to_remove:
                continue
            wa = id_to_wall[wid_a]
            if len(wa["points"]) != 2:
                continue
            # determine which end of wa touches p1; the other end is the apex
            if _snap(wa["points"][0]) == k1:
                apex = list(wa["points"][1])
            elif _snap(wa["points"][1]) == k1:
                apex = list(wa["points"][0])
            else:
                continue

            k_apex = _snap(apex)
            if k_apex == k2:
                continue  # apex IS p2 — that's just a shared corner, not a triangle

            # Find a wall that connects apex -> p2
            for wid_b in pt_map[k_apex]:
                if wid_b in (wid_a, wid_c) or wid_b in to_remove:
                    continue
                wb = id_to_wall[wid_b]
                if len(wb["points"]) != 2:
                    continue
                has_apex = _snap(wb["points"][0]) == k_apex or _snap(wb["points"][1]) == k_apex
                has_p2   = _snap(wb["points"][0]) == k2    or _snap(wb["points"][1]) == k2
                if not (has_apex and has_p2):
                    continue

                # We have a triangle: wa (p1→apex), wb (apex→p2), wc (p1→p2)
                h = _apex_height(apex, p1, p2)
                if h > max_apex_height:
                    continue

                # Keep the base (wc); remove the two stubs
                to_remove.add(wid_a)
                to_remove.add(wid_b)
                replacement[wid_a] = wid_c
                replacement[wid_b] = wid_c

                for drop in (wid_a, wid_b):
                    for owner_idx in wall_owners.get(drop, set()):
                        wall_owners.setdefault(wid_c, set()).add(owner_idx)

    if not to_remove:
        return rooms_data, walls_list

    walls_list[:] = [w for w in walls_list if w["id"] not in to_remove]

    for room in rooms_data:
        new_ids = []
        seen = set()
        for wid in room["wall_ids"]:
            resolved = replacement.get(wid, wid)
            if resolved not in to_remove and resolved not in seen:
                new_ids.append(resolved)
                seen.add(resolved)
        room["wall_ids"] = new_ids

    return rooms_data, walls_list


def merge_shared_walls(rooms_data, walls_list, gap_px=15):
    """
    Collapse near-duplicate wall segments that represent the same physical wall.

    Two walls are candidates if they are:
      - Both nearly axis-aligned in the same direction (H or V)
      - Their canonical axis values are within gap_px of each other
      - Their free-axis spans overlap by more than a single point

    The merged wall is placed on the axis of the *longer* wall (smaller snaps
    to bigger).  Each source segment is trimmed to its non-overlapping stubs.
    """
    id_to_wall = {w["id"]: w for w in walls_list}

    wall_owners: dict[int, set] = {}
    for room_idx, room in enumerate(rooms_data):
        for wid in room["wall_ids"]:
            if wid is not None:
                wall_owners.setdefault(wid, set()).add(room_idx)

    all_ids = [w["id"] for w in walls_list]

    ids_to_remove: set = set()
    walls_to_add: list[dict] = []
    room_new_wall_ids: dict[int, list] = {i: [] for i in range(len(rooms_data))}
    axis_shifts: list[tuple] = []

    # Group walls by orientation, storing (wall_id, axis, smin, smax).
    by_orient: dict[str, list[tuple]] = {'H': [], 'V': []}
    for wid in all_ids:
        wall = id_to_wall.get(wid)
        if wall is None:
            continue
        o, axis, smin, smax = _classify_orientation(wall["points"])
        if o in by_orient:
            by_orient[o].append((wid, axis, smin, smax))

    for orient, entries in by_orient.items():
        n = len(entries)
        for i in range(n):
            for j in range(i + 1, n):
                id_a, axis_a, sa_min, sa_max = entries[i]
                id_b, axis_b, sb_min, sb_max = entries[j]

                if id_a in ids_to_remove or id_b in ids_to_remove:
                    continue

                if abs(axis_a - axis_b) > gap_px:
                    continue

                ov_min = max(sa_min, sb_min)
                ov_max = min(sa_max, sb_max)

                # Require genuine overlap, not just a touching corner.
                if ov_max - ov_min <= 0:
                    continue

                # Merged wall sits on the axis of the longer wall.
                len_a = _seg_len(sa_min, sa_max)
                len_b = _seg_len(sb_min, sb_max)
                dominant_axis = axis_a if len_a >= len_b else axis_b

                shared_wid = _new_wall_id()

                if orient == 'H':
                    shared_wall = _make_wall(
                        shared_wid,
                        (ov_min, dominant_axis), (ov_max, dominant_axis),
                        id_to_wall[id_a].get("class", "Wall Internal"),
                    )
                else:
                    shared_wall = _make_wall(
                        shared_wid,
                        (dominant_axis, ov_min), (dominant_axis, ov_max),
                        id_to_wall[id_a].get("class", "Wall Internal"),
                    )

                walls_to_add.append(shared_wall)
                id_to_wall[shared_wid] = shared_wall

                for owner_idx in wall_owners.get(id_a, set()) | wall_owners.get(id_b, set()):
                    room_new_wall_ids[owner_idx].append(shared_wid)
                    wall_owners.setdefault(shared_wid, set()).add(owner_idx)

                _trim_segment(
                    id_a, id_to_wall[id_a], orient,
                    (sa_min, sa_max), ov_min, ov_max, dominant_axis,
                    wall_owners, room_new_wall_ids, id_to_wall,
                    walls_to_add,
                )
                _trim_segment(
                    id_b, id_to_wall[id_b], orient,
                    (sb_min, sb_max), ov_min, ov_max, dominant_axis,
                    wall_owners, room_new_wall_ids, id_to_wall,
                    walls_to_add,
                )

                axis_shifts.append((orient, axis_a, axis_b, dominant_axis, ov_min, ov_max))

                ids_to_remove.add(id_a)
                ids_to_remove.add(id_b)

    walls_list[:] = [w for w in walls_list if w["id"] not in ids_to_remove]
    walls_list.extend(walls_to_add)

    for room_idx, room in enumerate(rooms_data):
        surviving = [wid for wid in room["wall_ids"]
                     if wid is not None and wid not in ids_to_remove]
        surviving.extend(room_new_wall_ids.get(room_idx, []))
        room["wall_ids"] = surviving

    # Corner-snap: perpendicular endpoints that still reference an old axis
    # value get moved to dominant_axis so corners close up.
    for wall in walls_list:
        for pt in wall["points"]:
            for (shift_orient, old_a, old_b, dominant, span_min, span_max) in axis_shifts:
                if shift_orient == 'H':
                    x, y = pt[0], pt[1]
                    if span_min <= x <= span_max:
                        if abs(y - old_a) <= gap_px or abs(y - old_b) <= gap_px:
                            pt[1] = dominant
                else:
                    x, y = pt[0], pt[1]
                    if span_min <= y <= span_max:
                        if abs(x - old_a) <= gap_px or abs(x - old_b) <= gap_px:
                            pt[0] = dominant

    _strip_degenerate(rooms_data, walls_list)
    return rooms_data, walls_list


def _trim_segment(
    wid, wall, orient, span, ov_min, ov_max, new_axis,
    wall_owners, room_new_wall_ids, id_to_wall,
    walls_to_add,
):
    """Replace wall with up to two remainder stubs outside the overlap region."""
    owners = wall_owners.get(wid, set())
    pieces = []

    if span[0] < ov_min - 1:
        pieces.append((span[0], ov_min))
    if span[1] > ov_max + 1:
        pieces.append((ov_max, span[1]))

    for piece_min, piece_max in pieces:
        pid = _new_wall_id()
        if orient == 'H':
            new_wall = _make_wall(
                pid,
                (piece_min, new_axis), (piece_max, new_axis),
                wall.get("class", "Wall Internal"),
            )
        else:
            new_wall = _make_wall(
                pid,
                (new_axis, piece_min), (new_axis, piece_max),
                wall.get("class", "Wall Internal"),
            )
        walls_to_add.append(new_wall)
        id_to_wall[pid] = new_wall
        for owner_idx in owners:
            room_new_wall_ids[owner_idx].append(pid)
            wall_owners.setdefault(pid, set()).add(owner_idx)
