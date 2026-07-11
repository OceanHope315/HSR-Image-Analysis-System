import { User } from '../models/User.js';
import { hashPassword } from '../services/authService.js';
import { conflict } from '../utils/AppError.js';
import { requireValue, runScript } from './scriptUtils.js';

await runScript('create-admin', async () => {
  const username = requireValue('ADMIN_USERNAME', process.env.ADMIN_USERNAME);
  const email = requireValue('ADMIN_EMAIL', process.env.ADMIN_EMAIL).toLowerCase();
  const password = requireValue('ADMIN_PASSWORD', process.env.ADMIN_PASSWORD);
  if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw new Error('ADMIN_PASSWORD 至少 8 位，并同时包含字母和数字');
  }
  if (await User.exists({ email })) throw conflict('该管理员邮箱已存在；脚本不会覆盖已有账号或密码');
  const user = await User.create({ username, email, passwordHash: await hashPassword(password), role: 'admin', isActive: true });
  process.stdout.write(`管理员已创建：${user.email}\n`);
});
