import { AlarmRecord } from '../models/AlarmRecord.js';
import { User } from '../models/User.js';
import { conflict, notFound } from '../utils/AppError.js';

export const allowedAlarmTransitions = Object.freeze({
  unconfirmed: ['confirmed', 'ignored'],
  confirmed: ['processing', 'ignored'],
  processing: ['resolved', 'ignored'],
  resolved: [],
  ignored: [],
});

export function canTransitionAlarm(from, to) {
  return allowedAlarmTransitions[from]?.includes(to) ?? false;
}

export async function transitionAlarm(id, targetStatus, userId, handlingNote) {
  const alarm = await AlarmRecord.findById(id);
  if (!alarm) throw notFound('报警记录不存在');
  if (!canTransitionAlarm(alarm.status, targetStatus)) {
    throw conflict(`报警状态不能从 ${alarm.status} 转换为 ${targetStatus}`);
  }
  alarm.status = targetStatus;
  if (handlingNote !== undefined) alarm.handlingNote = handlingNote;
  if (targetStatus === 'confirmed') {
    alarm.confirmedBy = userId;
    alarm.confirmedAt = new Date();
  }
  if (['resolved', 'ignored'].includes(targetStatus)) {
    alarm.handledBy = userId;
    alarm.handledAt = new Date();
  }
  await alarm.save();
  return alarm;
}

export async function assignAlarm(id, assignedTo) {
  const alarm = await AlarmRecord.findById(id);
  if (!alarm) throw notFound('报警记录不存在');
  if (assignedTo) {
    const assignee = await User.findOne({ _id: assignedTo, isActive: true });
    if (!assignee || !['admin', 'inspector'].includes(assignee.role)) throw notFound('可指派的处理人员不存在');
  }
  alarm.assignedTo = assignedTo;
  await alarm.save();
  return alarm;
}

export async function reopenAlarm(id) {
  const alarm = await AlarmRecord.findById(id);
  if (!alarm) throw notFound('报警记录不存在');
  if (!['resolved', 'ignored'].includes(alarm.status)) throw conflict('只有已解决或已忽略的报警可重新打开');
  alarm.status = 'confirmed';
  alarm.handledBy = null;
  alarm.handledAt = null;
  alarm.handlingNote = [alarm.handlingNote, '管理员重新打开报警'].filter(Boolean).join('\n');
  await alarm.save();
  return alarm;
}
