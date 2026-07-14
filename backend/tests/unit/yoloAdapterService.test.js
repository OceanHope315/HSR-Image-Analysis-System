import { describe, expect, it } from 'vitest';
import { normalizeYoloResponse } from '../../services/yoloAdapterService.js';

describe('YOLO 响应规范化', () => {
  it('把 xyxy 转为现有 bbox，并保留 0 到 1 的置信度', () => {
    const result = normalizeYoloResponse({
      success: true,
      data: {
        detections: [{ label: 'lighter', confidence: 0.84, box: [10, 20, 110, 220] }],
        imageWidth: 640,
        imageHeight: 480,
        inferenceTimeMs: 52,
        annotatedImageUrl: '/outputs/result.jpg',
        modelName: 'best.pt',
        modelVersion: 'custom',
      },
    });
    expect(result.detections[0]).toMatchObject({
      className: 'lighter',
      confidence: 0.84,
      bbox: { x: 10, y: 20, width: 100, height: 200 },
      modelName: 'best.pt',
    });
    expect(result.annotatedImageUrl).toMatch(/\/outputs\/result\.jpg$/);
  });

  it('空目标保持空数组，非法坐标或置信度不会进入业务数据', () => {
    expect(normalizeYoloResponse({ data: { detections: [] } }).detections).toEqual([]);
    const result = normalizeYoloResponse({ data: { detections: [
      { label: 'knife', confidence: 2, box: [0, 0, 10, 10] },
      { label: 'lighter', confidence: 0.9, box: ['bad', 0, 10, 10] },
    ] } });
    expect(result.detections).toEqual([]);
  });
});
