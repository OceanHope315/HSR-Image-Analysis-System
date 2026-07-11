import { z } from 'zod';
import { createInspectionSchema } from './inspectionValidator.js';
import { objectIdSchema } from './common.js';

export const generateSimulationSchema = {
  body: createInspectionSchema.body.partial().extend({
    risk: z.enum(['low', 'medium', 'high']).optional(),
  }).strict().default({}),
};
export const batchSimulationSchema = {
  body: z.object({ count: z.coerce.number().int().min(1).max(100).default(10) }).strict(),
};
export const simulationHeartbeatSchema = {
  body: z.object({ deviceId: objectIdSchema.optional() }).strict().default({}),
};
