import multer from 'multer';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { AppError } from '../utils/AppError.js';

export function notFoundMiddleware(req, _res, next) {
  next(new AppError(404, 'NOT_FOUND', `接口不存在：${req.method} ${req.originalUrl}`));
}

export function errorMiddleware(error, req, res, _next) {
  let normalized = error;
  if (error?.code === 11000) {
    const field = Object.keys(error.keyPattern ?? error.keyValue ?? {})[0] ?? '字段';
    normalized = new AppError(409, 'CONFLICT', `${field} 已存在`);
  } else if (error?.name === 'CastError') {
    normalized = new AppError(400, 'VALIDATION_ERROR', '资源 ID 或字段格式不合法');
  } else if (error?.name === 'ValidationError') {
    normalized = new AppError(
      400,
      'VALIDATION_ERROR',
      '数据校验失败',
      Object.values(error.errors).map((item) => ({ field: item.path, message: item.message })),
    );
  } else if (error instanceof multer.MulterError) {
    normalized = new AppError(400, 'UPLOAD_ERROR', error.code === 'LIMIT_FILE_SIZE' ? '图片超过大小限制' : '图片上传失败');
  }

  const statusCode = normalized.statusCode ?? 500;
  const operational = normalized.isOperational || statusCode < 500;
  logger[statusCode >= 500 ? 'error' : 'warn'](
    { err: error, method: req.method, path: req.originalUrl },
    normalized.message,
  );
  res.status(statusCode).json({
    success: false,
    error: {
      code: normalized.code ?? 'INTERNAL_ERROR',
      message: operational ? normalized.message : '服务器内部错误',
      details: normalized.details ?? [],
      ...(!env.isProduction && !operational ? { stack: error.stack } : {}),
    },
  });
}
