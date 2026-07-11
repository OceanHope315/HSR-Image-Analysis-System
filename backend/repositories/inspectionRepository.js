import { InspectionRecord } from '../models/InspectionRecord.js';
import { escapeRegex } from '../utils/query.js';

export function buildInspectionFilter(query, canIncludeDeleted = false) {
  const filter = {};
  if (!(canIncludeDeleted && query.includeDeleted)) filter.isDeleted = false;
  if (query.riskLevel) filter.riskLevel = query.riskLevel;
  if (query.status) filter.status = query.status;
  if (query.packageId) filter.packageId = { $regex: escapeRegex(query.packageId), $options: 'i' };
  if (typeof query.gasAlarm === 'boolean') filter['gasSensor.alarm'] = query.gasAlarm;
  if (query.startTime || query.endTime) {
    filter.timestamp = {};
    if (query.startTime) filter.timestamp.$gte = query.startTime;
    if (query.endTime) filter.timestamp.$lte = query.endTime;
  }
  return filter;
}

export async function listInspectionRecords(query, canIncludeDeleted = false) {
  const filter = buildInspectionFilter(query, canIncludeDeleted);
  const sort = { [query.sortBy]: query.sortOrder === 'asc' ? 1 : -1, _id: -1 };
  const skip = (query.page - 1) * query.pageSize;
  const [records, total] = await Promise.all([
    InspectionRecord.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(query.pageSize)
      .populate('deviceId', 'deviceCode deviceName location status lastHeartbeatAt')
      .populate('operatorId', 'username email role')
      .lean(),
    InspectionRecord.countDocuments(filter),
  ]);
  return { records, total };
}

export function findInspectionById(id, { includeDeleted = false } = {}) {
  const filter = { _id: id };
  if (!includeDeleted) filter.isDeleted = false;
  return InspectionRecord.findOne(filter);
}
