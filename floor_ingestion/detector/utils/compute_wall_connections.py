def compute_wall_connections(walls_list, snap_px=2):
    """
    For every wall in walls_list, populate a 'connected_to' list.

    Two walls are considered connected when:
      - An endpoint of wall A is within snap_px of an endpoint of wall B
        (corner / L-junction), OR
      - An endpoint of wall B lies on the interior of wall A within snap_px
        (T-junction).

    Each connection entry records the id of the other wall and the junction
    point (the endpoint that touches).

    snap_px=2 catches integer-rounding drift without bridging legitimate gaps.
    """

    def _close(p1, p2):
        return abs(p1[0] - p2[0]) <= snap_px and abs(p1[1] - p2[1]) <= snap_px

    def _point_on_segment(p, a, b):
        """
        Return True when p lies within snap_px of the segment a-b.
        Uses perpendicular distance + projection bounds check.
        """
        dx, dy = b[0] - a[0], b[1] - a[1]
        seg_len_sq = dx * dx + dy * dy
        if seg_len_sq == 0:
            return _close(p, a)
        t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / seg_len_sq
        # Only interior points (exclude endpoints, which are caught by _close).
        if t <= 0.0 or t >= 1.0:
            return False
        # Perpendicular distance.
        perp_x = a[0] + t * dx - p[0]
        perp_y = a[1] + t * dy - p[1]
        return (perp_x * perp_x + perp_y * perp_y) <= snap_px * snap_px

    # Build adjacency: for each wall collect all (other_id, junction_point) pairs.
    adjacency: dict[int, list[dict]] = {w["id"]: [] for w in walls_list}

    for i, wa in enumerate(walls_list):
        for j, wb in enumerate(walls_list):
            if i >= j:
                continue
            pts_a = wa["points"]
            pts_b = wb["points"]

            # Corner / L-junction: endpoint of A meets endpoint of B.
            for pa in pts_a:
                for pb in pts_b:
                    if _close(pa, pb):
                        adjacency[wa["id"]].append({"id": wb["id"], "point": list(pb)})
                        adjacency[wb["id"]].append({"id": wa["id"], "point": list(pa)})

            # T-junction: endpoint of B lies on the interior of A.
            if len(pts_a) == 2:
                for pb in pts_b:
                    if _point_on_segment(pb, pts_a[0], pts_a[1]):
                        adjacency[wa["id"]].append({"id": wb["id"], "point": list(pb)})
                        adjacency[wb["id"]].append({"id": wa["id"], "point": list(pb)})

            # T-junction: endpoint of A lies on the interior of B.
            if len(pts_b) == 2:
                for pa in pts_a:
                    if _point_on_segment(pa, pts_b[0], pts_b[1]):
                        adjacency[wa["id"]].append({"id": wb["id"], "point": list(pa)})
                        adjacency[wb["id"]].append({"id": wa["id"], "point": list(pa)})

    for wall in walls_list:
        wall["connected_to"] = adjacency[wall["id"]]
