import { AlarmRecord } from '../models/AlarmRecord.js';

export function buildAlarmFilter(query) {
  const filter = {};
  if (query.status) filter.status = query.status;
  if (query.level) filter.level = query.level;
  if (query.assignedTo) filter.assignedTo = query.assignedTo;
  if (query.startTime || query.endTime) {
    filter.createdAt = {};
    if (query.startTime) filter.createdAt.$gte = query.startTime;
    if (query.endTime) filter.createdAt.$lte = query.endTime;
  }
  return filter;
}

export async function listAlarmRecords(query) {
  const filter = buildAlarmFilter(query);
  const [records, total] = await Promise.all([
    AlarmRecord.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((query.page - 1) * query.pageSize)
      .limit(query.pageSize)
      .populate('inspectionId', 'packageId timestamp riskLevel riskScore xrayImageUrl status isDeleted')
      .populate('assignedTo confirmedBy handledBy', 'username email role')
      .lean(),
    AlarmRecord.countDocuments(filter),
  ]);
  return { records, total };
}
