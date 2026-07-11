import { Device } from '../models/Device.js';
import { InspectionRecord } from '../models/InspectionRecord.js';
import { env } from '../config/env.js';
import { conflict, notFound } from '../utils/AppError.js';
import { writeOperationLog } from '../utils/audit.js';
import { escapeRegex, paginationMeta } from '../utils/query.js';
import { emitEvent } from '../utils/socket.js';

function withEffectiveStatus(device) {
  const value = device.toObject ? device.toObject() : device;
  const staleBefore = Date.now() - env.deviceOfflineAfterSeconds * 1000;
  const heartbeat = value.lastHeartbeatAt ? new Date(value.lastHeartbeatAt).getTime() : 0;
  const effectiveStatus = value.status === 'online' && heartbeat < staleBefore ? 'offline' : value.status;
  return { ...value, effectiveStatus, heartbeatStale: value.status === 'online' && effectiveStatus === 'offline' };
}

export async function listDevices(req, res) {
  const query = req.validated.query;
  const filter = {};
  if (query.status) filter.status = query.status;
  if (query.deviceType) filter.deviceType = query.deviceType;
  if (query.keyword) {
    const expression = { $regex: escapeRegex(query.keyword), $options: 'i' };
    filter.$or = [{ deviceCode: expression }, { deviceName: expression }, { location: expression }];
  }
  const [items, total] = await Promise.all([
    Device.find(filter).sort({ deviceCode: 1 }).skip((query.page - 1) * query.pageSize).limit(query.pageSize).lean(),
    Device.countDocuments(filter),
  ]);
  res.json({ success: true, data: items.map(withEffectiveStatus), pagination: paginationMeta(query.page, query.pageSize, total) });
}

export async function createDevice(req, res) {
  const device = await Device.create(req.validated.body);
  await writeOperationLog(req, {
    action: 'device.create', resourceType: 'Device', resourceId: device._id, after: device.toObject(),
  });
  emitEvent('device:updated', withEffectiveStatus(device));
  res.status(201).json({ success: true, data: withEffectiveStatus(device) });
}

export async function getDevice(req, res) {
  const device = await Device.findById(req.validated.params.id);
  if (!device) throw notFound('设备不存在');
  res.json({ success: true, data: withEffectiveStatus(device) });
}

export async function patchDevice(req, res) {
  const device = await Device.findById(req.validated.params.id);
  if (!device) throw notFound('设备不存在');
  const before = device.toObject();
  Object.assign(device, req.validated.body);
  await device.save();
  await writeOperationLog(req, {
    action: 'device.update', resourceType: 'Device', resourceId: device._id, before, after: device.toObject(),
  });
  emitEvent('device:updated', withEffectiveStatus(device));
  res.json({ success: true, data: withEffectiveStatus(device) });
}

export async function deleteDevice(req, res) {
  const device = await Device.findById(req.validated.params.id);
  if (!device) throw notFound('设备不存在');
  if (await InspectionRecord.exists({ deviceId: device._id })) throw conflict('设备已有检测记录引用，不能删除；可改为 maintenance 状态');
  await Device.deleteOne({ _id: device._id });
  await writeOperationLog(req, {
    action: 'device.delete', resourceType: 'Device', resourceId: device._id, before: device.toObject(), after: null,
  });
  emitEvent('device:updated', { _id: device._id, deleted: true });
  res.json({ success: true, data: { id: device._id, deleted: true } });
}

export async function heartbeatDevice(req, res) {
  const device = await Device.findById(req.validated.params.id);
  if (!device) throw notFound('设备不存在');
  const before = device.toObject();
  device.lastHeartbeatAt = new Date();
  if (device.status !== 'maintenance') device.status = 'online';
  await device.save();
  await writeOperationLog(req, {
    action: 'device.heartbeat', resourceType: 'Device', resourceId: device._id, before, after: device.toObject(),
  });
  emitEvent('device:updated', withEffectiveStatus(device));
  res.json({ success: true, data: withEffectiveStatus(device) });
}
