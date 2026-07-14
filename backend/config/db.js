import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from './logger.js';

mongoose.set('strictQuery', true);
mongoose.set('bufferCommands', false);

function databaseNameFromUri(uri) {
  const withoutQuery = String(uri).split('?')[0].replace(/\/$/, '');
  return decodeURIComponent(withoutQuery.slice(withoutQuery.lastIndexOf('/') + 1));
}

export async function connectDatabase(uri = env.mongoUri) {
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  if (mongoose.connection.readyState === 2) return mongoose.connection.asPromise();
  if (env.isTest && !databaseNameFromUri(uri).endsWith('_test')) {
    throw new Error(`测试模式拒绝连接非 _test 数据库：${databaseNameFromUri(uri) || '(未指定数据库)'}`);
  }
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: env.isTest ? 10000 : 5000,
  });
  logger.info({ database: mongoose.connection.name }, 'MongoDB 已连接');
  return mongoose.connection;
}

export async function disconnectDatabase() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    logger.info('MongoDB 连接已关闭');
  }
}

export async function supportsTransactions() {
  if (env.transactionMode === 'off') return false;
  try {
    const hello = await mongoose.connection.db.admin().command({ hello: 1 });
    return Boolean(hello.setName || hello.msg === 'isdbgrid');
  } catch (error) {
    logger.warn({ err: error }, '无法检测事务支持，按单机模式安全降级');
    return false;
  }
}
