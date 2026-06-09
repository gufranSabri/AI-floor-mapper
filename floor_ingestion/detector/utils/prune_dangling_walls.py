from .compute_wall_connections import compute_wall_connections

def _distinct_junctions(wall):
    """Number of distinct endpoint coordinates the wall connects at."""
    seen = set()
    for entry in wall.get("connected_to", []):
        pt = entry["point"]
        seen.add((pt[0], pt[1]))
    return len(seen)

MIN_WALL_LENGTH_PX = 5

def _is_degenerate(wall):
    pts = wall["points"]
    dx = pts[0][0] - pts[1][0]
    dy = pts[0][1] - pts[1][1]
    return (dx * dx + dy * dy) ** 0.5 < MIN_WALL_LENGTH_PX

def prune_dangling_walls(walls, rooms):
    """
    Iteratively remove walls that are degenerate (start ≈ end point) or
    touch ≤1 distinct junction point, then recompute connections and repeat
    until stable. Rooms' wall_ids are updated to drop removed ids.
    """
    while True:
        compute_wall_connections(walls)
        remove_ids = {
            w["id"] for w in walls
            if _is_degenerate(w) or _distinct_junctions(w) <= 1
        }
        if not remove_ids:
            break
        walls[:] = [w for w in walls if w["id"] not in remove_ids]
        for room in rooms:
            room["wall_ids"] = [
                wid for wid in room["wall_ids"] if wid not in remove_ids
            ]