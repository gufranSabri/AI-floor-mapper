from __future__ import annotations

import json
import os
import shutil
from pathlib import Path

from flask import Blueprint, jsonify, request, send_from_directory
from werkzeug.utils import secure_filename

from .signed_url import sign_path

bp = Blueprint("floors", __name__)


def _output_dir() -> tuple[Path | None, tuple[dict, int] | None]:
    output_dir = os.environ.get("OUTPUT_DIR")
    if not output_dir:
        return None, ({"error": "OUTPUT_DIR not configured."}, 500)
    return Path(output_dir), None


@bp.get("/api/floors")
def list_floors() -> tuple[dict[str, object], int]:
    output_dir, err = _output_dir()
    if err:
        return err

    results = []
    for subdir in sorted(output_dir.iterdir()):
        if not subdir.is_dir():
            continue
        boundary_json = subdir / f"{subdir.name}_boundary.json"
        if not boundary_json.is_file():
            continue

        map_status = None
        map_status_path = subdir / f"{subdir.name}_map_status.json"
        if map_status_path.is_file():
            with open(map_status_path) as f:
                map_status = json.load(f)

        image_file = next(
            (f for f in subdir.iterdir()
             if f.suffix in {".png", ".jpg", ".jpeg", ".webp"} and "_boundary" not in f.name),
            None,
        )
        results.append({
            "name": subdir.name,
            "stored_name": image_file.name if image_file else f"{subdir.name}.png",
            "preview_url": sign_path(f"{subdir.name}/{image_file.name}") if image_file else None,
            "map_status": map_status,
        })

    return {"floors": results}, 200


@bp.get("/api/floors/<name>/boundary")
def get_floor_boundary(name: str):
    output_dir, err = _output_dir()
    if err:
        return err
    safe = secure_filename(name)
    boundary_path = output_dir / safe / f"{safe}_boundary.json"
    if not boundary_path.is_file():
        return {"error": "Boundary file not found."}, 404
    return send_from_directory(str(boundary_path.parent), boundary_path.name)


@bp.post("/api/floors/<name>/boundary")
def save_floor_boundary(name: str):
    output_dir, err = _output_dir()
    if err:
        return err
    safe = secure_filename(name)
    floor_dir = output_dir / safe
    boundary_path = floor_dir / f"{safe}_boundary.json"
    if not boundary_path.is_file():
        return {"error": "Boundary file not found."}, 404

    body = request.get_json(silent=True)
    if not body:
        return {"error": "JSON body required."}, 400

    original_path = floor_dir / f"{safe}_boundary_original.json"
    if not original_path.is_file():
        import shutil
        shutil.copy2(boundary_path, original_path)

    with open(boundary_path) as f:
        existing = json.load(f)

    existing_elements = existing.get("elements", {})
    new_elements = body.get("elements", {})

    walls_changed = existing_elements.get("walls") != new_elements.get("walls")

    # Always prune doors whose wall no longer exists, regardless of change detection.
    valid_wall_ids = {w["id"] for w in new_elements.get("walls", []) if "id" in w}
    all_doors = new_elements.get("doors", [])
    surviving_doors = [d for d in all_doors if d.get("wall_id") in valid_wall_ids]
    body.setdefault("elements", {})["doors"] = surviving_doors

    # Only clear rooms when the walls themselves changed — door edits do not
    # invalidate room geometry and door serialization differences (float rounding,
    # ordering) would otherwise silently wipe rooms on every door-step save.
    if walls_changed:
        existing_rooms = existing_elements.get("rooms", [])
        space_type_rooms = [r for r in existing_rooms if r.get("wall_ids") is None]
        body.setdefault("elements", {})["rooms"] = space_type_rooms

    with open(boundary_path, "w") as f:
        json.dump(body, f, indent=2)

    return {"ok": True}, 200


@bp.post("/api/floors/<name>/boundary/reset")
def reset_floor_boundary(name: str):
    output_dir, err = _output_dir()
    if err:
        return err
    safe = secure_filename(name)
    floor_dir = output_dir / safe
    original_path = floor_dir / f"{safe}_boundary_original.json"
    boundary_path = floor_dir / f"{safe}_boundary.json"

    if not original_path.is_file():
        if not boundary_path.is_file():
            return {"error": "Boundary file not found."}, 404
        with open(boundary_path) as f:
            data = json.load(f)
        return jsonify(data), 200

    import shutil
    shutil.copy2(original_path, boundary_path)
    with open(boundary_path) as f:
        data = json.load(f)
    return jsonify(data), 200


@bp.post("/api/floors/cleanup")
def cleanup_incomplete_floors():
    output_dir, err = _output_dir()
    if err:
        return err
    removed = []
    for subdir in output_dir.iterdir():
        if not subdir.is_dir():
            continue
        if not (subdir / f"{subdir.name}_boundary.json").is_file():
            shutil.rmtree(subdir)
            removed.append(subdir.name)
    return {"removed": removed}, 200


@bp.delete("/api/floors/<name>")
def delete_floor(name: str):
    output_dir, err = _output_dir()
    if err:
        return err
    safe = secure_filename(name)
    floor_dir = output_dir / safe
    if not floor_dir.is_dir():
        return {"error": "Floor not found."}, 404
    import shutil
    shutil.rmtree(floor_dir)
    return {"ok": True}, 200
