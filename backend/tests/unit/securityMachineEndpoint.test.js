import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../../utils/AppError.js';

const { processInputMock } = vi.hoisted(() => ({ processInputMock: vi.fn() }));

vi.mock('../../services/securityMachineService.js', () => ({
  processSecurityMachineInput: processInputMock,
}));

const { default: app } = await import('../../app.js');

const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

function payload(overrides = {}) {
  return {
    devID: 'TEST_000001',
    imgID: '20260818_093015_123',
    imgType: 'PNG',
    img: {
      imgName0: '093015_123_0.png',
      img0: pngBase64,
      imgTime: '20260818_093015_123',
    },
    ...overrides,
  };
}

function successfulResult(input) {
  const views = input.views.map((view) => ({
    viewId: view.viewId,
    detections: [{
      className: view.viewId === 0 ? 'knife' : 'lighter',
      confidence: 0.91,
      bbox: { x: 10, y: 20, width: 30, height: 40 },
    }],
    inferenceTimeMs: 12,
  }));
  const inspection = { imageSource: 'security_machine', imageViews: views, toJSON() { return this; } };
  return { imageId: input.imageId, views, inspection, alarm: null, duplicate: false };
}

beforeEach(() => {
  processInputMock.mockReset();
  processInputMock.mockImplementation(async (input) => successfulResult(input));
});

describe('真实安检仪 HTTP 接口', () => {
  it('接收合法单视角 raw Base64 并返回开发协议格式', async () => {
    const response = await request(app).post('/imageAnalysis/imgInfo').send(payload());
    expect(response.status).toBe(200);
    expect(processInputMock).toHaveBeenCalledOnce();
    expect(processInputMock.mock.calls[0][0].views).toHaveLength(1);
    expect(response.body).toMatchObject({
      resCode: 200,
      imgID: '20260818_093015_123',
      resMsg0: [{ name: 'knife', x1: 10, y1: 20, x2: 40, y2: 60, confidence: 0.91 }],
      resMsg1: [],
      errorMsg: '',
    });
  });

  it('接收合法双视角和 data URI Base64', async () => {
    const body = payload();
    body.img.img0 = `data:image/png;base64,${pngBase64}`;
    body.img.imgName1 = '093015_123_1.png';
    body.img.img1 = pngBase64;
    const response = await request(app).post('/imageAnalysis/imgInfo').send(body);
    expect(response.status).toBe(200);
    expect(processInputMock.mock.calls[0][0].views.map((view) => view.viewId)).toEqual([0, 1]);
    expect(response.body.resMsg0).toHaveLength(1);
    expect(response.body.resMsg1).toHaveLength(1);
  });

  it.each([
    ['缺少 devID', payload({ devID: undefined })],
    ['缺少 imgID', payload({ imgID: undefined })],
    ['非法 Base64', payload({ img: { img0: '%%%', imgTime: '20260818_093015_123' } })],
  ])('%s 时返回设备错误结构且不调用 YOLO 流程', async (_label, body) => {
    const response = await request(app).post('/imageAnalysis/imgInfo').send(body);
    expect(response.status).toBe(500);
    expect(response.body).toMatchObject({ resCode: 500, resMsg0: [], resMsg1: [] });
    expect(response.body.errorMsg).toBeTruthy();
    expect(processInputMock).not.toHaveBeenCalled();
  });

  it('非法 JSON 不导致进程崩溃', async () => {
    const response = await request(app)
      .post('/imageAnalysis/imgInfo')
      .set('content-type', 'application/json')
      .send('{"devID":');
    expect(response.status).toBe(500);
    expect(response.body).toMatchObject({ resCode: 500, errorMsg: '请求体不是合法 JSON' });
  });

  it('YOLO 失败被转换为设备错误响应', async () => {
    processInputMock.mockRejectedValueOnce(new AppError(503, 'YOLO_SERVICE_OFFLINE', '无法连接 YOLO 服务'));
    const response = await request(app).post('/imageAnalysis/imgInfo').send(payload());
    expect(response.status).toBe(500);
    expect(response.body).toMatchObject({ resCode: 500, imgID: '20260818_093015_123', errorMsg: '无法连接 YOLO 服务' });
  });
});
