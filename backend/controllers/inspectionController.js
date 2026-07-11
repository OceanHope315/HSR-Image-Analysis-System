import { AlarmRecord } from '../models/AlarmRecord.js';
import { InspectionRecord } from '../models/InspectionRecord.js';
import { OperationLog } from '../models/OperationLog.js';
import { findInspectionById, listInspectionRecords } from '../repositories/inspectionRepository.js';
import { createInspection, updateInspection } from '../services/inspectionService.js';
import { forbidden, notFound } from '../utils/AppError.js';
import { writeOperationLog } from '../utils/audit.js';
import { paginationMeta } from '../utils/query.js';
import { emitEvent } from '../utils/socket.js';

export async function listInspections(req, res) {
  const query = req.validated.query;
  if (query.includeDeleted && req.user.role !== 'admin') throw forbidden('只有管理员可以查看已删除记录');
  const { records, total } = await listInspectionRecords(query, req.user.role === 'admin');
  res.json({ success: true, data: records, pagination: paginationMeta(query.page, query.pageSize, total) });
}

export async function createInspectionRecord(req, res) {
  const result = await createInspection(req.validated.body, req.user._id);
  await writeOperationLog(req, {
    action: 'inspection.create',
    resourceType: 'InspectionRecord',
    resourceId: result.inspection._id,
    after: result.inspection.toObject(),
  });
  emitEvent('inspection:created', result.inspection.toJSON());
  if (result.alarm?.level === 'high') emitEvent('alarm:high', result.alarm.toJSON());
  res.status(201).json({
    success: true,
    data: {
      inspection: result.inspection,
      alarm: result.alarm,
      transaction: { used: result.transactionUsed, mode: result.transactionUsed ? 'mongodb' : 'compensating-fallback' },
    },
  });
}

export async function getInspection(req, res) {
  const inspection = await findInspectionById(req.validated.params.id, { includeDeleted: req.user.role === 'admin' })
    .populate('deviceId', 'deviceCode deviceName deviceType location status lastHeartbeatAt')
    .populate('operatorId deletedBy', 'username email role');
  if (!inspection) throw notFound('检测记录不存在');
  const [alarm, operationLogs] = await Promise.all([
    AlarmRecord.findOne({ inspectionId: inspection._id }).populate('assignedTo confirmedBy handledBy', 'username email role'),
    OperationLog.find({ resourceType: 'InspectionRecord', resourceId: inspection._id })
      .sort({ createdAt: -1 })
      .limit(100)
      .populate('userId', 'username email role'),
  ]);
  res.json({ success: true, data: { inspection, alarm, operationLogs } });
}

export async function patchInspection(req, res) {
  const before = await InspectionRecord.findOne({ _id: req.validated.params.id, isDeleted: false }).lean();
  if (!before) throw notFound('检测记录不存在');
  const result = await updateInspection(req.validated.params.id, req.validated.body);
  await writeOperationLog(req, {
    action: 'inspection.update',
    resourceType: 'InspectionRecord',
    resourceId: result.inspection._id,
    before,
    after: result.inspection.toObject(),
  });
  if (result.alarm) emitEvent('alarm:updated', result.alarm.toJSON());
  res.json({ success: true, data: result });
}

export async function deleteInspection(req, res) {
  const inspection = await InspectionRecord.findOne({ _id: req.validated.params.id, isDeleted: false });
  if (!inspection) throw notFound('检测记录不存在');
  const before = inspection.toObject();
  inspection.isDeleted = true;
  inspection.deletedAt = new Date();
  inspection.deletedBy = req.user._id;
  await inspection.save();
  await writeOperationLog(req, {
    action: 'inspection.soft-delete',
    resourceType: 'InspectionRecord',
    resourceId: inspection._id,
    before,
    after: inspection.toObject(),
  });
  res.json({ success: true, data: inspection });
}

export async function restoreInspection(req, res) {
  const inspection = await InspectionRecord.findOne({ _id: req.validated.params.id, isDeleted: true });
  if (!inspection) throw notFound('已删除的检测记录不存在');
  const before = inspection.toObject();
  inspection.isDeleted = false;
  inspection.deletedAt = null;
  inspection.deletedBy = null;
  await inspection.save();
  await writeOperationLog(req, {
    action: 'inspection.restore',
    resourceType: 'InspectionRecord',
    resourceId: inspection._id,
    before,
    after: inspection.toObject(),
  });
  res.json({ success: true, data: inspection });
}
