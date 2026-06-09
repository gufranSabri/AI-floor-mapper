from __future__ import annotations

import json
import os
import sys
from pathlib import Path

from flask import Blueprint, jsonify, request
from werkzeug.utils import secure_filename

_FI_ROOT = Path(__file__).resolve().parents[2] / "floor_ingestion"
if str(_FI_ROOT.parent) not in sys.path:
    sys.path.insert(0, str(_FI_ROOT.parent))

from floor_ingestion import detect_rooms_from_walls

bp = Blueprint("rooms", __name__)


def _output_dir() -> tuple[Path | None, tuple[dict, int] | None]:
    output_dir = os.environ.get("OUTPUT_DIR")
    if not output_dir:
        return None, ({"error": "OUTPUT_DIR not configured."}, 500)
    return Path(output_dir), None


@bp.post("/api/floors/<name>/rooms/detect")
def detect_rooms(name: str):
    output_dir, err = _output_dir()
    if err:
        return err
    safe = secure_filename(name)
    boundary_path = output_dir / safe / f"{safe}_boundary.json"
    if not boundary_path.is_file():
        return {"error": "Boundary file not found."}, 404

    with open(boundary_path) as f:
        data = json.load(f)

    walls = data.get("elements", {}).get("walls", [])
    rooms = detect_rooms_from_walls(walls)

    data.setdefault("elements", {})["rooms"] = rooms

    with open(boundary_path, "w") as f:
        json.dump(data, f, indent=2)

    return jsonify({"rooms": rooms}), 200


@bp.post("/api/floors/<name>/rooms")
def save_rooms(name: str):
    output_dir, err = _output_dir()
    if err:
        return err
    safe = secure_filename(name)
    boundary_path = output_dir / safe / f"{safe}_boundary.json"
    if not boundary_path.is_file():
        return {"error": "Boundary file not found."}, 404

    body = request.get_json(silent=True)
    if not body or "rooms" not in body:
        return {"error": "JSON body with 'rooms' key required."}, 400

    with open(boundary_path) as f:
        data = json.load(f)

    data.setdefault("elements", {})["rooms"] = body["rooms"]

    with open(boundary_path, "w") as f:
        json.dump(data, f, indent=2)

    return {"ok": True}, 200
