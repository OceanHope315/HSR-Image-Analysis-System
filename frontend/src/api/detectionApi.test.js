import { beforeEach, describe, expect, it, vi } from 'vitest';
import { detectionApi } from './detectionApi.js';

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json' },
    json: vi.fn().mockResolvedValue(payload),
    text: vi.fn().mockResolvedValue(JSON.stringify(payload)),
  };
}

describe('智能检测 API', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('使用 multipart 提交模式、模拟数据和可选图片', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true, data: { inspection: { _id: 'inspection-1' } } }, 201));
    vi.stubGlobal('fetch', fetchMock);
    const image = new File(['image'], 'xray.jpg', { type: 'image/jpeg' });

    const result = await detectionApi.detectImage({
      packageId: 'PKG-1',
      timestamp: '2026-07-14T08:00:00.000Z',
      visionMode: 'simulation',
      gasMode: 'simulation',
      visionSimulationData: [],
      gasSimulationData: { gasType: 'combustible', concentration: 10 },
      image,
    });

    const options = fetchMock.mock.calls[0][1];
    expect(options.method).toBe('POST');
    expect(options.body).toBeInstanceOf(FormData);
    expect(options.body.get('packageId')).toBe('PKG-1');
    expect(JSON.parse(options.body.get('visionSimulationData'))).toEqual([]);
    expect(JSON.parse(options.body.get('gasSimulationData'))).toMatchObject({ concentration: 10 });
    expect(options.body.get('image')).toBeInstanceOf(File);
    expect(result.inspection._id).toBe('inspection-1');
  });
});
