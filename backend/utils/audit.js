import { OperationLog } from '../models/OperationLog.js';
import { logger } from '../config/logger.js';

const sensitiveKey = /^(password|passwordHash|token|authorization|jwtSecret|cookie)$/i;

export function sanitizeAuditValue(value) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(sanitizeAuditValue);
  if (value instanceof Date || Buffer.isBuffer(value) || value?._bsontype === 'ObjectId') return value;
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !sensitiveKey.test(key))
        .map(([key, item]) => [key, sanitizeAuditValue(item)]),
    );
  }
  return value;
}

export async function writeOperationLog(req, data, options = {}) {
  try {
    return await OperationLog.create(
      [{
        userId: data.userId ?? req?.user?._id ?? null,
        action: data.action,
        resourceType: data.resourceType,
        resourceId: data.resourceId ?? null,
        before: sanitizeAuditValue(data.before),
        after: sanitizeAuditValue(data.after),
        ip: req?.ip,
        userAgent: req?.get?.('user-agent'),
      }],
      options.session ? { session: options.session } : undefined,
    );
  } catch (error) {
    logger.error({ err: error, action: data.action }, '写入操作日志失败');
    if (options.required) throw error;
    return null;
  }
}
