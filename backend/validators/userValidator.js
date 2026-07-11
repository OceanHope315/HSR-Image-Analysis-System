import { z } from 'zod';
import { idParamsSchema, paginationSchema } from './common.js';

export const createUserSchema = {
  body: z.object({
    username: z.string().trim().min(2).max(40),
    email: z.string().trim().email().max(254),
    password: z.string().min(8).max(128).regex(/[A-Za-z]/, '密码需包含字母').regex(/\d/, '密码需包含数字'),
    role: z.enum(['admin', 'inspector', 'viewer']).default('viewer'),
    isActive: z.boolean().default(true),
  }).strict(),
};
export const updateUserSchema = {
  params: idParamsSchema,
  body: z.object({
    username: z.string().trim().min(2).max(40).optional(),
    email: z.string().trim().email().max(254).optional(),
    password: z.string().min(8).max(128).regex(/[A-Za-z]/).regex(/\d/).optional(),
    role: z.enum(['admin', 'inspector', 'viewer']).optional(),
    isActive: z.boolean().optional(),
  }).strict().refine((body) => Object.keys(body).length > 0, '至少提供一个字段'),
};
export const userIdSchema = { params: idParamsSchema };
export const listUsersSchema = {
  query: z.object({
    ...paginationSchema,
    role: z.enum(['admin', 'inspector', 'viewer']).optional(),
    isActive: z.enum(['true', 'false']).transform((value) => value === 'true').optional(),
    keyword: z.string().trim().max(100).optional(),
  }),
};
