import { useMemo, useState } from 'react';
import { formatPercent, resolveAssetUrl } from '../utils/formatters.js';

function toPercent(value, dimension) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  if (numeric >= 0 && numeric <= 1) return numeric * 100;
  return dimension > 0 ? (numeric / dimension) * 100 : 0;
}

export default function ImageOverlay({ src, detections = [] }) {
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const url = resolveAssetUrl(src);
  const boxes = useMemo(
    () => detections.filter((item) => item?.bbox).map((item, index) => {
      const box = item.bbox;
      const left = Math.max(0, Math.min(100, toPercent(box.x, dimensions.width)));
      const top = Math.max(0, Math.min(100, toPercent(box.y, dimensions.height)));
      const width = Math.max(0, Math.min(100 - left, toPercent(box.width, dimensions.width)));
      const height = Math.max(0, Math.min(100 - top, toPercent(box.height, dimensions.height)));
      return {
        ...item,
        key: item._id ?? `${item.className}-${index}`,
        style: {
          left: `${left}%`,
          top: `${top}%`,
          width: `${width}%`,
          height: `${height}%`,
        },
      };
    }),
    [detections, dimensions],
  );

  if (!url) {
    return (
      <div className="image-placeholder" role="img" aria-label="暂无 X 光图片">
        <span>▧</span>
        <strong>暂无 X 光图片</strong>
        <small>模拟记录可以不包含图片</small>
      </div>
    );
  }
  return (
    <div className="xray-stage">
      <div className="xray-image-frame">
        <img
          src={url}
          alt="包裹 X 光检测图"
          onLoad={(event) => setDimensions({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
        />
        {boxes.map((box) => (
          <div key={box.key} className="detection-box" style={box.style}>
            <span>{box.className || '未知目标'} {formatPercent(box.confidence)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
