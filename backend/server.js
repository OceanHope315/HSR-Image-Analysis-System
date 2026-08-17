import http from 'node:http';
import { Server as SocketServer } from 'socket.io';
import app from './app.js';
import { connectDatabase, disconnectDatabase } from './config/db.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { startSensorCommunication, stopSensorCommunication } from './services/sensorAdapterService.js';
import { startLocalFolderImageSource, stopLocalFolderImageSource } from './services/localFolderImageSource.js';
import { setSocketServer } from './utils/socket.js';

let httpServer;
let io;
let shuttingDown = false;
let databaseRetryTimer;

async function connectDatabaseWithRetry() {
  try {
    await connectDatabase();
  } catch (error) {
    logger.error({ err: error }, 'MongoDB 暂不可用，后端将以降级状态启动并自动重试');
    if (!shuttingDown) {
      databaseRetryTimer = setTimeout(connectDatabaseWithRetry, env.databaseRetryDelayMs);
      databaseRetryTimer.unref?.();
    }
  }
}

async function start() {
  await connectDatabaseWithRetry();
  startSensorCommunication();
  httpServer = http.createServer(app);
  const origins = env.socketCorsOrigin.split(',').map((item) => item.trim()).filter(Boolean);
  io = new SocketServer(httpServer, {
    cors: { origin: origins, credentials: true },
    transports: ['websocket', 'polling'],
  });
  io.on('connection', (socket) => {
    logger.debug({ socketId: socket.id }, '单机模式实时连接已建立');
  });
  setSocketServer(io);
  startLocalFolderImageSource();
  await new Promise((resolve) => httpServer.listen(env.port, env.host, resolve));
  logger.info(
    { host: env.host, port: env.port, address: `http://${env.host}:${env.port}` },
    '铁路安检判图辅助决策系统后端已启动',
  );
}

async function shutdown(signal, exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, '正在优雅关闭服务');
  const forceTimer = setTimeout(() => process.exit(1), 10_000);
  forceTimer.unref();
  clearTimeout(databaseRetryTimer);
  stopSensorCommunication();
  stopLocalFolderImageSource();
  if (io) await new Promise((resolve) => io.close(resolve));
  if (httpServer?.listening) {
    await new Promise((resolve) => httpServer.close(resolve));
  }
  await disconnectDatabase();
  clearTimeout(forceTimer);
  process.exit(exitCode);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (error) => {
  logger.fatal({ err: error }, '未处理的 Promise 拒绝');
  shutdown('unhandledRejection', 1);
});
process.on('uncaughtException', (error) => {
  logger.fatal({ err: error }, '未捕获异常');
  shutdown('uncaughtException', 1);
});

start().catch((error) => {
  logger.fatal({ err: error }, '服务启动失败');
  process.exit(1);
});
