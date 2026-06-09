import cv2
import argparse
from pathlib import Path
from shapely.geometry import Polygon as ShapelyPolygon
from .detectors import detect_floor_boundary, detect_rooms
from .utils import (
    clean_overlapping_rooms,
    dedup_walls,
    merge_shared_walls,
    collapse_triangles,
    snap_wall_endpoints,
    prune_dangling_walls,
    tag_and_detect_enclosed_spaces,
    reconcile_room_walls,
    draw_overlay,
)

def repo_root() -> Path:
    return Path(__file__).resolve().parents[1]

def parse_args():
    parser = argparse.ArgumentParser(description="Run inference with a trained CubiCasa5K YOLO26 detector.")
    parser.add_argument("--image", type=Path, help="Path to an input image.")
    parser.add_argument(
        "--weights",
        type=Path,
        help="Path to the trained model weights, typically yolo_model/runs/cubicasa_yolo26/weights/best.pt.",
    )
    parser.add_argument("--output-dir", "-o", help="Directory to save outputs (default: same as image)")

    parser.add_argument("--conf", type=float, default=0.25, help="Confidence threshold.")
    parser.add_argument("--iou", type=float, default=0.7, help="IoU threshold used by NMS.")
    parser.add_argument("--imgsz", type=int, default=2048, help="Inference image size.")
    parser.add_argument("--project", default=str(repo_root() / "yolo_model" / "runs"))
    parser.add_argument("--name", default="cubicasa_yolo26_predict")
    
    parser.add_argument("--device", default=None, help="Inference device, for example cpu, 0, or 0,1.")
    parser.add_argument("--merge-walls", action="store_true", help="Merge near-duplicate shared walls between rooms.")
    parser.add_argument("--no-merge-walls", dest="merge_walls", action="store_false")
    parser.add_argument("--merge-gap", type=int, default=10, help="Max pixel distance between parallel walls to treat as shared (default: 6).")
    return parser.parse_args()


def process_floorplan(
    image: Path,
    weights: Path,
    output_dir: Path,
    merge_walls: bool = True,
    merge_gap: int = 10,
    conf: float = 0.25,
    iou: float = 0.7,
    imgsz: int = 2048,
    device=None,
) -> dict:
    """
    Run the full floor-plan detection pipeline and return the boundary dict.
    Also writes <stem>_boundary.json into output_dir.
    """
    import json
    import uuid

    image = Path(image)
    output_dir = Path(output_dir)

    # Build a namespace that detect_rooms expects
    import argparse
    args = argparse.Namespace(
        image=image,
        weights=weights,
        output_dir=str(output_dir),
        conf=conf,
        iou=iou,
        imgsz=imgsz,
        project=str(repo_root() / "yolo_model" / "runs"),
        name="cubicasa_yolo26_predict",
        device=device,
        merge_walls=merge_walls,
        merge_gap=merge_gap,
    )

    result = detect_floor_boundary(image, output_dir)
    boxes, names = detect_rooms(args)

    if result is None:
        print("No floor boundary detected.")
        return None

    boundary_pts = [w["points"][0] for w in result["elements"]["walls"]]
    floor_poly = ShapelyPolygon(boundary_pts)

    rooms = []
    if boxes is not None and len(boxes) > 0:
        for box in boxes:
            class_id = int(box.cls.item())
            class_name = names[class_id]
            if class_name != "room":
                continue

            def extract_walls_from_room_pred(x1, y1, x2, y2):
                corners = [(x1, y1), (x2, y1), (x2, y2), (x1, y2)]
                pairs = [(corners[0], corners[1]),
                         (corners[1], corners[2]),
                         (corners[2], corners[3]),
                         (corners[3], corners[0])]
                return [(p1, p2) for p1, p2 in pairs]

            x1, y1, x2, y2 = [round(v) for v in box.xyxy[0].tolist()]
            segments = extract_walls_from_room_pred(x1, y1, x2, y2)

            wall_ids = []
            for seg in segments:
                if seg is None:
                    wall_ids.append(None)
                    continue
                p1, p2 = seg
                wid = str(uuid.uuid4())
                result["elements"]["walls"].append({
                    "id": wid,
                    "type": "segment",
                    "class": "Wall Internal",
                    "points": [list(p1), list(p2)],
                })
                wall_ids.append(wid)

            rooms.append({
                "id": len(rooms) + 1,
                "class": class_name,
                "confidence": round(float(box.conf.item()), 4),
                "wall_ids": wall_ids,
                "bbox": [x1, y1, x2, y2],
            })

    result["elements"]["rooms"] = rooms

    rooms, result["elements"]["walls"] = clean_overlapping_rooms(rooms, result["elements"]["walls"])
    rooms, result["elements"]["walls"] = dedup_walls(rooms, result["elements"]["walls"])
    if merge_walls:
        rooms, result["elements"]["walls"] = merge_shared_walls(rooms, result["elements"]["walls"], gap_px=merge_gap)
    rooms, result["elements"]["walls"] = collapse_triangles(rooms, result["elements"]["walls"])

    snap_wall_endpoints(result["elements"]["walls"])
    prune_dangling_walls(result["elements"]["walls"], result["elements"]["rooms"])
    reconcile_room_walls(result["elements"]["walls"], result["elements"]["rooms"])
    tag_and_detect_enclosed_spaces(result["elements"]["walls"], result["elements"]["rooms"])

    result["elements"]["rooms"] = []

    out_json = output_dir / f"{image.stem}_boundary.json"
    with open(out_json, "w") as f:
        json.dump(result, f, indent=2)
    print(f"JSON saved:    {out_json}")

    return result


def _main_cli(args):
    process_floorplan(
        image=args.image,
        weights=args.weights,
        output_dir=args.output_dir or args.image.parent,
        merge_walls=args.merge_walls,
        merge_gap=args.merge_gap,
        conf=args.conf,
        iou=args.iou,
        imgsz=args.imgsz,
        device=args.device,
    )


if __name__ == "__main__":
    args = parse_args()
    _main_cli(args)

