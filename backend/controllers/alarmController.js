import { AlarmRecord } from '../models/AlarmRecord.js';
import { listAlarmRecords } from '../repositories/alarmRepository.js';
import { assignAlarm, reopenAlarm, transitionAlarm } from '../services/alarmService.js';
import { notFound } from '../utils/AppError.js';
import { writeOperationLog } from '../utils/audit.js';
import { paginationMeta } from '../utils/query.js';
import { emitEvent } from '../utils/socket.js';

export async function listAlarms(req, res) {
  const query = req.validated.query;
  const { records, total } = await listAlarmRecords(query);
  res.json({ success: true, data: records, pagination: paginationMeta(query.page, query.pageSize, total) });
}

export async function getAlarm(req, res) {
  const alarm = await AlarmRecord.findById(req.validated.params.id)
    .populate('inspectionId')
    .populate('assignedTo confirmedBy handledBy', 'username email role');
  if (!alarm) throw notFound('报警记录不存在');
  res.json({ success: true, data: alarm });
}

export async function patchAlarmStatus(req, res) {
  const before = await AlarmRecord.findById(req.validated.params.id).lean();
  if (!before) throw notFound('报警记录不存在');
  const alarm = await transitionAlarm(req.validated.params.id, req.validated.body.status, req.user._id, req.validated.body.handlingNote);
  await writeOperationLog(req, {
    action: `alarm.status.${alarm.status}`,
    resourceType: 'AlarmRecord',
    resourceId: alarm._id,
    before,
    after: alarm.toObject(),
  });
  emitEvent('alarm:updated', alarm.toJSON());
  res.json({ success: true, data: alarm });
}

export async function patchAlarmAssignment(req, res) {
  const before = await AlarmRecord.findById(req.validated.params.id).lean();
  if (!before) throw notFound('报警记录不存在');
  const alarm = await assignAlarm(req.validated.params.id, req.validated.body.assignedTo);
  await writeOperationLog(req, {
    action: 'alarm.assign', resourceType: 'AlarmRecord', resourceId: alarm._id, before, after: alarm.toObject(),
  });
  emitEvent('alarm:updated', alarm.toJSON());
  res.json({ success: true, data: alarm });
}

export async function reopenAlarmRecord(req, res) {
  const before = await AlarmRecord.findById(req.validated.params.id).lean();
  if (!before) throw notFound('报警记录不存在');
  const alarm = await reopenAlarm(req.validated.params.id);
  await writeOperationLog(req, {
    action: 'alarm.reopen', resourceType: 'AlarmRecord', resourceId: alarm._id, before, after: alarm.toObject(),
  });
  emitEvent('alarm:updated', alarm.toJSON());
  res.json({ success: true, data: alarm });
}
