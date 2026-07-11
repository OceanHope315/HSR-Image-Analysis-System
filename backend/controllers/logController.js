import { OperationLog } from '../models/OperationLog.js';
import { escapeRegex, paginationMeta } from '../utils/query.js';

export async function listLogs(req, res) {
  const query = req.validated.query;
  const filter = {};
  if (query.userId) filter.userId = query.userId;
  if (query.resourceId) filter.resourceId = query.resourceId;
  if (query.resourceType) filter.resourceType = query.resourceType;
  if (query.action) filter.action = { $regex: escapeRegex(query.action), $options: 'i' };
  if (query.startTime || query.endTime) {
    filter.createdAt = {};
    if (query.startTime) filter.createdAt.$gte = query.startTime;
    if (query.endTime) filter.createdAt.$lte = query.endTime;
  }
  const [logs, total] = await Promise.all([
    OperationLog.find(filter).sort({ createdAt: -1 }).skip((query.page - 1) * query.pageSize)
      .limit(query.pageSize).populate('userId', 'username email role').lean(),
    OperationLog.countDocuments(filter),
  ]);
  res.json({ success: true, data: logs, pagination: paginationMeta(query.page, query.pageSize, total) });
}
