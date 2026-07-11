import { z } from 'zod';
import { idParamsSchema, paginationSchema } from './common.js';

const deviceFields = {
  deviceCode: z.string().trim().min(1).max(50),
  deviceName: z.string().trim().min(1).max(100),
  deviceType: z.enum(['xray', 'gas_sensor', 'integrated', 'gateway', 'other']),
  location: z.string().trim().min(1).max(200),
  status: z.enum(['online', 'offline', 'warning', 'maintenance']),
  metadata: z.record(z.string(), z.unknown()).optional(),
};

export const createDeviceSchema = {
  body: z.object({
    ...deviceFields,
    deviceType: deviceFields.deviceType.default('integrated'),
    status: deviceFields.status.default('offline'),
  }).strict(),
};
export const updateDeviceSchema = {
  params: idParamsSchema,
  body: z.object(deviceFields).partial().strict().refine((body) => Object.keys(body).length > 0, '至少提供一个字段'),
};
export const deviceIdSchema = { params: idParamsSchema };
export const listDevicesSchema = {
  query: z.object({
    ...paginationSchema,
    status: deviceFields.status.optional(),
    deviceType: deviceFields.deviceType.optional(),
    keyword: z.string().trim().max(100).optional(),
  }),
};
