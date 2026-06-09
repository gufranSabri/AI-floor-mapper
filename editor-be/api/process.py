from __future__ import annotations

import json
import os
import sys
from pathlib import Path

from flask import Blueprint, send_from_directory, request, jsonify
from werkzeug.utils import secure_filename

UPLOAD_DIR = Path(__file__).resolve().parents[1] / "uploads"

_FI_ROOT = Path(__file__).resolve().parents[2] / "floor_ingestion"
if str(_FI_ROOT.parent) not in sys.path:
    sys.path.insert(0, str(_FI_ROOT.parent))

from floor_ingestion import process_floorplan

bp = Blueprint("process", __name__)


def _save_map_status(results_dir: Path, stored_stem: str, body: dict) -> None:
    map_status = {
        "stored_name": body.get("stored_name"),
        "scaleMeters": body.get("scaleMeters"),
        "rotation": body.get("rotation"),
        "lat": body.get("lat"),
        "lng": body.get("lng"),
    }
    map_status_path = results_dir / f"{stored_stem}_map_status.json"
    with open(map_status_path, "w") as f:
        json.dump(map_status, f, indent=2)


@bp.post("/api/process")
def process_floorplan_route() -> tuple[dict[str, object], int]:
    body = request.get_json(silent=True) or {}
    stored_name = body.get("stored_name")
    lat = body.get("lat")
    lng = body.get("lng")

    if not stored_name:
        return {"error": "stored_name is required."}, 400

    stored_stem = Path(stored_name).stem
    img_path = UPLOAD_DIR / stored_stem / stored_name
    if not img_path.is_file():
        return {"error": "Uploaded file not found on server."}, 404

    output_dir = os.environ.get("OUTPUT_DIR")
    if not output_dir:
        return {"error": "OUTPUT_DIR must be configured."}, 500

    results_dir = Path(output_dir) / stored_stem
    boundary_path = results_dir / f"{stored_stem}_boundary.json"

    # If a boundary already exists, only update map status — skip detection.
    if boundary_path.is_file():
        _save_map_status(results_dir, stored_stem, body)
        return send_from_directory(str(results_dir), f"{stored_stem}_boundary.json")

    weights = os.environ.get("YOLO_WEIGHTS")
    if not weights:
        return {"error": "YOLO_WEIGHTS must be configured."}, 500

    results_dir.mkdir(parents=True, exist_ok=True)

    process_floorplan(
        image=img_path,
        weights=Path(weights),
        output_dir=results_dir,
        merge_walls=True,
    )

    _save_map_status(results_dir, stored_stem, body)

    return send_from_directory(str(results_dir), f"{stored_stem}_boundary.json")
