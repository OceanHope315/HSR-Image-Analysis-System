import { z } from 'zod';
import { dateSchema, objectIdSchema } from './common.js';
import { detectionSchema, gasSensorSchema } from './inspectionValidator.js';

function jsonField(schema, label) {
  return z.union([
    schema,
    z.string().max(100_000).transform((value, context) => {
      try {
        return JSON.parse(value);
      } catch {
        context.addIssue({ code: 'custom', message: `${label} 不是有效 JSON` });
        return z.NEVER;
      }
    }),
  ]).pipe(schema);
}

const optionalObjectId = z.preprocess(
  (value) => value === '' || value === null ? undefined : value,
  objectIdSchema.optional(),
);

const gasSimulationSchema = gasSensorSchema.extend({
  connectionStatus: z.literal('simulation').default('simulation'),
  source: z.literal('simulation').default('simulation'),
}).refine((value) => value.concentration !== null, {
  path: ['concentration'],
  message: '气体模拟模式必须提供浓度',
});

export const smartDetectionSchema = {
  body: z.object({
    packageId: z.string().trim().min(1, 'packageId 必填').max(80),
    timestamp: dateSchema.default(() => new Date()),
    deviceId: optionalObjectId,
    visionMode: z.enum(['real', 'simulation']).default('simulation'),
    gasMode: z.enum(['device', 'simulation']).default('simulation'),
    visionSimulationData: jsonField(z.array(detectionSchema).max(100), 'visionSimulationData').optional(),
    gasSimulationData: jsonField(gasSimulationSchema, 'gasSimulationData').optional(),
  }).strict().superRefine((value, context) => {
    if (value.gasMode === 'simulation' && !value.gasSimulationData) {
      context.addIssue({ code: 'custom', path: ['gasSimulationData'], message: '气体模拟模式必须提供模拟数据' });
    }
  }),
};
