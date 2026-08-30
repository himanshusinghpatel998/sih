"""detector.py — YOLOv8n (pretrained COCO) object-density detector.

There is no labeled "garbage pile" dataset in this repo (ml/ only has
tabular bin data), so this is not a trained waste detector. Instead it
runs a general-purpose YOLOv8n checkpoint and reports non-person/non-vehicle
object clutter density in a frame — used as a plug-compatible replacement
signal for the old pixel-variance heuristic in cctvController.js.

If a labeled litter dataset (e.g. TACO) becomes available later, fine-tune
YOLOv8n on it and swap the weights path below — everything downstream keeps
working against the same {objectCount, coverageRatio, avgConfidence} shape.
"""
from pathlib import Path

WEIGHTS_PATH = Path(__file__).resolve().parent / "weights" / "yolov8n.pt"

# COCO classes that are structural/traffic scene elements, not clutter/litter.
IGNORE_CLASSES = {
    "person", "bicycle", "car", "motorcycle", "bus", "train", "truck",
    "traffic light", "fire hydrant", "stop sign", "parking meter", "bench",
}

_model = None


def _load_model():
    global _model
    if _model is not None:
        return _model
    from ultralytics import YOLO

    WEIGHTS_PATH.parent.mkdir(parents=True, exist_ok=True)
    # ultralytics auto-downloads the checkpoint by name if the local path
    # doesn't exist yet, then caches it at WEIGHTS_PATH for next time.
    source = str(WEIGHTS_PATH) if WEIGHTS_PATH.exists() else "yolov8n.pt"
    _model = YOLO(source)
    if not WEIGHTS_PATH.exists():
        try:
            _model.save(str(WEIGHTS_PATH))
        except Exception:
            pass
    return _model


def _run_inference(data: bytes):
    """Shared model call: decode bytes, run YOLO once, return the raw
    ultralytics Result plus frame dimensions. Both detect_image_bytes
    (clutter/litter) and detect_crowd_bytes (people) filter the same box
    list differently rather than re-running inference twice per frame.
    """
    from PIL import Image
    import io

    model = _load_model()
    image = Image.open(io.BytesIO(data)).convert("RGB")
    width, height = image.size
    results = model.predict(image, verbose=False)
    return results[0], width, height


def detect_image_bytes(data: bytes) -> dict:
    result, width, height = _run_inference(data)
    frame_area = max(1, width * height)

    boxes_out = []
    covered_area = 0
    confidences = []

    names = result.names
    for box in result.boxes:
        cls_id = int(box.cls[0])
        label = names.get(cls_id, str(cls_id))
        if label in IGNORE_CLASSES:
            continue
        conf = float(box.conf[0])
        x1, y1, x2, y2 = [float(v) for v in box.xyxy[0]]
        boxes_out.append({
            "label": label,
            "confidence": round(conf, 3),
            "box": [round(x1, 1), round(y1, 1), round(x2, 1), round(y2, 1)],
        })
        covered_area += max(0, x2 - x1) * max(0, y2 - y1)
        confidences.append(conf)

    coverage_ratio = min(1.0, covered_area / frame_area)
    avg_conf = sum(confidences) / len(confidences) if confidences else 0.0

    return {
        "objectCount": len(boxes_out),
        "avgConfidence": round(avg_conf, 3),
        "coverageRatio": round(coverage_ratio, 4),
        "boxes": boxes_out[:40],
        "imageSize": {"width": width, "height": height},
        "method": "yolov8n-coco-density-v1",
    }


# Person-count thresholds for crowd classification. Absolute count matters
# more than coverage ratio at typical CCTV distances (people far from camera
# are small on screen but the street is still genuinely crowded), so count
# is the primary signal; a high coverage ratio (people close together / near
# the camera) can still escalate a moderate count into "crowded".
def classify_crowd(count: int, coverage_ratio: float) -> str:
    if count == 0:
        return 'empty'
    if count <= 5:
        level = 'sparse'
    elif count <= 15:
        level = 'moderate'
    elif count <= 30:
        level = 'busy'
    else:
        level = 'crowded'
    # A tightly-packed frame escalates one level — but only once there are
    # already enough people that high coverage plausibly means "packed
    # crowd" rather than "close-up photo of a couple of people", which also
    # produces a high coverage ratio (a handful of large boxes) without
    # being crowded at all.
    if count > 6 and coverage_ratio > 0.35 and level == 'moderate':
        level = 'busy'
    return level


def detect_crowd_bytes(data: bytes) -> dict:
    """Person-only detection for crowd density — the counterpart to
    detect_image_bytes, which explicitly ignores people (that function is
    about litter/clutter, this one is about how many people are in frame).
    """
    result, width, height = _run_inference(data)
    frame_area = max(1, width * height)

    people = []
    covered_area = 0
    names = result.names
    for box in result.boxes:
        cls_id = int(box.cls[0])
        if names.get(cls_id) != 'person':
            continue
        conf = float(box.conf[0])
        x1, y1, x2, y2 = [float(v) for v in box.xyxy[0]]
        people.append({
            'confidence': round(conf, 3),
            'box': [round(x1, 1), round(y1, 1), round(x2, 1), round(y2, 1)],
        })
        covered_area += max(0, x2 - x1) * max(0, y2 - y1)

    coverage_ratio = min(1.0, covered_area / frame_area)
    count = len(people)
    level = classify_crowd(count, coverage_ratio)

    return {
        'peopleCount': count,
        'coverageRatio': round(coverage_ratio, 4),
        'crowdLevel': level,
        'isCrowded': level in ('busy', 'crowded'),
        'people': people[:80],
        'imageSize': {'width': width, 'height': height},
        'method': 'yolov8n-person-density-v1',
    }
