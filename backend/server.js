import http from 'node:http';
import jwt from 'jsonwebtoken';
import { Server as SocketServer } from 'socket.io';
import app from './app.js';
import { connectDatabase, disconnectDatabase } from './config/db.js';
import { assertRuntimeSecrets, env } from './config/env.js';
import { logger } from './config/logger.js';
import { User } from './models/User.js';
import { setSocketServer } from './utils/socket.js';

let httpServer;
let io;
let shuttingDown = false;

async function start() {
  assertRuntimeSecrets();
  await connectDatabase();
  httpServer = http.createServer(app);
  const origins = env.socketCorsOrigin.split(',').map((item) => item.trim()).filter(Boolean);
  io = new SocketServer(httpServer, {
    cors: { origin: origins, credentials: true },
    transports: ['websocket', 'polling'],
  });
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('UNAUTHORIZED'));
      const payload = jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] });
      const user = await User.findOne({ _id: payload.sub, isActive: true });
      if (!user) return next(new Error('UNAUTHORIZED'));
      socket.data.user = { id: String(user._id), role: user.role, username: user.username };
      return next();
    } catch {
      return next(new Error('UNAUTHORIZED'));
    }
  });
  io.on('connection', (socket) => {
    logger.debug({ socketId: socket.id, userId: socket.data.user.id }, '实时连接已建立');
  });
  setSocketServer(io);
  await new Promise((resolve) => httpServer.listen(env.port, resolve));
  logger.info({ port: env.port }, '铁路安检判图辅助决策系统后端已启动');
}

async function shutdown(signal, exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, '正在优雅关闭服务');
  const forceTimer = setTimeout(() => process.exit(1), 10_000);
  forceTimer.unref();
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
