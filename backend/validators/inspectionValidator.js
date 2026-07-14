import { z } from 'zod';
import { dateSchema, idParamsSchema, objectIdSchema, paginationSchema } from './common.js';

const bboxSchema = z.object({
  x: z.coerce.number().min(0),
  y: z.coerce.number().min(0),
  width: z.coerce.number().min(0),
  height: z.coerce.number().min(0),
});

export const detectionSchema = z.object({
  className: z.string().trim().min(1).max(100),
  confidence: z.coerce.number().min(0).max(1),
  bbox: bboxSchema,
  modelName: z.string().trim().max(100).default('mock-yolo'),
  modelVersion: z.string().trim().max(100).default('simulation-v1'),
});

const gasChannelSchema = z.object({
  channel: z.coerce.number().int().min(1).max(8),
  connected: z.boolean().default(false),
  alarmLevel: z.coerce.number().int().min(0).max(3).default(0),
  alarmText: z.string().trim().max(30).default(''),
});

export const gasSensorSchema = z.object({
  gasType: z.string().trim().min(1).max(100).default('combustible'),
  concentration: z.union([z.null(), z.coerce.number().min(0)]).default(null),
  unit: z.string().trim().min(1).max(30).nullable().default(null),
  alarm: z.boolean().default(false),
  alarmLevel: z.coerce.number().int().min(0).max(3).default(0),
  trend: z.enum(['rising', 'stable', 'falling', 'unknown']).default('stable'),
  sensorStatus: z.enum(['online', 'offline', 'fault', 'calibrating']).default('online'),
  collectedAt: dateSchema.default(() => new Date()),
  connectionStatus: z.enum(['online', 'offline', 'timeout', 'simulation']).default('simulation'),
  source: z.enum(['device', 'simulation']).default('simulation'),
  lastReceivedAt: dateSchema.nullable().optional(),
  channels: z.array(gasChannelSchema).max(8).default([]),
});

const sourceModeSchema = z.object({
  vision: z.enum(['real', 'simulation']).default('simulation'),
  gas: z.enum(['device', 'simulation']).default('simulation'),
});

const serviceStatusSchema = z.object({
  yolo: z.enum(['online', 'offline', 'simulation']).default('simulation'),
  gas: z.enum(['online', 'offline', 'timeout', 'simulation']).default('simulation'),
});

const associationSchema = z.object({
  syncSignal: z.string().max(120).nullable().optional(),
  windowStart: dateSchema.nullable().optional(),
  windowEnd: dateSchema.nullable().optional(),
  quality: z.enum(['exact', 'estimated', 'unlinked']).default('unlinked'),
  notes: z.string().max(500).optional(),
}).optional();

export const createInspectionSchema = {
  body: z.object({
    packageId: z.string().trim().min(1, 'packageId 必填').max(80),
    timestamp: dateSchema.default(() => new Date()),
    xrayImageUrl: z.string().trim().max(500).nullable().optional(),
    originalImageUrl: z.string().trim().max(500).nullable().optional(),
    annotatedImageUrl: z.string().trim().max(500).nullable().optional(),
    inferenceTimeMs: z.coerce.number().min(0).nullable().optional(),
    imageWidth: z.coerce.number().min(0).nullable().optional(),
    imageHeight: z.coerce.number().min(0).nullable().optional(),
    xrayResult: z.array(detectionSchema).max(100).default([]),
    gasSensor: gasSensorSchema.nullable().optional(),
    sourceMode: sourceModeSchema.optional(),
    serviceStatus: serviceStatusSchema.optional(),
    association: associationSchema,
    deviceId: objectIdSchema.nullable().optional(),
    source: z.enum(['manual', 'simulation', 'api']).default('manual'),
    status: z.enum(['pending', 'reviewed', 'escalated', 'closed']).default('pending'),
  }).strict(),
};

export const updateInspectionSchema = {
  params: idParamsSchema,
  body: z.object({
    packageId: z.string().trim().min(1).max(80).optional(),
    timestamp: dateSchema.optional(),
    xrayImageUrl: z.string().trim().max(500).nullable().optional(),
    originalImageUrl: z.string().trim().max(500).nullable().optional(),
    annotatedImageUrl: z.string().trim().max(500).nullable().optional(),
    inferenceTimeMs: z.coerce.number().min(0).nullable().optional(),
    imageWidth: z.coerce.number().min(0).nullable().optional(),
    imageHeight: z.coerce.number().min(0).nullable().optional(),
    xrayResult: z.array(detectionSchema).max(100).optional(),
    gasSensor: gasSensorSchema.nullable().optional(),
    sourceMode: sourceModeSchema.optional(),
    serviceStatus: serviceStatusSchema.optional(),
    association: associationSchema,
    deviceId: objectIdSchema.nullable().optional(),
    status: z.enum(['pending', 'reviewed', 'escalated', 'closed']).optional(),
  }).strict().refine((body) => Object.keys(body).length > 0, '至少提供一个可更新字段'),
};

export const inspectionIdSchema = { params: idParamsSchema };

export const listInspectionsSchema = {
  query: z.object({
    ...paginationSchema,
    riskLevel: z.enum(['low', 'medium', 'high']).optional(),
    status: z.enum(['pending', 'reviewed', 'escalated', 'closed']).optional(),
    packageId: z.string().trim().max(80).optional(),
    gasAlarm: z.enum(['true', 'false']).transform((value) => value === 'true').optional(),
    startTime: dateSchema.optional(),
    endTime: dateSchema.optional(),
    sortBy: z.enum(['timestamp', 'riskScore', 'createdAt', 'packageId']).default('timestamp'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
    includeDeleted: z.enum(['true', 'false']).transform((value) => value === 'true').default(false),
  }).refine((query) => !query.startTime || !query.endTime || query.startTime <= query.endTime, {
    message: 'startTime 不能晚于 endTime',
  }),
};
