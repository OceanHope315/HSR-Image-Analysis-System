import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import app from '../../app.js';
import { connectDatabase, disconnectDatabase } from '../../config/db.js';
import { env } from '../../config/env.js';
import { AlarmRecord } from '../../models/AlarmRecord.js';
import { Device } from '../../models/Device.js';
import { InspectionRecord } from '../../models/InspectionRecord.js';
import { OperationLog } from '../../models/OperationLog.js';
import { User } from '../../models/User.js';
import { hashPassword } from '../../services/authService.js';

let mongo;
let users;
let device;
const uploadedFiles = [];
const testPassword = `Aa9-${crypto.randomBytes(18).toString('base64url')}`;

function assertTestDatabase() {
  if (!mongoose.connection.name.endsWith('_test')) {
    throw new Error(`拒绝清理非测试数据库：${mongoose.connection.name}`);
  }
}

async function clearTestDatabase() {
  assertTestDatabase();
  await Promise.all([AlarmRecord, InspectionRecord, OperationLog, Device, User].map((model) => model.deleteMany({})));
}

async function login(role) {
  const response = await request(app).post('/api/v1/auth/login').send({ email: users[role].email, password: testPassword });
  expect(response.status).toBe(200);
  return response.body.data.token;
}

function auth(token) {
  return { Authorization: `Bearer ${token}` };
}

const safeDetection = {
  className: 'book', confidence: 0.9, bbox: { x: 1, y: 2, width: 20, height: 30 }, modelName: 'mock-yolo', modelVersion: 'test',
};
const highEvidence = {
  xrayResult: [{ ...safeDetection, className: 'knife', confidence: 0.96 }],
  gasSensor: {
    gasType: 'combustible', concentration: 250, unit: 'ppm', alarm: true, trend: 'rising', sensorStatus: 'online', collectedAt: new Date().toISOString(),
    connectionStatus: 'online', source: 'device', alarmLevel: 2,
    channels: [{ channel: 1, connected: true, alarmLevel: 2, alarmText: '二级报警' }],
  },
};

async function createRecord(token, packageId, evidence = { xrayResult: [safeDetection] }) {
  return request(app).post('/api/v1/inspections').set(auth(token)).send({
    packageId,
    timestamp: new Date().toISOString(),
    deviceId: String(device._id),
    ...evidence,
  });
}

beforeAll(async () => {
  const configuredTestUri = process.env.TEST_MONGO_URI;
  if (configuredTestUri) {
    const withoutQuery = configuredTestUri.split('?')[0].replace(/\/$/, '');
    const databaseName = withoutQuery.slice(withoutQuery.lastIndexOf('/') + 1);
    if (!databaseName.endsWith('_test')) throw new Error(`TEST_MONGO_URI 数据库名必须以 _test 结尾，当前为：${databaseName}`);
    await connectDatabase(configuredTestUri);
  } else {
    mongo = await MongoMemoryServer.create({ instance: { dbName: 'railway_security_test' } });
    await connectDatabase(mongo.getUri('railway_security_test'));
  }
  assertTestDatabase();
  await Promise.all([User, Device, InspectionRecord, AlarmRecord, OperationLog].map((model) => model.createIndexes()));
});

beforeEach(async () => {
  await clearTestDatabase();
  const passwordHash = await hashPassword(testPassword);
  const created = await User.create([
    { username: 'admin', email: 'admin@test.local', passwordHash, role: 'admin' },
    { username: 'inspector', email: 'inspector@test.local', passwordHash, role: 'inspector' },
    { username: 'viewer', email: 'viewer@test.local', passwordHash, role: 'viewer' },
  ]);
  users = Object.fromEntries(created.map((user) => [user.role, user]));
  device = await Device.create({ deviceCode: 'TEST-01', deviceName: '测试设备', deviceType: 'integrated', location: '测试通道' });
});

afterEach(async () => {
  while (uploadedFiles.length) await fs.unlink(uploadedFiles.pop()).catch(() => undefined);
});

afterAll(async () => {
  if (mongoose.connection.readyState === 1) {
    await clearTestDatabase();
    await disconnectDatabase();
  }
  if (mongo) await mongo.stop();
});

describe('身份认证与角色权限', () => {
  it('登录成功、密码不返回，错误密码返回 401', async () => {
    const success = await request(app).post('/api/v1/auth/login').send({ email: users.admin.email, password: testPassword });
    expect(success.status).toBe(200);
    expect(success.body.data.token).toBeTypeOf('string');
    expect(success.body.data.user.passwordHash).toBeUndefined();
    const failed = await request(app).post('/api/v1/auth/login').send({ email: users.admin.email, password: 'wrong-password' });
    expect(failed.status).toBe(401);
  });

  it('未登录访问受保护接口返回 401，viewer 写入返回 403', async () => {
    expect((await request(app).get('/api/v1/inspections')).status).toBe(401);
    const viewerToken = await login('viewer');
    expect((await createRecord(viewerToken, 'VIEWER-DENIED')).status).toBe(403);
  });
});

