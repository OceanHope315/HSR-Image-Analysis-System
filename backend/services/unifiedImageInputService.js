import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../config/env.js';
import { createInspection } from './inspectionService.js';
import { imageTypeFromFileName, normalizeImageType, validateImageBuffer } from './imageValidationService.js';
import { readSensor } from './sensorAdapterService.js';
import { analyzeXray } from './yoloAdapterService.js';
import { AppError } from '../utils/AppError.js';

function safeToken(value, fallback) {
  const token = String(value ?? '').trim().replace(/[^A-Za-z0-9_-]/g, '_').replace(/_+/g, '_');
  return token.slice(0, 50) || fallback;
}

function automaticPackageId(input, fingerprint) {
  const prefix = input.source === 'security_machine' ? 'SM' : 'LOCAL';
  const device = safeToken(input.deviceId, 'DEVICE');
  const image = safeToken(input.imageId, fingerprint.slice(0, 12));
  return `${prefix}-${device}-${image}`.slice(0, 80);
}

function storedImageUrl(filePath) {
  return `/uploads/xrays/${encodeURIComponent(path.basename(filePath))}`;
}

function isInsideUploadDir(filePath) {
  const root = `${path.resolve(env.uploadDir)}${path.sep}`.toLowerCase();
  return path.resolve(filePath).toLowerCase().startsWith(root);
}

async function materializeView(input, view, ownedPaths) {
  let buffer;
  if (Buffer.isBuffer(view.buffer)) buffer = view.buffer;
  else if (view.path) {
    try {
      buffer = await fs.readFile(view.path);
    } catch (error) {
      throw new AppError(400, 'IMAGE_READ_FAILED', `无法读取视角 ${view.viewId} 图片`, [{ message: error.message }]);
    }
  } else {
    throw new AppError(400, 'IMAGE_MISSING', `视角 ${view.viewId} 没有图片数据`);
  }

  const declaredType = normalizeImageType(view.imageType)
    ?? normalizeImageType(view.mimetype)
    ?? imageTypeFromFileName(view.fileName ?? view.path);
  const details = validateImageBuffer(buffer, {
    declaredType,
    maxBytes: env.securityMachineImageLimitBytes,
    label: `视角 ${view.viewId} 图片`,
  });

  let filePath;
  if (view.managedPath && view.path && isInsideUploadDir(view.path)) {
    filePath = path.resolve(view.path);
  } else {
    await fs.mkdir(env.uploadDir, { recursive: true });
    const fileName = `${safeToken(input.imageId, 'image')}-v${view.viewId}-${crypto.randomUUID()}${details.extension}`;
    filePath = path.join(env.uploadDir, fileName);
    await fs.writeFile(filePath, buffer, { flag: 'wx' });
    ownedPaths.add(filePath);
  }

  return {
    viewId: Number(view.viewId),
    role: Number(view.viewId) === 0 ? 'primary' : 'side',
    fileName: String(view.fileName ?? path.basename(filePath)).slice(0, 200),
    filePath,
    originalImageUrl: storedImageUrl(filePath),
    mimetype: details.mimetype,
    imageType: details.type,
    decodedSize: buffer.length,
    buffer,
  };
}

function inputKey(input) {
  if (!input.deviceId || !input.imageId || !['local', 'security_machine'].includes(input.source)) return undefined;
  return `${input.source}:${input.deviceId}:${input.imageId}`.slice(0, 320);
}

