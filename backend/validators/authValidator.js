import { z } from 'zod';

export const loginSchema = {
  body: z.object({
    email: z.string().trim().email('邮箱格式不正确').optional(),
    username: z.string().trim().min(2).max(254).optional(),
    password: z.string().min(6, '密码至少 6 位').max(128),
  }).refine((data) => data.email || data.username, { message: 'email 或 username 至少提供一个' }),
};
