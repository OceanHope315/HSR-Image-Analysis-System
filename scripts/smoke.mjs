import { io } from 'socket.io-client';

const apiBase = (process.env.SMOKE_API_BASE_URL || 'http://127.0.0.1:5000/api/v1').replace(/\/$/, '');
const socketUrl = process.env.SMOKE_SOCKET_URL || new URL(apiBase).origin;
const email = process.env.SMOKE_EMAIL;
const password = process.env.SMOKE_PASSWORD;

if (process.env.SMOKE_ALLOW_WRITES !== 'true') {
  throw new Error('冒烟测试会新增演示记录；请仅对测试/开发环境设置 SMOKE_ALLOW_WRITES=true');
}
if (!email || !password) throw new Error('缺少 SMOKE_EMAIL 或 SMOKE_PASSWORD');

let token = '';
async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set('Accept', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers,
    body: options.body && !(options.body instanceof FormData) ? JSON.stringify(options.body) : options.body,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.success === false) {
    throw new Error(`${options.method || 'GET'} ${path} 失败 (${response.status})：${payload?.error?.message || '未知错误'}`);
  }
  return payload;
}

const login = await api('/auth/login', { method: 'POST', body: { email, password } });
token = login.data.token;
const me = await api('/auth/me');
if (me.data.role !== 'admin') throw new Error('冒烟测试账号必须是 admin');

const socket = io(socketUrl, {
  auth: { token },
  transports: ['websocket', 'polling'],
  timeout: 8_000,
});

try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Socket.IO 连接超时')), 10_000);
    socket.once('connect', () => {
      clearTimeout(timer);
      resolve();
    });
    socket.once('connect_error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });

  const packageId = `SMOKE-${Date.now()}`;
  const highAlarmEvent = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('未收到 alarm:high 实时事件')), 10_000);
    const handler = (alarm) => {
      if (String(alarm?.title || '').includes(packageId)) {
        clearTimeout(timer);
        socket.off('alarm:high', handler);
        resolve(alarm);
      }
    };
    socket.on('alarm:high', handler);
  });

  const devices = await api('/devices?page=1&pageSize=10');
  const device = devices.data[0];
  if (device) await api(`/devices/${device._id}/heartbeat`, { method: 'POST' });

  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  );
  const form = new FormData();
  form.append('image', new Blob([png], { type: 'image/png' }), 'smoke-xray.png');
  const uploaded = await api('/uploads/xray', { method: 'POST', body: form });
  const assetResponse = await fetch(`${new URL(apiBase).origin}${uploaded.data.url}`);
  if (!assetResponse.ok) throw new Error(`上传图片静态访问失败 (${assetResponse.status})`);

  const created = await api('/inspections', {
    method: 'POST',
    body: {
      packageId,
      timestamp: new Date().toISOString(),
      xrayImageUrl: uploaded.data.url,
      xrayResult: [{
        className: 'knife_agnostic',
        confidence: 0.96,
        bbox: { x: 0.2, y: 0.2, width: 0.35, height: 0.4 },
        modelName: 'mock-yolo',
        modelVersion: 'smoke-v1',
      }],
      gasSensor: {
        gasType: 'combustible',
        concentration: 260,
        unit: 'ppm',
        alarm: true,
        trend: 'rising',
        sensorStatus: 'online',
        collectedAt: new Date().toISOString(),
      },
      deviceId: device?._id,
      source: 'simulation',
    },
  });
  const inspection = created.data.inspection;
  const alarm = created.data.alarm;
  if (inspection.riskLevel !== 'high' || !alarm?._id) throw new Error('高风险记录或关联报警未按预期生成');
  const realtimeAlarm = await highAlarmEvent;

  const listed = await api(`/inspections?page=1&pageSize=10&packageId=${encodeURIComponent(packageId)}`);
  if (listed.pagination.total !== 1) throw new Error('检测记录筛选结果不正确');
  const detail = await api(`/inspections/${inspection._id}`);
  if (detail.data.alarm?._id !== alarm._id) throw new Error('详情接口未返回关联报警');

  await api(`/alarms/${alarm._id}/status`, { method: 'PATCH', body: { status: 'confirmed' } });
  await api(`/alarms/${alarm._id}/status`, { method: 'PATCH', body: { status: 'processing' } });
  await api(`/alarms/${alarm._id}/status`, {
    method: 'PATCH',
    body: { status: 'resolved', handlingNote: '自动冒烟测试处置，仅用于开发验证' },
  });

  await api(`/inspections/${inspection._id}`, { method: 'DELETE' });
  const deleted = await api(`/inspections?page=1&pageSize=10&packageId=${encodeURIComponent(packageId)}&includeDeleted=true`);
  if (deleted.data[0]?.isDeleted !== true) throw new Error('逻辑删除记录未能由管理员查询');
  await api(`/inspections/${inspection._id}/restore`, { method: 'PATCH' });

  const summary = await api('/dashboard/summary');
  const [inspectionLogs, alarmLogs] = await Promise.all([
    api(`/logs?page=1&pageSize=20&resourceId=${inspection._id}`),
    api(`/logs?page=1&pageSize=20&resourceId=${alarm._id}`),
  ]);
  if (inspectionLogs.pagination.total < 3 || alarmLogs.pagination.total < 3) {
    throw new Error('检测或报警的关键操作日志数量不足');
  }

  process.stdout.write(`${JSON.stringify({
    success: true,
    packageId,
    riskLevel: inspection.riskLevel,
    alarmFinalStatus: 'resolved',
    socketEvent: realtimeAlarm.title,
    transactionMode: created.data.transaction.mode,
    staticImageStatus: assetResponse.status,
    dashboardTotal: summary.data.totalInspections,
    operationLogs: inspectionLogs.pagination.total + alarmLogs.pagination.total,
  }, null, 2)}\n`);
} finally {
  socket.close();
}
