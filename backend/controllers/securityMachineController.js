import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { adaptSecurityMachineRequest, protocolImageId } from '../adapters/securityMachineRequestAdapter.js';
import { adaptSecurityMachineError, adaptSecurityMachineSuccess } from '../adapters/securityMachineProtocolAdapter.js';
import { processSecurityMachineInput } from '../services/securityMachineService.js';
import { saveSecurityMachineDebugRecord } from '../services/securityMachineDebugService.js';
import { emitEvent } from '../utils/socket.js';
import { AppError } from '../utils/AppError.js';

function securityMachineEnabled() {
  return ['security_machine', 'both'].includes(env.imageSource);
}

function logRequest(req, input) {
  logger.info({
    remoteIp: req.ip ?? req.socket?.remoteAddress,
    devID: input.deviceId,
    imgID: input.imageId,
    imgType: input.imageType,
    viewCount: input.views.length,
    views: input.views.map((view) => ({ viewId: view.viewId, decodedBytes: view.decodedSize })),
  }, '[SecurityMachine] Request received / Decode OK');
}

export async function receiveSecurityMachineImage(req, res) {
  const startedAt = performance.now();
  let responsePayload;
  let caughtError;
  let imageId = protocolImageId(req.body);
  try {
    if (!securityMachineEnabled()) {
      throw new AppError(503, 'SECURITY_MACHINE_SOURCE_DISABLED', `当前 IMAGE_SOURCE=${env.imageSource}，未启用安检仪 HTTP 输入`);
    }
    const input = adaptSecurityMachineRequest(req.body);
    imageId = input.imageId;
    logRequest(req, input);
    const result = await processSecurityMachineInput(input);
    responsePayload = adaptSecurityMachineSuccess(result);
    if (!result.duplicate) {
      emitEvent('inspection:created', result.inspection.toJSON?.() ?? result.inspection);
      emitEvent('image:processed', result.inspection.toJSON?.() ?? result.inspection);
      if (result.alarm?.level === 'high') emitEvent('alarm:high', result.alarm.toJSON?.() ?? result.alarm);
    }
    logger.info({
      devID: input.deviceId,
      imgID: input.imageId,
      duplicate: result.duplicate,
      yoloMs: Math.round(result.views.reduce((total, view) => total + Number(view.inferenceTimeMs ?? 0), 0)),
      views: result.views.map((view) => ({
        viewId: view.viewId,
        decodedBytes: view.decodedSize,
        resolution: view.imageWidth && view.imageHeight ? `${view.imageWidth}x${view.imageHeight}` : null,
        detectionCount: view.detections?.length ?? 0,
      })),
      totalMs: Math.round(performance.now() - startedAt),
      resCode: responsePayload.resCode,
    }, '[SecurityMachine] YOLO OK / Response sent');
    res.status(200).json(responsePayload);
  } catch (error) {
    caughtError = error;
    responsePayload = adaptSecurityMachineError(imageId, error);
    logger.error({
      err: error,
      imgID: imageId,
      totalMs: Math.round(performance.now() - startedAt),
      resCode: 500,
    }, `[SecurityMachine] ${error.code ?? 'REQUEST_FAILED'}`);
    res.status(500).json(responsePayload);
  } finally {
    await saveSecurityMachineDebugRecord({ req, payload: req.body, response: responsePayload, error: caughtError, startedAt });
  }
}

export function securityMachineJsonError(error, req, res, next) {
  if (!error) return next();
  const isBodyTooLarge = error.type === 'entity.too.large';
  const isInvalidJson = error instanceof SyntaxError && error.status === 400 && Object.hasOwn(error, 'body');
  if (!isBodyTooLarge && !isInvalidJson) return next(error);
  const normalized = new AppError(
    isBodyTooLarge ? 413 : 400,
    isBodyTooLarge ? 'SECURITY_MACHINE_REQUEST_TOO_LARGE' : 'SECURITY_MACHINE_JSON_INVALID',
    isBodyTooLarge ? `请求体超过 ${env.imageUploadLimitMb} MB 限制` : '请求体不是合法 JSON',
  );
  const payload = adaptSecurityMachineError('', normalized);
  logger.warn({ err: error, remoteIp: req.ip }, `[SecurityMachine] ${normalized.code}`);
  return res.status(500).json(payload);
}
