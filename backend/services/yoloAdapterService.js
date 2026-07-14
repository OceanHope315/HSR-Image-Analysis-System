import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';

const safeItems = ['umbrella', 'laptop', 'book', 'clothes', 'backpack'];
const riskyItems = ['knife', 'lighter', 'aerosol', 'flammable_liquid'];
const mimeByExtension = new Map([
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.bmp', 'image/bmp'],
  ['.webp', 'image/webp'],
  ['.gif', 'image/gif'],
]);

function bbox(random) {
  return {
    x: Math.round(random() * 500),
    y: Math.round(random() * 300),
    width: Math.round(40 + random() * 160),
    height: Math.round(40 + random() * 160),
  };
}

export function createMockYoloResult({ risk = 'low', random = Math.random } = {}) {
  const count = risk === 'high' ? 2 : 1;
  return Array.from({ length: count }, (_, index) => {
    const source = risk === 'low' ? safeItems : riskyItems;
    return {
      className: source[Math.floor(random() * source.length)],
      confidence: Number((risk === 'low' ? 0.55 + random() * 0.35 : 0.78 + random() * 0.2).toFixed(3)),
      bbox: bbox(random),
      modelName: 'mock-yolo',
      modelVersion: 'simulation-v1',
      ...(index === 0 ? {} : { className: 'lighter' }),
    };
  });
}

function absoluteServiceUrl(value) {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  return new URL(value, `${env.yoloServiceUrl}/`).toString();
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function normalizeYoloResponse(payload = {}) {
  const data = payload?.data ?? payload;
  const modelName = String(data?.modelName ?? 'ultralytics-yolo');
  const modelVersion = String(data?.modelVersion ?? 'custom');
  const rawDetections = Array.isArray(data?.detections) ? data.detections : [];
  const detections = rawDetections.flatMap((item) => {
    const confidence = finiteNumber(item?.confidence);
    const className = String(item?.label ?? item?.className ?? '').trim();
    const rawBox = Array.isArray(item?.box) ? item.box : null;
    let normalizedBox;
    if (rawBox?.length === 4) {
      const [x1, y1, x2, y2] = rawBox.map(finiteNumber);
      if ([x1, y1, x2, y2].some((value) => value === null)) return [];
      normalizedBox = {
        x: Math.max(0, x1),
        y: Math.max(0, y1),
        width: Math.max(0, x2 - x1),
        height: Math.max(0, y2 - y1),
      };
    } else if (item?.bbox && typeof item.bbox === 'object') {
      const values = ['x', 'y', 'width', 'height'].map((key) => finiteNumber(item.bbox[key]));
      if (values.some((value) => value === null)) return [];
      normalizedBox = Object.fromEntries(['x', 'y', 'width', 'height'].map((key, index) => [key, Math.max(0, values[index])]));
    } else {
      return [];
    }
    if (!className || confidence === null || confidence < 0 || confidence > 1) return [];
    return [{ className, confidence, bbox: normalizedBox, modelName, modelVersion }];
  });

  return {
    detections,
    imageWidth: finiteNumber(data?.imageWidth),
    imageHeight: finiteNumber(data?.imageHeight),
    inferenceTimeMs: finiteNumber(data?.inferenceTimeMs),
    annotatedImageUrl: absoluteServiceUrl(data?.annotatedImageUrl),
    modelName,
    modelVersion,
    device: data?.device ?? null,
  };
}

async function fetchJson(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref?.();
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const payload = await response.json().catch(() => null);
    return { response, payload };
  } finally {
    clearTimeout(timer);
  }
}

function yoloError(response, payload) {
  const detail = payload?.detail;
  const source = payload?.error ?? (detail && typeof detail === 'object' ? detail : {});
  const code = source?.code ?? (response.status === 503 ? 'YOLO_MODEL_NOT_LOADED' : 'YOLO_PREDICTION_FAILED');
  const message = source?.message
    ?? payload?.message
    ?? (typeof source?.detail === 'string' ? source.detail : null)
    ?? (typeof detail === 'string' ? detail : null)
    ?? 'YOLO 检测服务返回错误';
  const statusCode = response.status === 503 ? 503 : response.status === 504 ? 504 : 502;
  const details = source?.details ?? (source?.detail ? [{ message: String(source.detail) }] : []);
  return new AppError(statusCode, code, message, details);
}

export async function getYoloStatus() {
  try {
    const { response, payload } = await fetchJson(`${env.yoloServiceUrl}/health`, { method: 'GET' }, env.yoloHealthTimeoutMs);
    const data = payload?.data ?? payload ?? {};
    return {
      status: response.ok && data.status !== 'offline' ? 'online' : 'offline',
      modelLoaded: Boolean(data.modelLoaded),
      device: data.device ?? null,
      service: data.service ?? 'yolo',
      error: response.ok ? data.error ?? null : data.error?.message ?? data.message ?? 'YOLO 健康检查失败',
    };
  } catch (error) {
    return {
      status: 'offline',
      modelLoaded: false,
      device: null,
      service: 'yolo',
      error: error?.name === 'AbortError' ? 'YOLO 健康检查超时' : '无法连接 YOLO 服务',
    };
  }
}

export async function analyzeXray(imageReference, options = {}) {
  if (options.mode === 'simulation') {
    const detections = options.detections ?? createMockYoloResult(options);
    return {
      detections,
      imageWidth: null,
      imageHeight: null,
      inferenceTimeMs: 0,
      annotatedImageUrl: null,
      modelName: 'mock-yolo',
      modelVersion: 'simulation-v1',
      device: 'simulation',
    };
  }
  if (!imageReference) throw new AppError(400, 'IMAGE_REQUIRED', '真实 YOLO 检测必须上传图片');

  let fileBuffer;
  try {
    fileBuffer = await fs.readFile(imageReference);
  } catch (error) {
    throw new AppError(400, 'IMAGE_READ_FAILED', '无法读取待检测图片', [{ message: error.message }]);
  }

  const extension = path.extname(imageReference).toLowerCase();
  const formData = new FormData();
  formData.append('image', new Blob([fileBuffer], { type: options.mimetype ?? mimeByExtension.get(extension) ?? 'application/octet-stream' }), path.basename(imageReference));

  let result;
  try {
    result = await fetchJson(`${env.yoloServiceUrl}/predict`, { method: 'POST', body: formData }, env.yoloRequestTimeoutMs);
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new AppError(504, 'YOLO_SERVICE_TIMEOUT', 'YOLO 检测超时，请检查模型服务或切换视觉模拟模式');
    }
    throw new AppError(503, 'YOLO_SERVICE_OFFLINE', '无法连接 YOLO 服务，请先启动 Python 服务或切换视觉模拟模式', [{ message: error.message }]);
  }
  if (!result.response.ok || result.payload?.success === false) throw yoloError(result.response, result.payload);
  return normalizeYoloResponse(result.payload);
}
