import fs from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { env } from '../../config/env.js';
import { processLocalImageFile } from '../../services/localFolderImageSource.js';
import { clearSecurityMachineInFlightRequests, processSecurityMachineInput } from '../../services/securityMachineService.js';
import { processUnifiedImageInput } from '../../services/unifiedImageInputService.js';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
const generatedFiles = [];

function input(viewCount = 1) {
  return {
    source: 'security_machine',
    deviceId: 'TEST_000001',
    imageId: `20260818_093015_12${viewCount}`,
    timestamp: new Date('2026-08-18T09:30:15.123Z'),
    views: Array.from({ length: viewCount }, (_, viewId) => ({
      viewId,
      role: viewId === 0 ? 'primary' : 'side',
      fileName: `view-${viewId}.png`,
      buffer: png,
      mimetype: 'image/png',
    })),
  };
}

function dependencies(analyze = vi.fn(async () => ({
  detections: [{ className: 'knife', confidence: 0.9, bbox: { x: 1, y: 2, width: 3, height: 4 } }],
  imageWidth: 1,
  imageHeight: 1,
  inferenceTimeMs: 5,
  annotatedImageUrl: 'http://127.0.0.1:8000/outputs/result.jpg',
  modelName: 'test',
  modelVersion: 'v1',
}))) {
  return {
    analyze,
    readSensor: vi.fn(async () => ({ sensorStatus: 'offline', connectionStatus: 'offline', source: 'device' })),
    persist: vi.fn(async (record) => {
      for (const view of record.imageViews) {
        generatedFiles.push(path.join(env.uploadDir, decodeURIComponent(view.originalImageUrl.split('/').at(-1))));
      }
      return { inspection: record, alarm: null, transactionUsed: false };
    }),
  };
}

afterEach(async () => {
  clearSecurityMachineInFlightRequests();
  await Promise.all(generatedFiles.splice(0).map((filePath) => fs.unlink(filePath).catch(() => undefined)));
});

describe('统一图片输入服务', () => {
  it('双视角逐张复用同一个 YOLO 分析函数并保留 viewId', async () => {
    const deps = dependencies();
    const result = await processUnifiedImageInput(input(2), deps);
    expect(deps.analyze).toHaveBeenCalledTimes(2);
    expect(result.views.map((view) => view.viewId)).toEqual([0, 1]);
    expect(result.inspection.xrayResult.map((item) => item.viewId)).toEqual([0, 1]);
    expect(result.inspection.imageViews).toHaveLength(2);
  });

  it('YOLO 抛错时向上传递异常且不持久化', async () => {
    const failure = new Error('YOLO failure');
    const deps = dependencies(vi.fn(async () => { throw failure; }));
    await expect(processUnifiedImageInput(input(1), deps)).rejects.toBe(failure);
    expect(deps.persist).not.toHaveBeenCalled();
  });

  it('重复 devID + imgID 复用已保存结果，不重复处理', async () => {
    let stored = null;
    const processInput = vi.fn(async (value) => {
      stored = { imageViews: [], sourceImageId: value.imageId };
      return { inspection: stored, views: [], imageId: value.imageId, alarm: null };
    });
    const deps = { findExisting: vi.fn(async () => stored), processInput };
    const first = await processSecurityMachineInput(input(1), deps);
    const second = await processSecurityMachineInput(input(1), deps);
    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(processInput).toHaveBeenCalledOnce();
  });

  it('本地文件夹源转换为同一统一输入对象', async () => {
    const processInput = vi.fn(async (value) => ({ inspection: value, views: [], imageId: value.imageId }));
    const stats = { size: png.length, mtimeMs: 1_787_000_000_000, mtime: new Date(1_787_000_000_000) };
    const result = await processLocalImageFile('D:/demo/local-main.png', stats, {
      findExisting: vi.fn(async () => null),
      processInput,
    });
    expect(result.duplicate).toBe(false);
    expect(processInput).toHaveBeenCalledWith(expect.objectContaining({
      source: 'local',
      views: [expect.objectContaining({ viewId: 0, path: 'D:/demo/local-main.png' })],
    }));
  });
});
