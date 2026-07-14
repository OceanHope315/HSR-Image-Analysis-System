function protocolDetection(item = {}) {
  const x1 = Number(item.bbox?.x ?? 0);
  const y1 = Number(item.bbox?.y ?? 0);
  const width = Number(item.bbox?.width ?? 0);
  const height = Number(item.bbox?.height ?? 0);
  return {
    name: String(item.className ?? ''),
    x1,
    y1,
    x2: x1 + width,
    y2: y1 + height,
    confidence: Number(item.confidence ?? 0),
  };
}

function detectionsForView(result, viewId) {
  const processedView = result?.views?.find((view) => Number(view.viewId) === viewId);
  if (processedView) return (processedView.detections ?? []).map(protocolDetection);
  const persistedViews = result?.inspection?.imageViews ?? [];
  const persistedView = persistedViews.find((view) => Number(view.viewId) === viewId);
  if (persistedView) return (persistedView.detections ?? []).map(protocolDetection);
  return (result?.inspection?.xrayResult ?? [])
    .filter((item) => Number(item.viewId ?? 0) === viewId)
    .map(protocolDetection);
}

/**
 * DEVELOPMENT FORMAT ONLY.
 * TODO(2026-08-18): Verify the exact resMsg0/resMsg1 serialization against the
 * real security machine. Keep any future delimiter/string/object changes here.
 */
export function adaptSecurityMachineSuccess(result) {
  return {
    resCode: 200,
    imgID: result?.imageId ?? result?.inspection?.sourceImageId ?? '',
    resMsg0: detectionsForView(result, 0),
    resMsg1: detectionsForView(result, 1),
    errorMsg: '',
  };
}

export function adaptSecurityMachineError(imageId, error) {
  return {
    resCode: 500,
    imgID: imageId ?? '',
    resMsg0: [],
    resMsg1: [],
    errorMsg: error?.isOperational || error?.statusCode < 500
      ? error.message
      : '服务器内部错误',
  };
}
