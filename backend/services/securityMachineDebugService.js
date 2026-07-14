import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

function withoutBase64(payload) {
  if (!payload || typeof payload !== 'object') return payload;
  const sanitized = { ...payload };
  if (payload.img && typeof payload.img === 'object') {
    sanitized.img = { ...payload.img };
    for (const field of ['img0', 'img1']) {
      if (typeof payload.img[field] === 'string') {
        sanitized.img[field] = `[BASE64 OMITTED: ${payload.img[field].length} chars]`;
      }
    }
  }
  return sanitized;
}

export async function saveSecurityMachineDebugRecord({ req, payload, response, error, startedAt }) {
  if (!env.securityMachineDebug) return;
  try {
    await fs.mkdir(env.securityMachineDebugDir, { recursive: true });
    const timestamp = new Date().toISOString();
    const fileName = `${timestamp.replace(/[:.]/g, '-')}-${crypto.randomUUID()}.json`;
    const record = {
      timestamp,
      durationMs: Math.round(performance.now() - startedAt),
      request: {
        method: req.method,
        path: req.originalUrl,
        remoteIp: req.ip ?? req.socket?.remoteAddress ?? null,
        contentType: req.get('content-type') ?? null,
        contentLength: req.get('content-length') ?? null,
        payload: withoutBase64(payload),
      },
      response,
      error: error ? { code: error.code ?? null, message: error.message } : null,
    };
    await fs.writeFile(path.join(env.securityMachineDebugDir, fileName), `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' });
  } catch (debugError) {
    logger.warn({ err: debugError }, '[SecurityMachine] 调试记录保存失败');
  }
}
