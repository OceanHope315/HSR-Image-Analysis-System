import { z } from 'zod';
import { dateSchema, objectIdSchema, paginationSchema } from './common.js';

export const listLogsSchema = {
  query: z.object({
    ...paginationSchema,
    userId: objectIdSchema.optional(),
    resourceType: z.string().trim().max(100).optional(),
    action: z.string().trim().max(100).optional(),
    resourceId: objectIdSchema.optional(),
    startTime: dateSchema.optional(),
    endTime: dateSchema.optional(),
  }),
};
