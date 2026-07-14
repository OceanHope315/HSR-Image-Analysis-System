"""YOLO model lifecycle and JSON-safe inference results."""

from __future__ import annotations

import math
import threading
import time
from pathlib import Path
from typing import Any

import cv2
import numpy as np
import torch
from ultralytics import YOLO


SERVICE_ROOT = Path(__file__).resolve().parent


class DetectorError(RuntimeError):
    """Base error carrying a stable API error code."""

    code = "DETECTOR_ERROR"


class ModelNotFoundError(DetectorError):
    code = "MODEL_NOT_FOUND"


class ModelLoadError(DetectorError):
    code = "MODEL_LOAD_FAILED"


class InferenceError(DetectorError):
    code = "INFERENCE_FAILED"


def select_device() -> str:
    """Select CUDA when the installed PyTorch build can use it, otherwise CPU."""

    return "cuda:0" if torch.cuda.is_available() else "cpu"


def display_device(device: str) -> str:
    return "cuda" if device.startswith("cuda") else "cpu"


def resolve_model_path(configured_path: str) -> Path:
    path = Path(configured_path).expanduser()
    if not path.is_absolute():
        path = SERVICE_ROOT / path
    return path.resolve()


def _class_name(names: Any, class_id: int) -> str:
    if isinstance(names, dict):
        return str(names.get(class_id, class_id))
    try:
        return str(names[class_id])
    except (IndexError, KeyError, TypeError):
        return str(class_id)


class YoloDetector:
    """A single, process-wide Ultralytics model guarded for concurrent requests."""

    def __init__(self, model_path: str) -> None:
        self.model_path = resolve_model_path(model_path)
        self.device = select_device()
        self._inference_lock = threading.Lock()

        if not self.model_path.is_file():
            raise ModelNotFoundError(
                f"YOLO 模型不存在：{self.model_path}。请检查 YOLO_MODEL_PATH。"
            )

        try:
            self.model = YOLO(str(self.model_path))
            # Move weights during startup so device errors are reported before /predict.
            self.model.to(self.device)
        except Exception as exc:  # Ultralytics/PyTorch raise several exception types.
            raise ModelLoadError(f"YOLO 模型加载失败：{exc}") from exc

    def predict(self, image_path: Path, output_path: Path) -> dict[str, Any]:
        """Run detection once and save the result.plot() annotation as JPEG."""

        started_at = time.perf_counter()
        try:
            # cv2.imread may fail on non-ASCII Windows paths; decode bytes instead.
            encoded_image = np.frombuffer(image_path.read_bytes(), dtype=np.uint8)
            source_image = cv2.imdecode(encoded_image, cv2.IMREAD_COLOR)
            if source_image is None:
                raise ValueError("OpenCV 无法解码该图片")

            with self._inference_lock:
                results = self.model.predict(
                    source=source_image,
                    device=self.device,
                    verbose=False,
                )

            if not results:
                raise ValueError("模型未返回推理结果")

            result = results[0]
            annotated_image = result.plot()
            encode_ok, encoded_output = cv2.imencode(
                ".jpg",
                annotated_image,
                [cv2.IMWRITE_JPEG_QUALITY, 92],
            )
            if not encode_ok:
                raise OSError("标注图片编码失败")
            # Path.write_bytes supports the workspace's non-ASCII Windows path.
            output_path.write_bytes(encoded_output.tobytes())

            detections: list[dict[str, Any]] = []
            boxes = result.boxes
            if boxes is not None and len(boxes) > 0:
                coordinates = boxes.xyxy.detach().cpu().tolist()
                confidences = boxes.conf.detach().cpu().tolist()
                class_ids = boxes.cls.detach().cpu().tolist()

                for box, confidence, raw_class_id in zip(
                    coordinates, confidences, class_ids, strict=True
                ):
                    class_id = int(raw_class_id)
                    detections.append(
                        {
                            "label": _class_name(result.names, class_id),
                            "confidence": round(
                                min(1.0, max(0.0, float(confidence))), 6
                            ),
                            "box": [round(float(value), 2) for value in box],
                        }
                    )

            height, width = result.orig_shape
            elapsed_ms = (time.perf_counter() - started_at) * 1000
            reported_ms = getattr(result, "speed", {}).get("inference")
            if reported_ms is None or not math.isfinite(float(reported_ms)):
                reported_ms = elapsed_ms

            return {
                "detections": detections,
                "imageWidth": int(width),
                "imageHeight": int(height),
                "inferenceTimeMs": round(float(reported_ms), 2),
                "modelName": self.model_path.name,
                "modelVersion": self.model_path.stem or "custom",
                "device": display_device(self.device),
            }
        except InferenceError:
            raise
        except Exception as exc:
            raise InferenceError(f"YOLO 推理失败：{exc}") from exc
