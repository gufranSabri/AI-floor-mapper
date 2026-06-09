from __future__ import annotations

import json
import os
import sys
from pathlib import Path

from flask import Blueprint, jsonify, request, send_from_directory
from werkzeug.utils import secure_filename

_FI_ROOT = Path(__file__).resolve().parents[2] / "floor_ingestion"
if str(_FI_ROOT.parent) not in sys.path:
    sys.path.insert(0, str(_FI_ROOT.parent))

from floor_ingestion import detect_objects as _detect

bp = Blueprint("objects", __name__)

TEMPLATE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".bmp", ".tiff", ".tif"}


def _output_dir() -> tuple[Path | None, tuple[dict, int] | None]:
    output_dir = os.environ.get("OUTPUT_DIR")
    if not output_dir:
        return None, ({"error": "OUTPUT_DIR not configured."}, 500)
    return Path(output_dir), None


def _templates_root() -> Path:
    uploads_root = os.environ.get("OUTPUT_DIR")
    if uploads_root:
        p = Path(uploads_root).parent / "templates"
    else:
        p = Path(__file__).parent.parent / "uploads" / "templates"
    p.mkdir(parents=True, exist_ok=True)
    return p


# ── Template management ───────────────────────────────────────────────────────

@bp.get("/api/objects/templates")
def list_templates():
    root = _templates_root()
    results = []
    for obj_dir in sorted(root.iterdir()):
        if not obj_dir.is_dir():
            continue
        images = sorted(
            p for p in obj_dir.iterdir()
            if p.suffix.lower() in TEMPLATE_EXTENSIONS
        )
        results.append({
            "name": obj_dir.name,
            "count": len(images),
            "files": [f.name for f in images],
            "preview_url": f"/api/objects/templates/{obj_dir.name}/{images[0].name}" if images else None,
        })
    return jsonify({"templates": results}), 200


@bp.post("/api/objects/templates/<name>")
def save_template(name: str):
    """
    Accept one or more image files for a named object template.
    Files are POSTed as multipart/form-data under the key 'files'.
    """
    safe = secure_filename(name)
    if not safe:
        return {"error": "Invalid template name."}, 400

    files = request.files.getlist("files")
    if not files:
        return {"error": "No files provided."}, 400

    obj_dir = _templates_root() / safe
    obj_dir.mkdir(parents=True, exist_ok=True)

    saved = []
    for i, f in enumerate(files):
        ext = Path(f.filename).suffix.lower() if f.filename else ".png"
        if ext not in TEMPLATE_EXTENSIONS:
            ext = ".png"
        fname = f"template_{i + 1:02d}{ext}"
        dest = obj_dir / fname
        f.save(str(dest))
        saved.append(fname)

    return jsonify({"ok": True, "saved": saved}), 200


@bp.get("/api/objects/templates/<name>/<filename>")
def serve_template(name: str, filename: str):
    safe_name = secure_filename(name)
    safe_file = secure_filename(filename)
    root = _templates_root()
    return send_from_directory(str(root / safe_name), safe_file)


@bp.delete("/api/objects/templates/<name>")
def delete_template(name: str):
    import shutil
    safe = secure_filename(name)
    obj_dir = _templates_root() / safe
    if not obj_dir.is_dir():
        return {"error": "Template not found."}, 404
    shutil.rmtree(obj_dir)
    return {"ok": True}, 200


# ── Object detection ──────────────────────────────────────────────────────────

@bp.post("/api/floors/<floor_name>/objects/detect")
def detect_objects(floor_name: str):
    """
    Run template matching for all known templates against the floor image.
    Returns detected objects and saves <floorname>_objects.json.
    """
    output_dir, err = _output_dir()
    if err:
        return err

    safe = secure_filename(floor_name)
    floor_dir = output_dir / safe

    # find the floor image
    image_file = next(
        (f for f in floor_dir.iterdir()
         if f.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp"}
         and "_boundary" not in f.name
         and "_detected" not in f.name),
        None,
    )
    if image_file is None:
        return {"error": "Floor image not found."}, 404

    templates_root = _templates_root()
    if not templates_root.is_dir() or not any(templates_root.iterdir()):
        return {"error": "No templates defined."}, 400

    body          = request.get_json(silent=True) or {}
    threshold     = float(body.get("threshold",     0.7))
    iou_threshold = float(body.get("iou_threshold", 0.4))
    object_filter = body.get("object_filter")   # optional: only detect this object

    results = _detect(
        floorplan_path=str(image_file),
        templates_root=str(templates_root),
        threshold=threshold,
        iou_threshold=iou_threshold,
        object_filter=object_filter,
    )

    # Merge results into existing objects JSON (don't overwrite other objects).
    objects_path = floor_dir / f"{safe}_objects.json"
    existing = {}
    if objects_path.is_file():
        with open(objects_path) as f:
            existing = json.load(f)
    existing.update(results)
    with open(objects_path, "w") as f:
        json.dump(existing, f, indent=2)

    return jsonify(results), 200


@bp.get("/api/floors/<floor_name>/objects")
def get_objects(floor_name: str):
    output_dir, err = _output_dir()
    if err:
        return err
    safe = secure_filename(floor_name)
    objects_path = output_dir / safe / f"{safe}_objects.json"
    if not objects_path.is_file():
        return jsonify({}), 200
    with open(objects_path) as f:
        data = json.load(f)
    return jsonify(data), 200


@bp.post("/api/floors/<floor_name>/objects/save")
def save_objects(floor_name: str):
    """Persist manually-edited detections (no template matching run)."""
    output_dir, err = _output_dir()
    if err:
        return err
    safe = secure_filename(floor_name)
    floor_dir = output_dir / safe
    if not floor_dir.is_dir():
        return {"error": "Floor not found."}, 404

    body = request.get_json(silent=True)
    if body is None:
        return {"error": "JSON body required."}, 400

    objects_path = floor_dir / f"{safe}_objects.json"
    with open(objects_path, "w") as f:
        json.dump(body, f, indent=2)

    return {"ok": True}, 200
