import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(backendRoot, '.env'), quiet: true });

const booleanFromEnv = z
  .enum(['true', 'false'])
  .default('true')
  .transform((value) => value === 'true');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  MONGO_URI: z.string().min(1).default('mongodb://127.0.0.1:27017/railway_security'),
  TEST_MONGO_URI: z.string().optional(),
  JWT_SECRET: z.string().default(''),
  JWT_EXPIRES_IN: z.string().default('8h'),
  CLIENT_ORIGIN: z.string().default('http://localhost:5174'),
  UPLOAD_DIR: z.string().default('uploads/xrays'),
  MAX_UPLOAD_SIZE: z.coerce.number().int().positive().default(5 * 1024 * 1024),
  LOG_LEVEL: z.string().default('info'),
  SOCKET_CORS_ORIGIN: z.string().default('http://localhost:5174'),
  TRANSACTION_MODE: z.enum(['auto', 'required', 'off']).default('auto'),
  SIMULATION_ENABLED: booleanFromEnv,
  DEVICE_OFFLINE_AFTER_SECONDS: z.coerce.number().int().positive().default(90),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const messages = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
  throw new Error(`环境变量配置不合法：${messages.join('; ')}`);
}

const values = parsed.data;
const uploadDir = path.isAbsolute(values.UPLOAD_DIR)
  ? values.UPLOAD_DIR
  : path.resolve(backendRoot, values.UPLOAD_DIR);

export const env = Object.freeze({
  nodeEnv: values.NODE_ENV,
  port: values.PORT,
  mongoUri: values.NODE_ENV === 'test' && values.TEST_MONGO_URI ? values.TEST_MONGO_URI : values.MONGO_URI,
  jwtSecret: values.JWT_SECRET,
  jwtExpiresIn: values.JWT_EXPIRES_IN,
  clientOrigin: values.CLIENT_ORIGIN,
  uploadDir,
  maxUploadSize: values.MAX_UPLOAD_SIZE,
  logLevel: values.LOG_LEVEL,
  socketCorsOrigin: values.SOCKET_CORS_ORIGIN,
  transactionMode: values.TRANSACTION_MODE,
  simulationEnabled: values.SIMULATION_ENABLED,
  deviceOfflineAfterSeconds: values.DEVICE_OFFLINE_AFTER_SECONDS,
  backendRoot,
  isProduction: values.NODE_ENV === 'production',
  isTest: values.NODE_ENV === 'test',
});

export function assertRuntimeSecrets() {
  if (!env.jwtSecret || env.jwtSecret.length < 32) {
    throw new Error('JWT_SECRET 未配置或长度不足 32 个字符，请在 backend/.env 中设置安全随机值');
  }
}
