"""FastAPI entrypoint for the local YOLO inference service."""

from __future__ import annotations

import logging
import os
import warnings
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any
from uuid import uuid4

from dotenv import load_dotenv
from fastapi import FastAPI, File, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image, UnidentifiedImageError
from starlette.concurrency import run_in_threadpool

from detector import (
    InferenceError,
    ModelLoadError,
    ModelNotFoundError,
    YoloDetector,
    display_device,
    select_device,
)


SERVICE_ROOT = Path(__file__).resolve().parent
UPLOADS_DIR = SERVICE_ROOT / "uploads"
OUTPUTS_DIR = SERVICE_ROOT / "outputs"
MODELS_DIR = SERVICE_ROOT / "models"

for directory in (UPLOADS_DIR, OUTPUTS_DIR, MODELS_DIR):
    directory.mkdir(parents=True, exist_ok=True)

load_dotenv(SERVICE_ROOT / ".env")

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO").upper())
logger = logging.getLogger("yolo-service")

SUPPORTED_EXTENSIONS = {
    ".jpg": "JPEG",
    ".jpeg": "JPEG",
    ".png": "PNG",
    ".bmp": "BMP",
    ".webp": "WEBP",
}
SUPPORTED_CONTENT_TYPES = {
    "image/jpeg",
    "image/png",
    "image/bmp",
    "image/x-bmp",
    "image/x-ms-bmp",
    "image/webp",
    "application/octet-stream",
}


def _max_upload_bytes() -> int:
    raw_value = os.getenv("YOLO_MAX_UPLOAD_MB", "10")
    try:
        megabytes = float(raw_value)
    except ValueError as exc:
        raise RuntimeError("YOLO_MAX_UPLOAD_MB 必须是正数") from exc
    if megabytes <= 0:
        raise RuntimeError("YOLO_MAX_UPLOAD_MB 必须是正数")
    return int(megabytes * 1024 * 1024)


MAX_UPLOAD_BYTES = _max_upload_bytes()
MODEL_PATH = os.getenv("YOLO_MODEL_PATH", "./models/best.pt")


class ApiError(Exception):
    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        detail: Any = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.detail = detail if detail is not None else message


def _error_payload(message: str, code: str, detail: Any) -> dict[str, Any]:
    return {
        "success": False,
        "message": message,
        "error": {"code": code, "detail": detail},
    }


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.detector = None
    app.state.model_error = None
    app.state.device = display_device(select_device())

    try:
        detector = YoloDetector(MODEL_PATH)
        app.state.detector = detector
        app.state.device = display_device(detector.device)
        logger.info(
            "YOLO model loaded once at startup (model=%s, device=%s)",
            detector.model_path,
            app.state.device,
        )
    except ModelNotFoundError as exc:
        app.state.model_error = {"code": exc.code, "detail": str(exc)}
        logger.error("%s", exc)
    except ModelLoadError as exc:
        app.state.model_error = {"code": exc.code, "detail": str(exc)}
        logger.exception("YOLO model initialization failed")
    except Exception as exc:
        app.state.model_error = {
            "code": "MODEL_LOAD_FAILED",
            "detail": f"YOLO 模型初始化失败：{exc}",
        }
        logger.exception("Unexpected YOLO model initialization failure")

    yield

    app.state.detector = None


app = FastAPI(
    title="Rail Security YOLO Service",
    version="1.0.0",
    lifespan=lifespan,
)
app.mount("/outputs", StaticFiles(directory=str(OUTPUTS_DIR)), name="outputs")


@app.exception_handler(ApiError)
async def api_error_handler(_request: Request, exc: ApiError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content=_error_payload(exc.message, exc.code, exc.detail),
    )


@app.exception_handler(RequestValidationError)
async def validation_error_handler(
    _request: Request, exc: RequestValidationError
) -> JSONResponse:
    details = [
        {
            "field": ".".join(str(part) for part in issue.get("loc", [])),
            "message": issue.get("msg", "请求参数无效"),
        }
        for issue in exc.errors()
    ]
    return JSONResponse(
        status_code=422,
        content=_error_payload("请求参数校验失败", "VALIDATION_ERROR", details),
    )


