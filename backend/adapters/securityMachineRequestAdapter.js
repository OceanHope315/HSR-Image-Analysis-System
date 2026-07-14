import path from 'node:path';
import { env } from '../config/env.js';
import { validateImageBuffer, normalizeImageType } from '../services/imageValidationService.js';
import { AppError } from '../utils/AppError.js';

function requiredText(value, field, maxLength = 160) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) throw new AppError(400, 'SECURITY_MACHINE_REQUEST_INVALID', `缺少 ${field}`);
  if (normalized.length > maxLength) {
    throw new AppError(400, 'SECURITY_MACHINE_REQUEST_INVALID', `${field} 长度不能超过 ${maxLength}`);
  }
  return normalized;
}

function parseProtocolTimestamp(value) {
  const normalized = requiredText(value, 'img.imgTime', 32);
  const match = /^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})_(\d{3})$/.exec(normalized);
  if (!match) {
    throw new AppError(400, 'SECURITY_MACHINE_TIMESTAMP_INVALID', 'img.imgTime 格式应为 YYYYMMDD_hhmmss_SSS');
  }
  const [, year, month, day, hour, minute, second, millisecond] = match.map(Number);
  const date = new Date(year, month - 1, day, hour, minute, second, millisecond);
  if (
    date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
    || date.getHours() !== hour
    || date.getMinutes() !== minute
    || date.getSeconds() !== second
  ) {
    throw new AppError(400, 'SECURITY_MACHINE_TIMESTAMP_INVALID', 'img.imgTime 不是有效时间');
  }
  return date;
}

function decodeBase64(value, field) {
  const input = requiredText(value, field, Math.ceil(env.securityMachineImageLimitBytes * 4 / 3) + 200);
  const dataUri = /^data:(image\/(?:jpeg|jpg|png));base64,/i.exec(input);
  const encoded = (dataUri ? input.slice(dataUri[0].length) : input).replace(/\s+/g, '');
  if (!encoded || encoded.length % 4 === 1 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) {
    throw new AppError(400, 'SECURITY_MACHINE_BASE64_INVALID', `${field} 不是合法 Base64`);
  }
  const padded = encoded.padEnd(encoded.length + ((4 - encoded.length % 4) % 4), '=');
  const buffer = Buffer.from(padded, 'base64');
  if (!buffer.length || buffer.toString('base64').replace(/=+$/, '') !== padded.replace(/=+$/, '')) {
    throw new AppError(400, 'SECURITY_MACHINE_BASE64_INVALID', `${field} 无法解码`);
  }
  return { buffer, dataUriType: dataUri?.[1] ?? null };
}

function safeDisplayName(value, fallback) {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  const baseName = path.basename(value.trim()).replace(/[^A-Za-z0-9._-]/g, '_');
  return baseName.slice(0, 180) || fallback;
}

function adaptView(img, viewId, declaredType, imageId) {
  const encodedField = `img${viewId}`;
  if (img[encodedField] === undefined || img[encodedField] === null || img[encodedField] === '') return null;
  const { buffer, dataUriType } = decodeBase64(img[encodedField], `img.${encodedField}`);
  const type = validateImageBuffer(buffer, {
    declaredType: dataUriType ?? declaredType,
    maxBytes: env.securityMachineImageLimitBytes,
    label: `视角 ${viewId} 图片`,
  });
  const extension = type.extension;
  return {
    viewId,
    role: viewId === 0 ? 'primary' : 'side',
    fileName: safeDisplayName(img[`imgName${viewId}`], `${imageId}_${viewId}${extension}`),
    buffer,
    mimetype: type.mimetype,
    imageType: type.type,
    decodedSize: buffer.length,
  };
}

/**
 * Device JSON is isolated here because the real machine may use different field
 * names or nesting. Tomorrow's device verification should only need changes in
 * this adapter, not in YOLO, persistence, or UI code.
 */
export function adaptSecurityMachineRequest(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new AppError(400, 'SECURITY_MACHINE_REQUEST_INVALID', '请求体必须是 JSON 对象');
  }
  const deviceId = requiredText(payload.devID, 'devID', 120);
  const imageId = requiredText(payload.imgID, 'imgID', 160);
  const declaredType = normalizeImageType(requiredText(payload.imgType, 'imgType', 16));
  if (!['jpeg', 'png'].includes(declaredType)) {
    throw new AppError(400, 'SECURITY_MACHINE_IMAGE_TYPE_INVALID', 'imgType 仅支持 JPG、JPEG 或 PNG');
  }
  if (!payload.img || typeof payload.img !== 'object' || Array.isArray(payload.img)) {
    throw new AppError(400, 'SECURITY_MACHINE_REQUEST_INVALID', '缺少 img 对象');
  }
  const timestamp = parseProtocolTimestamp(payload.img.imgTime ?? imageId);
  const views = [
    adaptView(payload.img, 0, declaredType, imageId),
    adaptView(payload.img, 1, declaredType, imageId),
  ].filter(Boolean);
  if (!views.length) {
    throw new AppError(400, 'SECURITY_MACHINE_IMAGE_MISSING', 'img.img0 和 img.img1 至少需要提供一个');
  }

  return {
    source: 'security_machine',
    deviceId,
    imageId,
    imageType: declaredType,
    timestamp,
    views,
  };
}

export function protocolImageId(payload) {
  return typeof payload?.imgID === 'string' ? payload.imgID.slice(0, 160) : '';
}
