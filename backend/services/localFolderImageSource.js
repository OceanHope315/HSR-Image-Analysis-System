import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { InspectionRecord } from '../models/InspectionRecord.js';
import { processUnifiedImageInput } from './unifiedImageInputService.js';
import { emitEvent } from '../utils/socket.js';

const supportedExtensions = new Set(['.jpg', '.jpeg', '.png', '.bmp', '.webp', '.gif']);
const observedFiles = new Map();
const processedVersions = new Set();
let pollTimer;
let scanning = false;

function localImageId(fileName, stats) {
  const base = path.basename(fileName, path.extname(fileName)).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80) || 'image';
  return `${base}-${Math.trunc(stats.mtimeMs)}-${stats.size}`.slice(0, 160);
}

export async function processLocalImageFile(filePath, stats, dependencies = {}) {
  const processInput = dependencies.processInput ?? processUnifiedImageInput;
  const findExisting = dependencies.findExisting
    ?? ((key) => InspectionRecord.findOne({ imageInputKey: key }));
  const imageId = localImageId(filePath, stats);
  const key = `local:${env.localImageDeviceId}:${imageId}`.slice(0, 320);
  const existing = await findExisting(key);
  if (existing) return { inspection: existing, duplicate: true, imageId, views: existing.imageViews ?? [] };
  const result = await processInput({
    source: 'local',
    deviceId: env.localImageDeviceId,
    imageId,
    timestamp: stats.mtime,
    views: [{
      viewId: 0,
      role: 'primary',
      path: filePath,
      fileName: path.basename(filePath),
    }],
    gasMode: 'device',
  });
  return { ...result, duplicate: false };
}

async function processStableFile(filePath, stats, version) {
  try {
    const result = await processLocalImageFile(filePath, stats);
    processedVersions.add(version);
    if (!result.duplicate) {
      emitEvent('inspection:created', result.inspection.toJSON?.() ?? result.inspection);
      emitEvent('image:processed', result.inspection.toJSON?.() ?? result.inspection);
      if (result.alarm?.level === 'high') emitEvent('alarm:high', result.alarm.toJSON?.() ?? result.alarm);
    }
    logger.info({
      file: path.basename(filePath),
      imgID: result.imageId,
      duplicate: result.duplicate,
      decodedBytes: stats.size,
      yoloMs: Math.round(result.views.reduce((total, view) => total + Number(view.inferenceTimeMs ?? 0), 0)),
    }, '[LocalImageSource] 图片处理完成');
  } catch (error) {
    const permanentInputError = error?.statusCode >= 400 && error?.statusCode < 500;
    if (permanentInputError) processedVersions.add(version);
    logger[permanentInputError ? 'warn' : 'error']({ err: error, file: filePath }, '[LocalImageSource] 图片处理失败');
  }
}

async function scanLocalFolder() {
  if (scanning) return;
  scanning = true;
  try {
    await fs.mkdir(env.localImageDir, { recursive: true });
    const entries = await fs.readdir(env.localImageDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !supportedExtensions.has(path.extname(entry.name).toLowerCase())) continue;
      const filePath = path.join(env.localImageDir, entry.name);
      const stats = await fs.stat(filePath);
      const version = `${filePath}:${stats.size}:${stats.mtimeMs}`;
      if (processedVersions.has(version)) continue;
      if (observedFiles.get(filePath) !== version) {
        observedFiles.set(filePath, version);
        continue;
      }
      await processStableFile(filePath, stats, version);
    }
  } catch (error) {
    logger.error({ err: error, directory: env.localImageDir }, '[LocalImageSource] 目录扫描失败');
  } finally {
    scanning = false;
  }
}

export function startLocalFolderImageSource() {
  if (!['local', 'both'].includes(env.imageSource) || pollTimer) return;
  logger.info({ directory: env.localImageDir, pollMs: env.localImagePollMs }, '[LocalImageSource] 本地文件夹输入已启用');
  scanLocalFolder();
  pollTimer = setInterval(scanLocalFolder, env.localImagePollMs);
  pollTimer.unref?.();
}

export function stopLocalFolderImageSource() {
  clearInterval(pollTimer);
  pollTimer = undefined;
  observedFiles.clear();
  processedVersions.clear();
}
