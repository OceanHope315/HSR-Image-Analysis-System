import { z } from 'zod';
import { env } from '../config/env.js';
import { dateSchema } from './common.js';

const channelSchema = z.object({
  channel: z.coerce.number().int().min(1).max(8),
  connected: z.boolean(),
  alarmLevel: z.coerce.number().int().min(0).max(3),
}).strict();

export const gasReadingSchema = {
  body: z.object({
    gasType: z.string().trim().min(1).max(100).default(env.gasSensorType),
    concentration: z.union([z.null(), z.coerce.number().min(0).max(env.gasMaxConcentration)]).default(null),
    unit: z.string().trim().min(1).max(30).nullable().default(null),
    alarm: z.boolean().default(false),
    alarmLevel: z.coerce.number().int().min(0).max(3).default(0),
    trend: z.enum(['rising', 'stable', 'falling', 'unknown']).default('unknown'),
    sensorStatus: z.enum(['online', 'offline', 'fault', 'calibrating']).default('online'),
    timestamp: dateSchema.default(() => new Date()),
    channels: z.array(channelSchema).max(8).default([]),
  }).strict(),
};
