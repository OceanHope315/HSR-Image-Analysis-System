import { AlarmRecord } from '../models/AlarmRecord.js';
import { Device } from '../models/Device.js';
import { InspectionRecord } from '../models/InspectionRecord.js';
import { User } from '../models/User.js';
import { hashPassword } from '../services/authService.js';
import { calculateRisk } from '../services/riskService.js';
import { generateSimulationRecord } from '../services/simulationService.js';
import { requireValue, runScript } from './scriptUtils.js';

const SEED_PREFIX = 'SEED-DEMO-';

await runScript('seed', async () => {
  const password = requireValue('SEED_DEFAULT_PASSWORD', process.env.SEED_DEFAULT_PASSWORD);
  if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw new Error('SEED_DEFAULT_PASSWORD 至少 8 位，并同时包含字母和数字');
  }
  const passwordHash = await hashPassword(password);
  const userSpecs = [
    { username: 'admin', email: process.env.SEED_ADMIN_EMAIL ?? 'admin@163.com', role: 'admin' },
    { username: '安检员演示', email: process.env.SEED_INSPECTOR_EMAIL ?? 'inspector@example.local', role: 'inspector' },
    { username: '只读演示', email: process.env.SEED_VIEWER_EMAIL ?? 'viewer@example.local', role: 'viewer' },
  ];
  const users = [];
  for (const spec of userSpecs) {
    const user = await User.findOneAndUpdate(
      { email: spec.email.toLowerCase() },
      { $setOnInsert: { ...spec, passwordHash, isActive: true } },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
    );
    users.push(user);
  }

  const deviceSpecs = [
    ['XRAY-A01', '一号通道 X 光机', 'xray', '铁路客运站一号安检通道', 'online'],
    ['GAS-A01', '一号通道气体传感器', 'gas_sensor', '铁路客运站一号安检通道', 'online'],
    ['FUSION-B02', '二号通道融合终端', 'integrated', '铁路客运站二号安检通道', 'warning'],
    ['GATEWAY-01', '模拟数据网关', 'gateway', '设备机房', 'offline'],
  ];
  const devices = [];
  for (const [deviceCode, deviceName, deviceType, location, status] of deviceSpecs) {
    devices.push(await Device.findOneAndUpdate(
      { deviceCode },
      { $setOnInsert: { deviceCode, deviceName, deviceType, location, status, lastHeartbeatAt: status === 'online' ? new Date() : null } },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
    ));
  }

  const existingCount = await InspectionRecord.countDocuments({ packageId: { $regex: `^${SEED_PREFIX}` } });
  const target = 60;
  if (existingCount < target) {
    const documents = [];
    for (let index = existingCount; index < target; index += 1) {
      const desiredRisk = index % 10 === 0 ? 'high' : index % 4 === 0 ? 'medium' : 'low';
      const base = generateSimulationRecord({
        packageId: `${SEED_PREFIX}${String(index + 1).padStart(4, '0')}`,
        timestamp: new Date(Date.now() - index * 3 * 60 * 60 * 1000),
        deviceId: devices[index % devices.length]._id,
        risk: desiredRisk,
      });
      documents.push({ ...base, ...calculateRisk(base), operatorId: users[1]._id });
    }
    const inserted = await InspectionRecord.insertMany(documents, { ordered: true });
    const alarms = inserted.filter((item) => item.riskLevel !== 'low').map((inspection, index) => {
      const statuses = ['unconfirmed', 'confirmed', 'processing', 'resolved', 'ignored'];
      const status = statuses[index % statuses.length];
      return {
        inspectionId: inspection._id,
        level: inspection.riskLevel,
        title: `${inspection.riskLevel === 'high' ? '高' : '中'}风险包裹报警：${inspection.packageId}`,
        description: inspection.riskReasons.join('；'),
        reasons: inspection.riskReasons,
        status,
        assignedTo: status === 'unconfirmed' ? null : users[1]._id,
        confirmedBy: ['confirmed', 'processing', 'resolved'].includes(status) ? users[1]._id : null,
        confirmedAt: ['confirmed', 'processing', 'resolved'].includes(status) ? new Date() : null,
        handledBy: ['resolved', 'ignored'].includes(status) ? users[1]._id : null,
        handledAt: ['resolved', 'ignored'].includes(status) ? new Date() : null,
        handlingNote: ['resolved', 'ignored'].includes(status) ? '模拟处置记录，仅用于功能演示' : '',
      };
    });
    if (alarms.length) await AlarmRecord.insertMany(alarms);
  }

  process.stdout.write(`演示账号已就绪；模拟检测记录：${Math.max(existingCount, target)} 条。密码来自 SEED_DEFAULT_PASSWORD，未写入代码。\n`);
});