@app.exception_handler(Exception)
async def unexpected_error_handler(_request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled YOLO service error", exc_info=exc)
    return JSONResponse(
        status_code=500,
        content=_error_payload(
            "YOLO 服务内部错误", "INTERNAL_ERROR", "请查看服务日志"
        ),
    )


@app.get("/health")
async def health(request: Request) -> JSONResponse:
    detector = getattr(request.app.state, "detector", None)
    if detector is not None:
        return JSONResponse(
            content={
                "success": True,
                "service": "yolo",
                "status": "online",
                "modelLoaded": True,
                "device": request.app.state.device,
            }
        )

    model_error = getattr(request.app.state, "model_error", None) or {
        "code": "MODEL_NOT_LOADED",
        "detail": "YOLO 模型尚未加载",
    }
    return JSONResponse(
        status_code=503,
        content={
            "success": False,
            "service": "yolo",
            "status": "degraded",
            "modelLoaded": False,
            "device": request.app.state.device,
            "message": "YOLO 模型不可用",
            "error": model_error,
        },
    )


async def _save_upload(upload: UploadFile, destination: Path) -> int:
    size = 0
    try:
        with destination.open("wb") as output_file:
            while chunk := await upload.read(1024 * 1024):
                size += len(chunk)
                if size > MAX_UPLOAD_BYTES:
                    raise ApiError(
                        413,
                        "FILE_TOO_LARGE",
                        "上传图片过大",
                        f"图片不能超过 {MAX_UPLOAD_BYTES / 1024 / 1024:g} MB",
                    )
                output_file.write(chunk)
    except ApiError:
        raise
    except OSError as exc:
        raise ApiError(
            500,
            "UPLOAD_WRITE_FAILED",
            "上传图片保存失败",
            str(exc),
        ) from exc

    if size == 0:
        raise ApiError(400, "EMPTY_FILE", "上传图片为空")
    return size


def _validate_image(path: Path, expected_format: str) -> None:
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(path) as image:
                actual_format = (image.format or "").upper()
                image.verify()
    except (UnidentifiedImageError, OSError, SyntaxError) as exc:
        raise ApiError(
            400,
            "INVALID_IMAGE",
            "上传文件不是有效图片或图片已损坏",
            str(exc),
        ) from exc
    except (Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
        raise ApiError(
            413,
            "IMAGE_DIMENSIONS_TOO_LARGE",
            "图片像素尺寸过大",
            str(exc),
        ) from exc

    if actual_format != expected_format:
        raise ApiError(
            415,
            "IMAGE_FORMAT_MISMATCH",
            "图片扩展名与实际格式不一致",
            f"扩展名要求 {expected_format}，实际为 {actual_format or '未知'}",
        )


@app.post("/predict")
async def predict(
    request: Request,
    image: UploadFile = File(..., description="JPG、JPEG、PNG、BMP 或 WebP 图片"),
) -> dict[str, Any]:
    request_id = uuid4().hex
    upload_path: Path | None = None
    output_name = f"result_{request_id}.jpg"
    output_path = OUTPUTS_DIR / output_name
    output_ready = False

    try:
        detector: YoloDetector | None = getattr(
            request.app.state, "detector", None
        )
        if detector is None:
            model_error = getattr(request.app.state, "model_error", None) or {}
            raise ApiError(
                503,
                model_error.get("code", "MODEL_NOT_LOADED"),
                "YOLO 模型不可用",
                model_error.get("detail", "请检查模型配置并重启服务"),
            )

        original_name = image.filename or ""
        suffix = Path(original_name).suffix.lower()
        expected_format = SUPPORTED_EXTENSIONS.get(suffix)
        if expected_format is None:
            raise ApiError(
                415,
                "UNSUPPORTED_FILE_TYPE",
                "不支持的图片格式",
                "仅支持 jpg、jpeg、png、bmp、webp",
            )

        content_type = (image.content_type or "").lower()
        if content_type and content_type not in SUPPORTED_CONTENT_TYPES:
            raise ApiError(
                415,
                "UNSUPPORTED_CONTENT_TYPE",
                "不支持的图片 Content-Type",
                content_type,
            )

        upload_path = UPLOADS_DIR / f"upload_{request_id}{suffix}"
        await _save_upload(image, upload_path)
        await run_in_threadpool(_validate_image, upload_path, expected_format)
        try:
            result = await run_in_threadpool(
                detector.predict, upload_path, output_path
            )
        except InferenceError as exc:
            raise ApiError(500, exc.code, "YOLO 推理失败", str(exc)) from exc

        output_ready = True
        result["annotatedImageUrl"] = f"/outputs/{output_name}"
        return {
            "success": True,
            "message": "Detection completed",
            "data": result,
        }
    finally:
        await image.close()
        if upload_path is not None:
            upload_path.unlink(missing_ok=True)
        if not output_ready:
            output_path.unlink(missing_ok=True)