describe('检测 CRUD、分页筛选、逻辑删除与报警', () => {
  it('服务端计算 high 风险并同时生成报警', async () => {
    const token = await login('inspector');
    const response = await createRecord(token, 'PKG-HIGH-001', highEvidence);
    expect(response.status).toBe(201);
    expect(response.body.data.inspection.riskLevel).toBe('high');
    expect(response.body.data.inspection.riskScore).toBeGreaterThanOrEqual(70);
    expect(response.body.data.alarm.level).toBe('high');
    expect(await AlarmRecord.countDocuments({ inspectionId: response.body.data.inspection._id })).toBe(1);
  });

  it('支持列表分页、风险和包裹筛选、详情及更新', async () => {
    const token = await login('inspector');
    await createRecord(token, 'FILTER-LOW-1');
    await createRecord(token, 'FILTER-HIGH-1', highEvidence);
    const list = await request(app).get('/api/v1/inspections?page=1&pageSize=1&riskLevel=high&packageId=FILTER').set(auth(token));
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.pagination).toMatchObject({ page: 1, pageSize: 1, total: 1, totalPages: 1 });
    const id = list.body.data[0]._id;
    const detail = await request(app).get(`/api/v1/inspections/${id}`).set(auth(token));
    expect(detail.body.data.inspection.packageId).toBe('FILTER-HIGH-1');
    expect(detail.body.data.alarm).toBeTruthy();
    const updated = await request(app).patch(`/api/v1/inspections/${id}`).set(auth(token)).send({ status: 'reviewed' });
    expect(updated.status).toBe(200);
    expect(updated.body.data.inspection.status).toBe('reviewed');
  });

  it('管理员逻辑删除、查看删除数据并恢复，普通用户不能 includeDeleted', async () => {
    const inspectorToken = await login('inspector');
    const adminToken = await login('admin');
    const created = await createRecord(inspectorToken, 'SOFT-DELETE-1');
    const id = created.body.data.inspection._id;
    expect((await request(app).delete(`/api/v1/inspections/${id}`).set(auth(adminToken))).status).toBe(200);
    expect((await request(app).get(`/api/v1/inspections/${id}`).set(auth(inspectorToken))).status).toBe(404);
    expect((await request(app).get('/api/v1/inspections?includeDeleted=true').set(auth(inspectorToken))).status).toBe(403);
    const deletedList = await request(app).get('/api/v1/inspections?includeDeleted=true').set(auth(adminToken));
    expect(deletedList.body.data.some((item) => item._id === id && item.isDeleted)).toBe(true);
    expect((await request(app).patch(`/api/v1/inspections/${id}/restore`).set(auth(adminToken))).status).toBe(200);
    expect((await request(app).get(`/api/v1/inspections/${id}`).set(auth(inspectorToken))).status).toBe(200);
  });

  it('拒绝重复 packageId、无效 ObjectId，并正确返回 API 404', async () => {
    const token = await login('inspector');
    expect((await createRecord(token, 'DUPLICATE-1')).status).toBe(201);
    expect((await createRecord(token, 'DUPLICATE-1')).status).toBe(409);
    expect((await request(app).get('/api/v1/inspections/not-an-id').set(auth(token))).status).toBe(400);
    expect((await request(app).get(`/api/v1/inspections/${new mongoose.Types.ObjectId()}`).set(auth(token))).status).toBe(404);
    expect((await request(app).get('/api/v1/not-exist')).status).toBe(404);
  });
});

