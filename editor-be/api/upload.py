from __future__ import annotations

import os
from pathlib import Path

from flask import Blueprint, abort, request, send_from_directory
from werkzeug.utils import secure_filename

from .signed_url import sign_path, verify_path

UPLOAD_DIR = Path(__file__).resolve().parents[1] / "uploads"
ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "webp", "gif"}

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

bp = Blueprint("upload", __name__)


def allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


@bp.post("/api/upload")
def upload_floorplan() -> tuple[dict[str, object], int]:
    if "file" not in request.files:
        return {"error": "No file was uploaded."}, 400

    file = request.files["file"]
    if file.filename == "":
        return {"error": "Please choose a file before uploading."}, 400

    if not allowed_file(file.filename):
        return {"error": "Please upload a PNG, JPG, JPEG, WEBP, or GIF image."}, 400

    ext = file.filename.rsplit(".", 1)[1].lower()
    raw_name = request.form.get("name", "").strip() or "floor"
    filename = secure_filename(f"{raw_name}.{ext}")

    filename_wo_ext = filename.rsplit(".", 1)[0]
    os.makedirs(UPLOAD_DIR / filename_wo_ext, exist_ok=True)

    file_path = UPLOAD_DIR / filename_wo_ext / filename
    file.save(file_path)

    rel_path = f"{filename_wo_ext}/{filename}"
    return {
        "file_name": filename,
        "stored_name": filename,
        "preview_url": sign_path(rel_path),
        "size_bytes": file_path.stat().st_size,
    }, 200


@bp.get("/api/uploads/<path:filename>")
def serve_upload(filename: str):
    token = request.args.get("token", "")
    expires = request.args.get("expires", "")
    if not verify_path(filename, token, expires):
        abort(403)
    return send_from_directory(UPLOAD_DIR, filename)
