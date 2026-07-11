import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';

fs.mkdirSync(env.uploadDir, { recursive: true });
const allowed = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
  ['image/gif', '.gif'],
]);

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, env.uploadDir),
  filename: (_req, file, callback) => {
    const extension = allowed.get(file.mimetype);
    callback(null, `${Date.now()}-${crypto.randomUUID()}${extension}`);
  },
});

export const uploadXray = multer({
  storage,
  limits: { fileSize: env.maxUploadSize, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!allowed.has(file.mimetype)) {
      callback(new AppError(400, 'UPLOAD_TYPE_NOT_ALLOWED', '仅允许 JPG、PNG、WEBP 或 GIF 图片'));
      return;
    }
    const originalExtension = path.extname(path.basename(file.originalname)).toLowerCase();
    if (!['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(originalExtension)) {
      callback(new AppError(400, 'UPLOAD_TYPE_NOT_ALLOWED', '文件扩展名与图片类型不匹配'));
      return;
    }
    callback(null, true);
  },
}).single('image');

function matchesMagic(buffer, mimetype) {
  if (mimetype === 'image/jpeg') return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mimetype === 'image/png') {
    return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (mimetype === 'image/gif') return ['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString('ascii'));
  if (mimetype === 'image/webp') {
    return buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  }
  return false;
}

export async function validateUploadedImage(req, _res, next) {
  if (!req.file) return next();
  const resolved = path.resolve(req.file.path);
  const safeRoot = `${path.resolve(env.uploadDir)}${path.sep}`;
  if (!resolved.startsWith(safeRoot)) return next(new AppError(400, 'UPLOAD_PATH_INVALID', '上传路径不安全'));
  try {
    const handle = await fs.promises.open(resolved, 'r');
    const header = Buffer.alloc(12);
    await handle.read(header, 0, 12, 0);
    await handle.close();
    if (!matchesMagic(header, req.file.mimetype)) {
      await fs.promises.unlink(resolved).catch(() => undefined);
      return next(new AppError(400, 'UPLOAD_CONTENT_INVALID', '文件内容不是有效的图片格式'));
    }
    return next();
  } catch (error) {
    await fs.promises.unlink(resolved).catch(() => undefined);
    return next(new AppError(400, 'UPLOAD_READ_FAILED', '无法验证上传图片', [{ message: error.message }]));
  }
}
