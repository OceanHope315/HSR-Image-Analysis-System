import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { unauthorized } from '../utils/AppError.js';

export async function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

export async function authenticateCredentials({ email, username, password }) {
  const identity = email
    ? { email: email.toLowerCase() }
    : { username: { $regex: `^${String(username).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } };
  const user = await User.findOne(identity).select('+passwordHash');
  if (!user || !user.isActive || !(await bcrypt.compare(password, user.passwordHash))) {
    throw unauthorized('邮箱、用户名或密码错误');
  }
  user.lastLoginAt = new Date();
  await user.save();
  const safeUser = await User.findById(user._id);
  if (!env.jwtSecret) throw new Error('JWT_SECRET 未配置');
  const token = jwt.sign(
    { role: user.role },
    env.jwtSecret,
    { subject: String(user._id), expiresIn: env.jwtExpiresIn, algorithm: 'HS256' },
  );
  return { token, user: safeUser };
}
