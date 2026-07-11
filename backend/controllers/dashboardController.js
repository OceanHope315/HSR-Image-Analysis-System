import { AlarmRecord } from '../models/AlarmRecord.js';
import { Device } from '../models/Device.js';
import { InspectionRecord } from '../models/InspectionRecord.js';
import { env } from '../config/env.js';

export async function dashboardSummary(_req, res) {
  const match = { isDeleted: false };
  const [inspectionStats, unhandledAlarms, latestInspections, latestAlarms, deviceCounts] = await Promise.all([
    InspectionRecord.aggregate([
      { $match: match },
      { $group: {
        _id: null,
        totalInspections: { $sum: 1 },
        todayInspections: { $sum: { $cond: [{ $gte: ['$timestamp', { $dateTrunc: { date: '$$NOW', unit: 'day', timezone: 'Asia/Shanghai' } }] }, 1, 0] } },
        high: { $sum: { $cond: [{ $eq: ['$riskLevel', 'high'] }, 1, 0] } },
        medium: { $sum: { $cond: [{ $eq: ['$riskLevel', 'medium'] }, 1, 0] } },
        low: { $sum: { $cond: [{ $eq: ['$riskLevel', 'low'] }, 1, 0] } },
        gasAlarmCount: { $sum: { $cond: [{ $eq: ['$gasSensor.alarm', true] }, 1, 0] } },
      } },
    ]),
    AlarmRecord.countDocuments({ status: { $in: ['unconfirmed', 'confirmed', 'processing'] } }),
    InspectionRecord.find(match).sort({ timestamp: -1 }).limit(10)
      .select('packageId timestamp riskLevel riskScore status xrayImageUrl gasSensor.alarm source').lean(),
    AlarmRecord.find().sort({ createdAt: -1 }).limit(10)
      .populate('inspectionId', 'packageId timestamp').populate('assignedTo', 'username').lean(),
    Device.aggregate([
      { $addFields: {
        effectiveStatus: {
          $cond: [
            { $and: [
              { $eq: ['$status', 'online'] },
              { $or: [
                { $eq: ['$lastHeartbeatAt', null] },
                { $lt: ['$lastHeartbeatAt', new Date(Date.now() - env.deviceOfflineAfterSeconds * 1000)] },
              ] },
            ] },
            'offline',
            '$status',
          ],
        },
      } },
      { $group: { _id: '$effectiveStatus', count: { $sum: 1 } } },
    ]),
  ]);
  const stats = inspectionStats[0] ?? { totalInspections: 0, todayInspections: 0, high: 0, medium: 0, low: 0, gasAlarmCount: 0 };
  const rawDevices = Object.fromEntries(deviceCounts.map(({ _id, count }) => [_id, count]));
  res.json({
    success: true,
    data: {
      totalInspections: stats.totalInspections,
      todayInspections: stats.todayInspections,
      riskCounts: { high: stats.high, medium: stats.medium, low: stats.low },
      highRiskCount: stats.high,
      unhandledAlarms,
      gasAlarmCount: stats.gasAlarmCount,
      onlineDevices: rawDevices.online ?? 0,
      offlineDevices: rawDevices.offline ?? 0,
      latestInspections,
      latestAlarms,
      simulationNotice: '当前数据可能包含模拟数据，仅用于系统开发和功能演示。',
    },
  });
}

export async function riskTrend(req, res) {
  const days = Math.min(30, Math.max(1, Number(req.query.days) || 7));
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - days + 1);
  const rows = await InspectionRecord.aggregate([
    { $match: { isDeleted: false, timestamp: { $gte: start } } },
    { $group: {
      _id: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp', timezone: 'Asia/Shanghai' } },
      low: { $sum: { $cond: [{ $eq: ['$riskLevel', 'low'] }, 1, 0] } },
      medium: { $sum: { $cond: [{ $eq: ['$riskLevel', 'medium'] }, 1, 0] } },
      high: { $sum: { $cond: [{ $eq: ['$riskLevel', 'high'] }, 1, 0] } },
      total: { $sum: 1 },
    } },
    { $sort: { _id: 1 } },
    { $project: { _id: 0, date: '$_id', low: 1, medium: 1, high: 1, total: 1 } },
  ]);
  res.json({ success: true, data: rows, meta: { days } });
}

export async function gasStatistics(_req, res) {
  const [gas, dangerousTargets] = await Promise.all([
    InspectionRecord.aggregate([
      { $match: { isDeleted: false, gasSensor: { $ne: null } } },
      { $group: {
        _id: '$gasSensor.gasType',
        total: { $sum: 1 },
        alarms: { $sum: { $cond: ['$gasSensor.alarm', 1, 0] } },
        averageConcentration: { $avg: '$gasSensor.concentration' },
        maximumConcentration: { $max: '$gasSensor.concentration' },
      } },
      { $sort: { alarms: -1 } },
      { $project: { _id: 0, gasType: '$_id', total: 1, alarms: 1, averageConcentration: { $round: ['$averageConcentration', 2] }, maximumConcentration: 1 } },
    ]),
    InspectionRecord.aggregate([
      { $match: { isDeleted: false } },
      { $unwind: '$xrayResult' },
      { $group: { _id: '$xrayResult.className', count: { $sum: 1 }, averageConfidence: { $avg: '$xrayResult.confidence' } } },
      { $sort: { count: -1 } },
      { $limit: 20 },
      { $project: { _id: 0, className: '$_id', count: 1, averageConfidence: { $round: ['$averageConfidence', 3] } } },
    ]),
  ]);
  res.json({ success: true, data: { gas, dangerousTargets } });
}

export async function deviceStatus(_req, res) {
  const staleBefore = new Date(Date.now() - env.deviceOfflineAfterSeconds * 1000);
  const devices = await Device.aggregate([
    { $addFields: {
      effectiveStatus: {
        $cond: [
          { $and: [{ $eq: ['$status', 'online'] }, { $or: [{ $eq: ['$lastHeartbeatAt', null] }, { $lt: ['$lastHeartbeatAt', staleBefore] }] }] },
          'offline',
          '$status',
        ],
      },
    } },
    { $sort: { deviceCode: 1 } },
  ]);
  const counts = { online: 0, offline: 0, warning: 0, maintenance: 0 };
  for (const device of devices) counts[device.effectiveStatus] = (counts[device.effectiveStatus] ?? 0) + 1;
  res.json({ success: true, data: { counts, devices, offlineAfterSeconds: env.deviceOfflineAfterSeconds } });
}