export async function processUnifiedImageInput(input, dependencies = {}) {
  const analyze = dependencies.analyze ?? analyzeXray;
  const persist = dependencies.persist ?? createInspection;
  const sensorReader = dependencies.readSensor ?? readSensor;
  const ownedPaths = new Set();
  let retainOwnedFiles = false;

  if (!input || !['manual_upload', 'local', 'security_machine'].includes(input.source)) {
    throw new AppError(400, 'IMAGE_SOURCE_INVALID', '图片来源不合法');
  }
  if (!Array.isArray(input.views) || input.views.length === 0) {
    throw new AppError(400, 'IMAGE_MISSING', '至少需要一个图片视角');
  }
  const viewIds = input.views.map((view) => Number(view.viewId));
  if (viewIds.some((viewId) => ![0, 1].includes(viewId)) || new Set(viewIds).size !== viewIds.length) {
    throw new AppError(400, 'IMAGE_VIEW_INVALID', '图片视角只能是唯一的 0 或 1');
  }

  try {
    const materializedViews = [];
    for (const view of [...input.views].sort((left, right) => left.viewId - right.viewId)) {
      materializedViews.push(await materializeView(input, view, ownedPaths));
    }

    const hash = crypto.createHash('sha256');
    for (const view of materializedViews) hash.update(String(view.viewId)).update(view.buffer);
    const fingerprint = hash.digest('hex');
    const processedViews = [];
    for (const view of materializedViews) {
      const startedAt = performance.now();
      const vision = await analyze(view.filePath, { mode: 'real', mimetype: view.mimetype });
      const detections = (vision.detections ?? []).map((detection) => ({ ...detection, viewId: view.viewId }));
      processedViews.push({
        ...view,
        detections,
        annotatedImageUrl: vision.annotatedImageUrl,
        imageWidth: vision.imageWidth,
        imageHeight: vision.imageHeight,
        inferenceTimeMs: vision.inferenceTimeMs ?? performance.now() - startedAt,
        modelName: vision.modelName,
        modelVersion: vision.modelVersion,
      });
    }

    const gasMode = input.gasMode === 'simulation' ? 'simulation' : 'device';
    const gasSensor = await sensorReader({ mode: gasMode, data: input.gasSimulationData });
    const primaryView = processedViews.find((view) => view.viewId === 0) ?? processedViews[0];
    const detections = processedViews.flatMap((view) => view.detections);
    const totalInferenceTime = processedViews.reduce((total, view) => total + Number(view.inferenceTimeMs ?? 0), 0);
    const recordInput = {
      packageId: input.packageId ?? automaticPackageId(input, fingerprint),
      timestamp: input.timestamp ?? new Date(),
      deviceId: input.businessDeviceId,
      xrayImageUrl: primaryView.originalImageUrl,
      originalImageUrl: primaryView.originalImageUrl,
      annotatedImageUrl: primaryView.annotatedImageUrl,
      inferenceTimeMs: totalInferenceTime,
      imageWidth: primaryView.imageWidth,
      imageHeight: primaryView.imageHeight,
      imageFingerprint: fingerprint,
      xrayResult: detections,
      imageSource: input.source,
      sourceDeviceId: input.deviceId ?? null,
      sourceImageId: input.imageId ?? null,
      imageInputKey: inputKey(input),
      imageType: primaryView.imageType,
      imageTime: input.timestamp ?? new Date(),
      imageViews: processedViews.map((view) => ({
        viewId: view.viewId,
        role: view.role,
        fileName: view.fileName,
        originalImageUrl: view.originalImageUrl,
        annotatedImageUrl: view.annotatedImageUrl,
        imageWidth: view.imageWidth,
        imageHeight: view.imageHeight,
        inferenceTimeMs: view.inferenceTimeMs,
        decodedSize: view.decodedSize,
        detections: view.detections,
      })),
      gasSensor,
      sourceMode: { vision: 'real', gas: gasMode },
      serviceStatus: {
        yolo: 'online',
        gas: gasMode === 'simulation' ? 'simulation' : gasSensor?.connectionStatus ?? 'offline',
      },
      source: 'api',
      status: 'pending',
    };
    const persisted = await persist(recordInput, input.operatorId ?? null);
    retainOwnedFiles = true;
    return {
      ...persisted,
      imageId: input.imageId,
      deviceId: input.deviceId,
      source: input.source,
      views: processedViews.map(({ buffer: _buffer, filePath: _filePath, ...view }) => view),
    };
  } finally {
    if (!retainOwnedFiles) {
      await Promise.all([...ownedPaths].map((filePath) => fs.unlink(filePath).catch(() => undefined)));
    }
  }
}
