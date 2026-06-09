import cv2
import numpy as np
from pathlib import Path
from ultralytics import YOLO


def detect_largest_closed_shape(image: np.ndarray) -> tuple[np.ndarray, np.ndarray, float, float]:
    """
    Detect the largest closed shape in a BGR image.

    Returns (floor_contour, approx_contour, area, perimeter).
    Returns (None, None, 0, 0) if no contours are found.
    """
    h, w = image.shape[:2]
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    _, binary = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (15, 15))
    closed = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel)

    flood_filled = closed.copy()
    mask = np.zeros((h + 2, w + 2), dtype=np.uint8)
    cv2.floodFill(flood_filled, mask, (0, 0), 255)
    flood_filled_inv = cv2.bitwise_not(flood_filled)
    filled = cv2.bitwise_or(closed, flood_filled_inv)

    contours, _ = cv2.findContours(filled, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None, None, 0, 0

    floor_contour = max(contours, key=cv2.contourArea)
    area = cv2.contourArea(floor_contour)
    perimeter = cv2.arcLength(floor_contour, True)

    epsilon = 0.005 * perimeter
    approx = cv2.approxPolyDP(floor_contour, epsilon, True)

    return floor_contour, approx, area, perimeter


def detect_floor_boundary(image_path: str, output_dir: str = None):
    image_path = Path(image_path)
    output_dir = Path(output_dir) if output_dir else image_path.parent

    original = cv2.imread(str(image_path))
    if original is None:
        raise FileNotFoundError(f"Could not load image: {image_path}")

    h, w = original.shape[:2]
    floor_contour, approx, area, perimeter = detect_largest_closed_shape(original)

    if floor_contour is None:
        print("No contours found.")
        return None

    # --- Snap nearly-axis-aligned segments to perfectly straight lines ---
    pts = approx.reshape(-1, 2).tolist()
    n = len(pts)
    SNAP_PX = 100
    for i in range(n):
        p1 = pts[i]
        p2 = pts[(i + 1) % n]
        dx = abs(p2[0] - p1[0])
        dy = abs(p2[1] - p1[1])
        if dy <= SNAP_PX and dx > dy:        # nearly horizontal: equalise Y
            mid_y = round((p1[1] + p2[1]) / 2)
            p1[1] = mid_y
            p2[1] = mid_y
        elif dx <= SNAP_PX and dy > dx:      # nearly vertical: equalise X
            mid_x = round((p1[0] + p2[0]) / 2)
            p1[0] = mid_x
            p2[0] = mid_x

    # --- Save JSON ---
    import uuid
    external_walls = []
    for i in range(n):
        p1 = pts[i]
        p2 = pts[(i + 1) % n]
        external_walls.append({
            "id": str(uuid.uuid4()),
            "type": "segment",
            "class": "Wall External",
            "points": [p1, p2],
        })

    return {
        "metadata": {
            "source": str(image_path),
            "image_size": {"width": w, "height": h},
        },
        "elements": {
            "walls": external_walls,
            "doors": [],
            "rooms": [],
        }
    }

def detect_rooms(args):
    if not args.image.exists():
        raise FileNotFoundError(f"Input image not found: {args.image}")
    if not args.weights.exists():
        raise FileNotFoundError(f"Weights file not found: {args.weights}")

    model = YOLO(args.weights)
    predict_kwargs = {
        "source": str(args.image),
        "conf": args.conf,
        "iou": args.iou,
        "imgsz": args.imgsz,
        "project": args.project,
        "name": args.name,
        "save": False,
        "show": False,
        "verbose": False,
    }
    if args.device is not None:
        predict_kwargs["device"] = args.device

    results = model.predict(**predict_kwargs)
    result = results[0]

    return result.boxes, model.names