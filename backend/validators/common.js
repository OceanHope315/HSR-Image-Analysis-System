import { z } from 'zod';

export const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, '不是有效的 ObjectId');
export const dateSchema = z.coerce.date({ error: '必须是有效时间' });
export const paginationSchema = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
};

export const idParamsSchema = z.object({ id: objectIdSchema });
