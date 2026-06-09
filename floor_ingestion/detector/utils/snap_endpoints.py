import math
from .compute_wall_connections import compute_wall_connections

def snap_wall_endpoints(walls_list, snap_px=10):
    """
    Close near-miss gaps between wall endpoints.

    All endpoints within snap_px of each other are clustered via union-find
    and moved to their centroid in a single pass.  This correctly handles
    3-way (and N-way) junctions where multiple walls meet at one point.
    """
    _snap_pass(walls_list, snap_px)
    compute_wall_connections(walls_list)


def _snap_pass(walls_list, snap_px):
    # Flat list of (wall_index, point_index, coords_ref).
    # coords_ref is the actual list inside the wall dict — mutations are in-place.
    endpoints = []
    for wi, wall in enumerate(walls_list):
        for pi, pt in enumerate(wall["points"]):
            endpoints.append((wi, pi, pt))

    def _cell(x, y):
        return (int(x) // snap_px, int(y) // snap_px)

    # Build spatial grid.
    grid: dict[tuple, list[int]] = {}
    for ei, (_, _, pt) in enumerate(endpoints):
        grid.setdefault(_cell(pt[0], pt[1]), []).append(ei)

    # Union-Find to cluster all endpoints within snap_px of each other.
    parent = list(range(len(endpoints)))

    def _find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def _union(x, y):
        parent[_find(x)] = _find(y)

    for ei_a, (wi_a, _, pt_a) in enumerate(endpoints):
        cx, cy = _cell(pt_a[0], pt_a[1])
        for dcx in (-1, 0, 1):
            for dcy in (-1, 0, 1):
                for ei_b in grid.get((cx + dcx, cy + dcy), []):
                    if ei_b <= ei_a:
                        continue
                    wi_b = endpoints[ei_b][0]
                    if wi_a == wi_b:  # never snap both ends of the same wall
                        continue
                    pt_b = endpoints[ei_b][2]
                    dx = pt_a[0] - pt_b[0]
                    dy = pt_a[1] - pt_b[1]
                    if math.sqrt(dx * dx + dy * dy) <= snap_px:
                        _union(ei_a, ei_b)

    # Group endpoints by cluster and move all to the centroid.
    clusters: dict[int, list[int]] = {}
    for ei in range(len(endpoints)):
        clusters.setdefault(_find(ei), []).append(ei)

    for members in clusters.values():
        if len(members) < 2:
            continue
        pts = [endpoints[ei][2] for ei in members]
        cx = round(sum(p[0] for p in pts) / len(pts))
        cy = round(sum(p[1] for p in pts) / len(pts))
        for p in pts:
            p[0] = cx
            p[1] = cy
