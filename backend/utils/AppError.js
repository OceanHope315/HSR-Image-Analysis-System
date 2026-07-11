export class AppError extends Error {
  constructor(statusCode, code, message, details = []) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
  }
}

export const badRequest = (message, details) => new AppError(400, 'VALIDATION_ERROR', message, details);
export const unauthorized = (message = '请先登录') => new AppError(401, 'UNAUTHORIZED', message);
export const forbidden = (message = '没有执行此操作的权限') => new AppError(403, 'FORBIDDEN', message);
export const notFound = (message = '资源不存在') => new AppError(404, 'NOT_FOUND', message);
export const conflict = (message = '资源已存在') => new AppError(409, 'CONFLICT', message);
