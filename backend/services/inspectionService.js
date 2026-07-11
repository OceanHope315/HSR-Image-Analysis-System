import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { supportsTransactions } from '../config/db.js';
import { AlarmRecord } from '../models/AlarmRecord.js';
import { Device } from '../models/Device.js';
import { InspectionRecord } from '../models/InspectionRecord.js';
import { calculateRisk } from './riskService.js';
import { AppError, notFound } from '../utils/AppError.js';

function alarmPayload(inspection) {
  return {
    inspectionId: inspection._id,
    level: inspection.riskLevel,
    title: `${inspection.riskLevel === 'high' ? '高' : '中'}风险包裹报警：${inspection.packageId}`,
    description: inspection.riskReasons.join('；') || '风险融合服务建议人工复核',
    reasons: inspection.riskReasons,
    status: 'unconfirmed',
  };
}

async function validateDevice(deviceId) {
  if (deviceId && !(await Device.exists({ _id: deviceId }))) throw notFound('关联设备不存在');
}

async function createWithoutTransaction(data) {
  let inspection;
  try {
    inspection = await InspectionRecord.create(data);
    const alarm = ['medium', 'high'].includes(inspection.riskLevel)
      ? await AlarmRecord.create(alarmPayload(inspection))
      : null;
    return { inspection, alarm, transactionUsed: false };
  } catch (error) {
    if (inspection?._id) {
      await InspectionRecord.deleteOne({ _id: inspection._id }).catch((compensationError) => {
        logger.fatal({ err: compensationError, inspectionId: inspection._id }, '单机补偿删除失败，需人工排查');
      });
    }
    throw error;
  }
}

export async function createInspection(input, operatorId = null) {
  await validateDevice(input.deviceId);
  const risk = calculateRisk(input);
  const data = { ...input, ...risk, operatorId };
  const transactionSupported = await supportsTransactions();
  if (!transactionSupported) {
    if (env.transactionMode === 'required') {
      throw new AppError(503, 'TRANSACTION_UNAVAILABLE', '当前 MongoDB 未启用副本集，无法执行必需事务');
    }
    logger.warn('MongoDB 当前不支持事务，使用带补偿删除的开发环境安全降级');
    return createWithoutTransaction(data);
  }

  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const [inspection] = await InspectionRecord.create([data], { session });
      let alarm = null;
      if (['medium', 'high'].includes(inspection.riskLevel)) {
        [alarm] = await AlarmRecord.create([alarmPayload(inspection)], { session });
      }
      result = { inspection, alarm, transactionUsed: true };
    });
    return result;
  } finally {
    await session.endSession();
  }
}

export async function updateInspection(id, changes) {
  const inspection = await InspectionRecord.findOne({ _id: id, isDeleted: false });
  if (!inspection) throw notFound('检测记录不存在');
  await validateDevice(changes.deviceId);
  const evidenceChanged = Object.hasOwn(changes, 'xrayResult') || Object.hasOwn(changes, 'gasSensor');
  Object.assign(inspection, changes);
  if (evidenceChanged) Object.assign(inspection, calculateRisk(inspection.toObject()));
  await inspection.save();

  let alarm = await AlarmRecord.findOne({ inspectionId: inspection._id });
  if (['medium', 'high'].includes(inspection.riskLevel)) {
    if (!alarm) alarm = await AlarmRecord.create(alarmPayload(inspection));
    else {
      alarm.level = inspection.riskLevel;
      alarm.title = alarmPayload(inspection).title;
      alarm.description = inspection.riskReasons.join('；');
      alarm.reasons = inspection.riskReasons;
      await alarm.save();
    }
  } else if (alarm && !['resolved', 'ignored'].includes(alarm.status)) {
    alarm.status = 'ignored';
    alarm.handlingNote = [alarm.handlingNote, '检测证据更新后风险降为低，系统标记为忽略，需人工确认'].filter(Boolean).join('\n');
    alarm.handledAt = new Date();
    await alarm.save();
  }
  return { inspection, alarm };
}
