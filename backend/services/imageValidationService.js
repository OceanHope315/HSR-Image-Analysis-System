import path from 'node:path';
import { AppError } from '../utils/AppError.js';

const imageTypes = Object.freeze({
  jpeg: { mimetype: 'image/jpeg', extension: '.jpg' },
  png: { mimetype: 'image/png', extension: '.png' },
  bmp: { mimetype: 'image/bmp', extension: '.bmp' },
  webp: { mimetype: 'image/webp', extension: '.webp' },
  gif: { mimetype: 'image/gif', extension: '.gif' },
});

const typeAliases = new Map([
  ['jpg', 'jpeg'],
  ['jpeg', 'jpeg'],
  ['image/jpg', 'jpeg'],
  ['image/jpeg', 'jpeg'],
  ['png', 'png'],
  ['image/png', 'png'],
  ['bmp', 'bmp'],
  ['image/bmp', 'bmp'],
  ['webp', 'webp'],
  ['image/webp', 'webp'],
  ['gif', 'gif'],
  ['image/gif', 'gif'],
]);

export function normalizeImageType(value) {
  return typeAliases.get(String(value ?? '').trim().toLowerCase()) ?? null;
}

export function imageTypeDetails(value) {
  const type = normalizeImageType(value);
  return type ? { type, ...imageTypes[type] } : null;
}

export function imageTypeFromFileName(fileName) {
  return normalizeImageType(path.extname(String(fileName ?? '')).slice(1));
}

export function detectImageType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpeg';
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buffer.subarray(0, 2).toString('ascii') === 'BM') return 'bmp';
  if (['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString('ascii'))) return 'gif';
  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp';
  return null;
}

export function validateImageBuffer(buffer, { declaredType, maxBytes, label = '图片' } = {}) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new AppError(400, 'IMAGE_EMPTY', `${label}为空`);
  }
  if (maxBytes && buffer.length > maxBytes) {
    throw new AppError(413, 'IMAGE_TOO_LARGE', `${label}超过大小限制`, [{
      actualBytes: buffer.length,
      maxBytes,
    }]);
  }
  const actualType = detectImageType(buffer);
  if (!actualType) throw new AppError(400, 'IMAGE_CONTENT_INVALID', `${label}不是有效的受支持图片`);
  const expectedType = declaredType ? normalizeImageType(declaredType) : null;
  if (declaredType && !expectedType) {
    throw new AppError(400, 'IMAGE_TYPE_NOT_ALLOWED', `${label}格式不受支持：${declaredType}`);
  }
  if (expectedType && expectedType !== actualType) {
    throw new AppError(400, 'IMAGE_FORMAT_MISMATCH', `${label}声明格式与实际内容不一致`, [{
      declaredType: expectedType,
      actualType,
    }]);
  }
  return { type: actualType, ...imageTypes[actualType], size: buffer.length };
}
