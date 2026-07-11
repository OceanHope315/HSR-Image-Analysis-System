import { z } from 'zod';
import { dateSchema, idParamsSchema, objectIdSchema, paginationSchema } from './common.js';

export const listAlarmsSchema = {
  query: z.object({
    ...paginationSchema,
    status: z.enum(['unconfirmed', 'confirmed', 'processing', 'resolved', 'ignored']).optional(),
    level: z.enum(['medium', 'high']).optional(),
    startTime: dateSchema.optional(),
    endTime: dateSchema.optional(),
    assignedTo: objectIdSchema.optional(),
  }),
};

export const alarmIdSchema = { params: idParamsSchema };
export const updateAlarmStatusSchema = {
  params: idParamsSchema,
  body: z.object({
    status: z.enum(['confirmed', 'processing', 'resolved', 'ignored']),
    handlingNote: z.string().trim().max(2000).optional(),
  }).strict(),
};
export const assignAlarmSchema = {
  params: idParamsSchema,
  body: z.object({ assignedTo: objectIdSchema.nullable() }).strict(),
};
