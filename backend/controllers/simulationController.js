import { Device } from '../models/Device.js';
import { createInspection } from '../services/inspectionService.js';
import { generateSimulationBatch, generateSimulationRecord } from '../services/simulationService.js';
import { notFound } from '../utils/AppError.js';
import { writeOperationLog } from '../utils/audit.js';
import { emitEvent } from '../utils/socket.js';

function broadcast(result) {
  emitEvent('inspection:created', result.inspection.toJSON());
  if (result.alarm?.level === 'high') emitEvent('alarm:high', result.alarm.toJSON());
}

export async function generateSimulation(req, res) {
  const { risk, ...overrides } = req.validated.body;
  const generated = { ...generateSimulationRecord({ ...overrides, risk }), ...overrides, source: 'simulation' };
  const result = await createInspection(generated, req.user._id);
  await writeOperationLog(req, {
    action: 'simulation.generate', resourceType: 'InspectionRecord', resourceId: result.inspection._id, after: result.inspection.toObject(),
  });
  broadcast(result);
  res.status(201).json({ success: true, data: result });
}

export async function batchSimulation(req, res) {
  const generated = generateSimulationBatch(req.validated.body.count);
  const results = [];
  for (const item of generated) {
    const result = await createInspection(item, req.user._id);
    results.push(result);
    broadcast(result);
  }
  await writeOperationLog(req, {
    action: 'simulation.batch', resourceType: 'InspectionRecord', after: { count: results.length, ids: results.map((item) => item.inspection._id) },
  });
  res.status(201).json({ success: true, data: results, meta: { count: results.length } });
}

export async function simulationHeartbeat(req, res) {
  const device = req.validated.body.deviceId
    ? await Device.findById(req.validated.body.deviceId)
    : await Device.findOne().sort({ deviceCode: 1 });
  if (!device) throw notFound('没有可用于模拟心跳的设备');
  device.lastHeartbeatAt = new Date();
  if (device.status !== 'maintenance') device.status = 'online';
  await device.save();
  await writeOperationLog(req, {
    action: 'simulation.device-heartbeat', resourceType: 'Device', resourceId: device._id, after: device.toObject(),
  });
  emitEvent('device:updated', device.toJSON());
  res.json({ success: true, data: device });
}
