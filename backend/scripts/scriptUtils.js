import { connectDatabase, disconnectDatabase } from '../config/db.js';
import { logger } from '../config/logger.js';

export async function runScript(name, task) {
  try {
    await connectDatabase();
    await task();
    logger.info({ script: name }, '脚本执行完成');
    process.stdout.write(`${name} 执行完成\n`);
  } catch (error) {
    logger.error({ err: error, script: name }, '脚本执行失败');
    process.stderr.write(`${name} 执行失败：${error.message}\n`);
    process.exitCode = 1;
  } finally {
    await disconnectDatabase();
  }
}

export function requireValue(name, value) {
  if (!value) throw new Error(`缺少环境变量 ${name}`);
  return value;
}
