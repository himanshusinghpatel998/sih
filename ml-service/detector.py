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


def detect_image_bytes(data: bytes) -> dict:
    from PIL import Image
    import io

    model = _load_model()
    image = Image.open(io.BytesIO(data)).convert("RGB")
    width, height = image.size
    frame_area = max(1, width * height)

    results = model.predict(image, verbose=False)
    result = results[0]

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
