import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';
import { env } from '../config/env.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { forbidden, unauthorized } from '../utils/AppError.js';

export const authenticate = asyncHandler(async (req, _res, next) => {
  const authorization = req.get('authorization') ?? '';
  const [scheme, token] = authorization.split(' ');
  if (scheme !== 'Bearer' || !token) throw unauthorized('登录凭证缺失或格式错误');
  if (!env.jwtSecret) throw unauthorized('服务端认证尚未配置');

  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] });
  } catch {
    throw unauthorized('登录凭证无效或已过期');
  }
  const user = await User.findById(payload.sub);
  if (!user || !user.isActive) throw unauthorized('用户不存在或已停用');
  req.user = user;
  next();
});

export function authorize(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) return next(forbidden());
    return next();
  };
}
