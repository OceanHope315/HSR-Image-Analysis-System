import mongoose from 'mongoose';
import { AppError } from '../utils/AppError.js';

export function requireDatabase(_req, _res, next) {
  if (mongoose.connection.readyState === 1) return next();
  return next(new AppError(503, 'DATABASE_UNAVAILABLE', '数据库当前不可用，请启动 MongoDB 后重试'));
}
