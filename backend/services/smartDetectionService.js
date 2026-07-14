import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { env } from '../config/env.js';
import { InspectionRecord } from '../models/InspectionRecord.js';
import { AppError } from '../utils/AppError.js';
import { createInspection } from './inspectionService.js';
import { readSensor } from './sensorAdapterService.js';
import { analyzeXray, createMockYoloResult } from './yoloAdapterService.js';

const inFlightDetections = new Set();

async function imageFingerprint(filePath) {
  const content = await fs.readFile(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

function uploadedImageUrl(file) {
  return file ? `/uploads/xrays/${encodeURIComponent(file.filename)}` : null;
}

async function assertNotRecentlySubmitted(fingerprint) {
  if (!fingerprint || env.detectionDuplicateWindowSeconds === 0) return;
  const createdAfter = new Date(Date.now() - env.detectionDuplicateWindowSeconds * 1_000);
  const duplicate = await InspectionRecord.findOne({
    imageFingerprint: fingerprint,
    createdAt: { $gte: createdAfter },
    isDeleted: false,
  }).select('_id packageId createdAt').lean();
  if (duplicate) {
    throw new AppError(409, 'DUPLICATE_IMAGE', '该图片刚刚已经提交，请勿重复点击检测', [{
      inspectionId: String(duplicate._id),
      packageId: duplicate.packageId,
      createdAt: duplicate.createdAt,
    }]);
  }
}

export async function runSmartDetection(input, file, operatorId) {
  if (input.visionMode === 'real' && !file) {
    throw new AppError(400, 'IMAGE_REQUIRED', '真实 YOLO 检测必须选择一张图片');
  }

  let fingerprint = null;
  let retainUploadedImage = false;
  let inFlightKey = null;
  let ownsInFlightKey = false;

  try {
    if (file) fingerprint = await imageFingerprint(file.path);
    inFlightKey = `${input.packageId}:${fingerprint ?? 'no-image'}`;
    if (inFlightDetections.has(inFlightKey)) {
      throw new AppError(409, 'DETECTION_IN_PROGRESS', '相同检测正在处理中，请勿重复提交');
    }
    inFlightDetections.add(inFlightKey);
    ownsInFlightKey = true;
    await assertNotRecentlySubmitted(fingerprint);
    const vision = input.visionMode === 'real'
      ? await analyzeXray(file.path, { mode: 'real', mimetype: file.mimetype })
      : await analyzeXray(file?.path, {
        mode: 'simulation',
        detections: input.visionSimulationData ?? createMockYoloResult(),
      });
    const gasSensor = input.gasMode === 'device'
      ? await readSensor({ mode: 'device' })
      : await readSensor({ mode: 'simulation', data: input.gasSimulationData });
    const xrayImageUrl = uploadedImageUrl(file);
    const sourceMode = {
      vision: input.visionMode,
      gas: input.gasMode === 'device' ? 'device' : 'simulation',
    };
    const serviceStatus = {
      yolo: input.visionMode === 'real' ? 'online' : 'simulation',
      gas: input.gasMode === 'device' ? gasSensor.connectionStatus : 'simulation',
    };

    const result = await createInspection({
      packageId: input.packageId,
      timestamp: input.timestamp,
      deviceId: input.deviceId,
      xrayImageUrl,
      originalImageUrl: xrayImageUrl,
      annotatedImageUrl: vision.annotatedImageUrl,
      inferenceTimeMs: vision.inferenceTimeMs,
      imageWidth: vision.imageWidth,
      imageHeight: vision.imageHeight,
      imageFingerprint: fingerprint,
      xrayResult: vision.detections,
      gasSensor,
      sourceMode,
      serviceStatus,
      source: input.visionMode === 'simulation' && input.gasMode === 'simulation' ? 'simulation' : 'api',
      status: 'pending',
    }, operatorId);
    retainUploadedImage = true;
    return result;
  } finally {
    if (ownsInFlightKey) inFlightDetections.delete(inFlightKey);
    if (file && !retainUploadedImage) await fs.unlink(file.path).catch(() => undefined);
  }
}
