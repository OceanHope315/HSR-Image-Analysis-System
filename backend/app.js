import path from 'node:path';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { errorMiddleware, notFoundMiddleware } from './middleware/errorMiddleware.js';
import alarmRoutes from './routes/alarmRoutes.js';
import authRoutes from './routes/authRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import deviceRoutes from './routes/deviceRoutes.js';
import inspectionRoutes from './routes/inspectionRoutes.js';
import logRoutes from './routes/logRoutes.js';
import simulationRoutes from './routes/simulationRoutes.js';
import uploadRoutes from './routes/uploadRoutes.js';
import userRoutes from './routes/userRoutes.js';
import { health } from './controllers/healthController.js';
import { AppError } from './utils/AppError.js';

const allowedOrigins = new Set(env.clientOrigin.split(',').map((item) => item.trim()).filter(Boolean));
export const app = express();

app.disable('x-powered-by');
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    return callback(new AppError(403, 'CORS_NOT_ALLOWED', '请求来源不在允许列表中'));
  },
  credentials: true,
}));
app.use(pinoHttp({ logger, quietReqLogger: env.isProduction }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false, limit: '256kb' }));

app.get('/api/v1/health', health);
app.use('/uploads/xrays', express.static(path.resolve(env.uploadDir), {
  index: false,
  dotfiles: 'deny',
  maxAge: env.isProduction ? '1d' : 0,
}));
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/inspections', inspectionRoutes);
app.use('/api/v1/alarms', alarmRoutes);
app.use('/api/v1/devices', deviceRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/logs', logRoutes);
app.use('/api/v1/simulation', simulationRoutes);
app.use('/api/v1/uploads', uploadRoutes);

app.use(notFoundMiddleware);
app.use(errorMiddleware);

export default app;