describe('报警、设备、统计和管理接口', () => {
  it('报警按状态机处置、指派，viewer 无权处置', async () => {
    const inspectorToken = await login('inspector');
    const viewerToken = await login('viewer');
    const created = await createRecord(inspectorToken, 'ALARM-FLOW-1', highEvidence);
    const id = created.body.data.alarm._id;
    expect((await request(app).patch(`/api/v1/alarms/${id}/status`).set(auth(viewerToken)).send({ status: 'confirmed' })).status).toBe(403);
    expect((await request(app).patch(`/api/v1/alarms/${id}/assign`).set(auth(inspectorToken)).send({ assignedTo: String(users.inspector._id) })).status).toBe(200);
    for (const status of ['confirmed', 'processing', 'resolved']) {
      const response = await request(app).patch(`/api/v1/alarms/${id}/status`).set(auth(inspectorToken)).send({ status, handlingNote: `进入${status}` });
      expect(response.status).toBe(200);
    }
    const illegal = await request(app).patch(`/api/v1/alarms/${id}/status`).set(auth(inspectorToken)).send({ status: 'confirmed' });
    expect(illegal.status).toBe(409);
  });

  it('管理员管理设备，安检员发送心跳，viewer 只读', async () => {
    const adminToken = await login('admin');
    const inspectorToken = await login('inspector');
    const viewerToken = await login('viewer');
    const created = await request(app).post('/api/v1/devices').set(auth(adminToken)).send({
      deviceCode: 'NEW-01', deviceName: '新设备', deviceType: 'xray', location: '三号通道',
    });
    expect(created.status).toBe(201);
    expect((await request(app).patch(`/api/v1/devices/${created.body.data._id}`).set(auth(viewerToken)).send({ status: 'warning' })).status).toBe(403);
    const heartbeat = await request(app).post(`/api/v1/devices/${created.body.data._id}/heartbeat`).set(auth(inspectorToken));
    expect(heartbeat.status).toBe(200);
    expect(heartbeat.body.data.status).toBe('online');
  });

  it('Dashboard 使用数据库聚合返回统计', async () => {
    const token = await login('inspector');
    await createRecord(token, 'DASH-LOW');
    await createRecord(token, 'DASH-HIGH', highEvidence);
    const summary = await request(app).get('/api/v1/dashboard/summary').set(auth(token));
    expect(summary.status).toBe(200);
    expect(summary.body.data.totalInspections).toBe(2);
    expect(summary.body.data.riskCounts.high).toBe(1);
    expect(summary.body.data.unhandledAlarms).toBe(1);
    expect((await request(app).get('/api/v1/dashboard/risk-trend').set(auth(token))).status).toBe(200);
    expect((await request(app).get('/api/v1/dashboard/gas-statistics').set(auth(token))).status).toBe(200);
    expect((await request(app).get('/api/v1/dashboard/device-status').set(auth(token))).status).toBe(200);
  });

  it('用户响应和操作日志均不保存 passwordHash，日志仅管理员可看', async () => {
    const adminToken = await login('admin');
    const inspectorToken = await login('inspector');
    const response = await request(app).post('/api/v1/users').set(auth(adminToken)).send({
      username: 'new-viewer', email: 'new-viewer@test.local', password: 'Secure1234', role: 'viewer',
    });
    expect(response.status).toBe(201);
    expect(response.body.data.passwordHash).toBeUndefined();
    const log = await OperationLog.findOne({ action: 'user.create' }).lean();
    expect(log.after.passwordHash).toBeUndefined();
    expect((await request(app).get('/api/v1/logs').set(auth(inspectorToken))).status).toBe(403);
    expect((await request(app).get('/api/v1/logs').set(auth(adminToken))).status).toBe(200);
  });
});

describe('模拟接口与安全图片上传', () => {
  it('模拟接口生成并保存模拟来源记录', async () => {
    const token = await login('inspector');
    const response = await request(app).post('/api/v1/simulation/generate').set(auth(token)).send({ risk: 'high' });
    expect(response.status).toBe(201);
    expect(response.body.data.inspection.source).toBe('simulation');
  });

  it('拒绝伪装为 JPG 的可执行内容，接受具有 PNG magic bytes 的图片', async () => {
    const token = await login('inspector');
    const fake = await request(app).post('/api/v1/uploads/xray').set(auth(token)).attach('image', Buffer.from('MZ executable payload'), 'evil.jpg');
    expect(fake.status).toBe(400);
    expect(fake.body.error.code).toBe('UPLOAD_CONTENT_INVALID');

    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    const valid = await request(app).post('/api/v1/uploads/xray').set(auth(token)).attach('image', pngHeader, 'xray.png');
    expect(valid.status).toBe(201);
    uploadedFiles.push(path.join(env.uploadDir, valid.body.data.filename));
    await expect(fs.stat(uploadedFiles[0])).resolves.toBeTruthy();
  });

  it('全模拟智能检测沿用统一风险、保存与图片链路', async () => {
    const token = await login('inspector');
    const bmpHeader = Buffer.from([0x42, 0x4d, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const response = await request(app)
      .post('/api/v1/detections/image')
      .set(auth(token))
      .field('packageId', 'SMART-SIM-001')
      .field('timestamp', new Date().toISOString())
      .field('visionMode', 'simulation')
      .field('gasMode', 'simulation')
      .field('visionSimulationData', JSON.stringify([{ ...safeDetection, className: 'lighter' }]))
      .field('gasSimulationData', JSON.stringify({
        gasType: 'combustible', concentration: 20, unit: 'ppm', alarm: false,
        trend: 'stable', sensorStatus: 'online',
      }))
      .attach('image', bmpHeader, { filename: 'xray.bmp', contentType: 'image/bmp' });
    expect(response.status).toBe(201);
    expect(response.body.data.inspection).toMatchObject({
      packageId: 'SMART-SIM-001',
      source: 'simulation',
      sourceMode: { vision: 'simulation', gas: 'simulation' },
      serviceStatus: { yolo: 'simulation', gas: 'simulation' },
    });
    const imageUrl = response.body.data.inspection.xrayImageUrl;
    uploadedFiles.push(path.join(env.uploadDir, decodeURIComponent(imageUrl.split('/').at(-1))));
    await expect(fs.stat(uploadedFiles.at(-1))).resolves.toBeTruthy();
  });
});
