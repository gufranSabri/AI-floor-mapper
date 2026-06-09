"""
object_detector.py
──────────────────
Template-matching based object detection for floor plans.
Adapted from template_matching/detector.py to return structured JSON data
suitable for the API layer.

Usage (programmatic):
    from object_detector import detect_objects
    results = detect_objects(
        floorplan_path="floor.png",
        templates_root="uploads/templates",
        threshold=0.7,
        iou_threshold=0.4,
    )
    # results = {
    #   "chair": [{"x": 10, "y": 20, "w": 40, "h": 40, "score": 0.85, "template": "template_01.png"}, ...],
    #   "desk":  [...],
    # }
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

import cv2
import numpy as np

TEMPLATE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".bmp", ".tiff", ".tif"}


def detect_objects(
    floorplan_path: str,
    templates_root: str,
    threshold: float = 0.7,
    iou_threshold: float = 0.4,
    scales: list[float] | None = None,
    angles: list[float] | None = None,
    object_filter: str | None = None,
) -> dict[str, list[dict[str, Any]]]:
    """
    Detect all objects whose templates live under templates_root/<object_name>/.

    Args:
        floorplan_path: Path to the floor plan image.
        templates_root: Root folder containing one sub-folder per object type.
                        Each sub-folder holds one or more template images.
        threshold:      Match confidence threshold (0-1).
        iou_threshold:  IoU overlap threshold for NMS.
        scales:         Scale factors to try per template.
        angles:         Rotation angles (degrees) to try per template.

    Returns:
        dict mapping object_name -> list of detection dicts
        Each detection: { x, y, w, h, score, template }
    """
    if scales is None:
        scales = [0.6, 0.8, 1.0, 1.2, 1.4]
    if angles is None:
        angles = [0, 45, 90, 135, 180, 225, 270, 315]

    floorplan_color = cv2.imread(floorplan_path)
    if floorplan_color is None:
        raise FileNotFoundError(f"Could not load floor plan: '{floorplan_path}'")
    floorplan_gray = cv2.cvtColor(floorplan_color, cv2.COLOR_BGR2GRAY)

    root = Path(templates_root)
    output: dict[str, list[dict[str, Any]]] = {}

    for obj_dir in sorted(root.iterdir()):
        if not obj_dir.is_dir():
            continue

        object_name = obj_dir.name
        if object_filter and object_name != object_filter:
            continue
        template_paths = sorted(
            p for p in obj_dir.iterdir() if p.suffix.lower() in TEMPLATE_EXTENSIONS
        )
        if not template_paths:
            continue

        raw: list[tuple[int, int, int, int, float, str]] = []

        for tpath in template_paths:
            tmpl_color = cv2.imread(str(tpath))
            if tmpl_color is None:
                continue
            tmpl_gray = cv2.cvtColor(tmpl_color, cv2.COLOR_BGR2GRAY)
            th, tw = tmpl_gray.shape[:2]

            for scale in scales:
                new_w = max(1, int(tw * scale))
                new_h = max(1, int(th * scale))
                scaled = cv2.resize(tmpl_gray, (new_w, new_h))

                for angle in angles:
                    rotated = _rotate_image(scaled, angle)
                    rh, rw = rotated.shape[:2]

                    if rh > floorplan_gray.shape[0] or rw > floorplan_gray.shape[1]:
                        continue

                    result = cv2.matchTemplate(floorplan_gray, rotated, cv2.TM_CCOEFF_NORMED)
                    locs = np.where(result >= threshold)

                    for pt in zip(*locs[::-1]):
                        raw.append((pt[0], pt[1], rw, rh, float(result[pt[1], pt[0]]), tpath.name))

        if not raw:
            output[object_name] = []
            continue

        boxes = np.array([[x, y, x + w, y + h] for x, y, w, h, *_ in raw], dtype=np.float32)
        scores = np.array([s for *_, s, _ in raw], dtype=np.float32)
        keep = _nms(boxes, scores, iou_threshold)

        detections = []
        for i in keep:
            x, y, w, h, score, tname = raw[i]
            detections.append({
                "x": int(x),
                "y": int(y),
                "w": int(w),
                "h": int(h),
                "score": round(score, 4),
                "template": tname,
            })

        output[object_name] = detections

    return output


def _rotate_image(img: np.ndarray, angle: float) -> np.ndarray:
    if angle == 0:
        return img
    h, w = img.shape[:2]
    cx, cy = w / 2, h / 2
    M = cv2.getRotationMatrix2D((cx, cy), angle, 1.0)
    cos, sin = abs(M[0, 0]), abs(M[0, 1])
    new_w = int(h * sin + w * cos)
    new_h = int(h * cos + w * sin)
    M[0, 2] += new_w / 2 - cx
    M[1, 2] += new_h / 2 - cy
    return cv2.warpAffine(img, M, (new_w, new_h), borderValue=255)


def _nms(boxes: np.ndarray, scores: np.ndarray, iou_threshold: float) -> list[int]:
    x1, y1, x2, y2 = boxes[:, 0], boxes[:, 1], boxes[:, 2], boxes[:, 3]
    areas = (x2 - x1) * (y2 - y1)
    order = scores.argsort()[::-1]
    keep: list[int] = []
    while order.size > 0:
        i = int(order[0])
        keep.append(i)
        xx1 = np.maximum(x1[i], x1[order[1:]])
        yy1 = np.maximum(y1[i], y1[order[1:]])
        xx2 = np.minimum(x2[i], x2[order[1:]])
        yy2 = np.minimum(y2[i], y2[order[1:]])
        inter = np.maximum(0, xx2 - xx1) * np.maximum(0, yy2 - yy1)
        iou = inter / (areas[i] + areas[order[1:]] - inter)
        order = order[1:][iou < iou_threshold]
    return keep
