import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { detectionApi } from '../api/detectionApi.js';
import { deviceApi } from '../api/deviceApi.js';
import ImageOverlay from '../components/ImageOverlay.jsx';
import { Spinner } from '../components/StateViews.jsx';
import { useRealtime } from '../context/realtime-context.js';
import {
  detectionClassLabel,
  formatDateTime,
  formatNumber,
  formatPercent,
  normalizeList,
  objectId,
  toDateTimeLocal,
} from '../utils/formatters.js';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/bmp', 'image/webp']);
const detectionSteps = [
  ['图片上传中', '正在把图像和检测参数发送到后端'],
  ['YOLO 检测中', '真实模式调用模型，模拟模式读取演示目标框'],
  ['正在读取气体数据', '获取通信设备最新数据或模拟输入'],
  ['正在进行风险融合', '由后端统一计算风险等级和依据'],
  ['正在保存检测记录', '写入 MongoDB 并关联报警'],
  ['检测完成', '结果已保存，可前往详情复核'],
];
const connectionNames = {
  online: '在线',
  offline: '离线',
  timeout: '通信超时',
  simulation: '模拟模式',
  checking: '检查中',
  unknown: '未知',
};

function createPackageId() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  const compact = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `PKG-${compact}`;
}

function createInitialForm() {
  return {
  packageId: createPackageId(),
  timestamp: toDateTimeLocal(),
  deviceId: '',
  className: '',
  confidence: '0.80',
  bboxX: '0.2',
  bboxY: '0.2',
  bboxWidth: '0.3',
  bboxHeight: '0.3',
  gasType: 'combustible',
  concentration: '0',
  unit: 'ppm',
  gasAlarm: false,
  trend: 'stable',
  sensorStatus: 'online',
  };
}

const detectionErrorMessages = {
  NETWORK_ERROR: '无法连接后端服务，请确认 Express 服务已启动并检查网络连接。',
  IMAGE_REQUIRED: '真实 YOLO 检测必须先选择一张图片。',
  UPLOAD_TYPE_NOT_ALLOWED: '图片格式不支持，请选择 JPG、PNG、BMP 或 WebP。',
  UPLOAD_CONTENT_INVALID: '所选文件内容不是有效图片，请重新选择。',
  UPLOAD_ERROR: '图片上传失败或文件超过 5 MB，请重新选择。',
  YOLO_SERVICE_OFFLINE: 'YOLO 服务未启动，请启动 Python 服务或切换到视觉模拟数据。',
  YOLO_SERVICE_TIMEOUT: 'YOLO 检测超时，请检查模型服务或切换到视觉模拟数据。',
  YOLO_MODEL_NOT_LOADED: 'YOLO 模型尚未加载，请检查模型路径或切换到视觉模拟数据。',
  MODEL_NOT_FOUND: '未找到 YOLO 模型文件，请检查 yolo-service/.env 中的模型路径。',
  MODEL_LOAD_FAILED: 'YOLO 模型加载失败，请检查模型文件与 Python 依赖。',
  GAS_DEVICE_OFFLINE: '气体通信当前离线，无法执行设备操作，请切换到气体模拟数据。',
  DATABASE_UNAVAILABLE: 'MongoDB 当前不可用，检测记录尚未保存。',
  DUPLICATE_IMAGE: '该图片刚刚已经提交，请勿重复检测。',
  DETECTION_IN_PROGRESS: '相同检测正在处理中，请等待本次检测完成。',
};

function readableError(error, fallback = '检测失败，请稍后重试。') {
  const message = detectionErrorMessages[error?.code] || error?.message || fallback;
  const details = Array.isArray(error?.details)
    ? error.details.map((item) => item?.message || item?.detail || (typeof item === 'string' ? item : '')).filter(Boolean)
    : [];
  return details.length ? `${message}（${details.join('；')}）` : message;
}

function ServiceStatusCard({ title, tone, value, children, action }) {
  return (
    <article className={`service-status-card service-status-card--${tone}`}>
      <div className="service-status-heading">
        <span className="service-status-dot" />
        <div><small>{title}</small><strong>{value}</strong></div>
      </div>
      {children}
      {action}
    </article>
  );
}

function rawFrameText(frame) {
  if (typeof frame === 'string' && frame.trim()) return frame.trim();
  if (Array.isArray(frame) && frame.length) {
    return frame.map((value) => Number(value).toString(16).padStart(2, '0').toUpperCase()).join(' ');
  }
  return '等待设备提供原始报文…';
}

const riskLabels = { high: '高风险', medium: '中风险', low: '低风险' };
const alarmLevelNames = ['无报警', '一级报警', '二级报警', '三级报警'];

export default function NewInspectionPage() {
  const { latestInspection } = useRealtime();
  const [searchParams, setSearchParams] = useSearchParams();
  const fileInputRef = useRef(null);
  const [form, setForm] = useState(createInitialForm);
  const [devices, setDevices] = useState([]);
  const [selectedImage, setSelectedImage] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [visionMode, setVisionMode] = useState('real');
  const [gasMode, setGasMode] = useState('device');
  const [serviceStatus, setServiceStatus] = useState(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusError, setStatusError] = useState('');
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [notice, setNotice] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [detectionStage, setDetectionStage] = useState(-1);
  const [detectionFailed, setDetectionFailed] = useState(false);
  const [detectionResult, setDetectionResult] = useState(null);
  const [activeViewId, setActiveViewId] = useState(0);
  const [clearingAlarm, setClearingAlarm] = useState(false);
  const advancedOpen = searchParams.get('settings') === '1';

  const loadServiceStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const status = await detectionApi.status();
      setServiceStatus(status);
      setStatusError('');
    } catch (error) {
      setServiceStatus(null);
      setStatusError(readableError(error, '无法读取服务状态。'));
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    deviceApi.list({ pageSize: 100 }).then((payload) => setDevices(normalizeList(payload))).catch(() => setDevices([]));
  }, []);

  useEffect(() => {
    loadServiceStatus();
    const timer = window.setInterval(loadServiceStatus, 15_000);
    return () => window.clearInterval(timer);
  }, [loadServiceStatus]);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  useEffect(() => {
    if (!['local', 'security_machine'].includes(latestInspection?.imageSource)) return;
    setDetectionResult({ inspection: latestInspection, alarm: null });
    setActiveViewId(latestInspection.imageViews?.some((view) => Number(view.viewId) === 0) ? 0 : 1);
    setForm((current) => ({
      ...current,
      packageId: latestInspection.packageId ?? current.packageId,
      timestamp: toDateTimeLocal(latestInspection.imageTime ?? latestInspection.timestamp),
    }));
    setDetectionStage(detectionSteps.length - 1);
    setDetectionFailed(false);
    setServerError('');
    setNotice(latestInspection.imageSource === 'security_machine'
      ? '已接收真实安检仪 HTTP 图像并完成检测。'
      : '已从本地监听文件夹读取新图像并完成检测。');
  }, [latestInspection]);

  const update = (name, value) => setForm((current) => ({ ...current, [name]: value }));

  const clearImage = () => {
    setSelectedImage(null);
    setPreviewUrl('');
    setErrors((current) => ({ ...current, image: '' }));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const selectImage = (file) => {
    setErrors((current) => ({ ...current, image: '' }));
    if (!file) return;
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      setErrors((current) => ({ ...current, image: '仅支持 JPG、PNG、BMP 或 WebP 图片。' }));
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setErrors((current) => ({ ...current, image: '图片不能超过 5 MB。' }));
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    setSelectedImage(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setDragActive(false);
    if (!submitting) selectImage(event.dataTransfer.files?.[0]);
  };

  const generateGasSimulation = () => {
    const alarming = Math.random() < 0.3;
    const concentration = alarming ? 120 + Math.random() * 180 : 5 + Math.random() * 70;
    setForm((current) => ({
      ...current,
      gasType: 'combustible',
      concentration: concentration.toFixed(2),
      unit: 'ppm',
      gasAlarm: alarming,
      trend: alarming ? 'rising' : Math.random() < 0.5 ? 'stable' : 'falling',
      sensorStatus: 'online',
    }));
    setNotice('已生成一组气体模拟数据，可继续调整后提交。');
    setErrors((current) => ({ ...current, gasType: '', concentration: '' }));
  };

  const validate = () => {
    const next = {};
    if (!form.packageId.trim()) next.packageId = '包裹编号为必填项。';
    if (!form.timestamp || Number.isNaN(new Date(form.timestamp).getTime())) next.timestamp = '请选择有效检测时间。';
    if (visionMode === 'real' && !selectedImage) next.image = '真实 YOLO 检测必须选择图片。';

    if (visionMode === 'simulation' && form.className.trim()) {
      const confidence = Number(form.confidence);
      if (form.confidence === '' || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) next.confidence = '置信度必须在 0 到 1 之间。';
      ['bboxX', 'bboxY', 'bboxWidth', 'bboxHeight'].forEach((key) => {
        const value = Number(form[key]);
        if (form[key] === '' || !Number.isFinite(value) || value < 0 || value > 1) next.bbox = '演示框坐标需使用 0 到 1 的归一化数值。';
      });
    }

    if (gasMode === 'simulation') {
      if (!form.gasType.trim()) next.gasType = '气体类型为必填项。';
      const concentration = Number(form.concentration);
      if (form.concentration === '' || !Number.isFinite(concentration) || concentration < 0) next.concentration = '浓度必须是非负数字。';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    setServerError('');
    setNotice('');
    setDetectionFailed(false);
    setDetectionResult(null);
    setDetectionStage(0);
    const progressTimer = window.setInterval(() => {
      setDetectionStage((current) => (current >= 0 && current < 4 ? current + 1 : current));
    }, 700);

    try {
      const timestamp = new Date(form.timestamp).toISOString();
      const visionSimulationData = visionMode === 'simulation'
        ? form.className.trim() ? [{
          className: form.className.trim(),
          confidence: Number(form.confidence),
          bbox: {
            x: Number(form.bboxX),
            y: Number(form.bboxY),
            width: Number(form.bboxWidth),
            height: Number(form.bboxHeight),
          },
          modelName: 'mock-yolo',
          modelVersion: 'simulation-v1',
        }] : []
        : undefined;
      const gasSimulationData = gasMode === 'simulation' ? {
        gasType: form.gasType.trim(),
        concentration: Number(form.concentration),
        unit: form.unit,
        alarm: form.gasAlarm,
        alarmLevel: form.gasAlarm ? 1 : 0,
        trend: form.trend,
        sensorStatus: form.sensorStatus,
        collectedAt: timestamp,
        lastReceivedAt: timestamp,
        connectionStatus: 'simulation',
        source: 'simulation',
        channels: [],
      } : undefined;

      const result = await detectionApi.detectImage({
        packageId: form.packageId.trim(),
        timestamp,
        deviceId: form.deviceId || undefined,
        visionMode,
        gasMode,
        visionSimulationData,
        gasSimulationData,
        image: selectedImage || undefined,
      });
      window.clearInterval(progressTimer);
      setDetectionResult(result);
      setActiveViewId(0);
      setDetectionStage(detectionSteps.length - 1);
      setNotice('检测已完成，记录和关联报警已按后端规则保存。');
      await loadServiceStatus();
    } catch (error) {
      setDetectionFailed(true);
      setServerError(readableError(error));
      loadServiceStatus();
    } finally {
      window.clearInterval(progressTimer);
      setSubmitting(false);
    }
  };

  const handleClearAlarm = async () => {
    setClearingAlarm(true);
    setServerError('');
    setNotice('');
    try {
      await detectionApi.clearGasAlarm();
      setNotice('解除报警命令已发送，请等待设备下一次心跳确认。');
      await loadServiceStatus();
    } catch (error) {
      setServerError(readableError(error, '解除报警失败。'));
    } finally {
      setClearingAlarm(false);
    }
  };

  const closeAdvanced = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('settings');
    setSearchParams(next, { replace: true });
  };

  const startNextInspection = () => {
    clearImage();
    setForm(createInitialForm());
    setDetectionResult(null);
    setActiveViewId(0);
    setDetectionStage(-1);
    setDetectionFailed(false);
    setServerError('');
    setNotice('已切换到下一件包裹。');
  };

  const yolo = serviceStatus?.yolo;
  const gas = serviceStatus?.gas;
  const database = serviceStatus?.database;
  const yoloOnline = yolo?.status === 'online';
  const yoloReady = yoloOnline && yolo?.modelLoaded;
  const gasOnline = gas?.connectionStatus === 'online';
  const databaseOnline = database?.connected === true;
  const yoloTone = statusLoading && !yolo ? 'checking' : yoloReady ? 'online' : yoloOnline ? 'warning' : 'offline';
  const gasTone = statusLoading && !gas ? 'checking' : gasOnline ? (gas?.alarm ? 'warning' : 'online') : 'offline';
  const databaseTone = statusLoading && !database ? 'checking' : databaseOnline ? 'online' : 'offline';
  const record = detectionResult?.inspection ?? null;
  const recordId = objectId(record);
  const imageViews = Array.isArray(record?.imageViews) ? record.imageViews : [];
  const activeView = imageViews.find((view) => Number(view.viewId) === activeViewId) ?? imageViews[0];
  const detections = activeView
    ? (Array.isArray(activeView.detections) ? activeView.detections : [])
    : (Array.isArray(record?.xrayResult) ? record.xrayResult : []);
  const recordGas = Array.isArray(record?.gasSensor) ? record.gasSensor[0] : record?.gasSensor;
  const originalImage = activeView?.originalImageUrl || record?.originalImageUrl || record?.xrayImageUrl || previewUrl;
  const annotatedImage = activeView?.annotatedImageUrl || record?.annotatedImageUrl;
  const resultImage = annotatedImage || originalImage;
  const resultBoxes = annotatedImage ? [] : detections;
  const gasHasValue = recordGas?.concentration !== null && recordGas?.concentration !== undefined;
  const gasAlarmLevel = Number(recordGas?.alarmLevel ?? gas?.alarmLevel ?? 0);
  const gasAlarm = recordGas?.alarm ?? gas?.alarm ?? false;
  const gasConnection = recordGas?.connectionStatus ?? gas?.connectionStatus;
  const gasDataAvailable = Boolean(recordGas || gas?.hasReading);
  const gasChannels = Array.isArray(recordGas?.channels) && recordGas.channels.length ? recordGas.channels : (gas?.channels || []);
  const gasUpdatedAt = recordGas?.lastReceivedAt ?? recordGas?.collectedAt ?? gas?.lastReceivedAt;
  const riskLevel = record?.riskLevel;
  const riskReasons = Array.isArray(record?.riskReasons) ? record.riskReasons : [];
  const currentStatus = detectionStage < 0
    ? selectedImage ? '图像已就绪' : '等待新图像'
    : detectionFailed ? `${detectionSteps[detectionStage]?.[0] || '检测'}失败`
      : detectionStage === detectionSteps.length - 1 ? '融合完成'
        : detectionSteps[detectionStage]?.[0] || '处理中';

  return (
    <div className="smart-workbench">
      <form className="workbench-form" onSubmit={handleSubmit} noValidate>
        <div className="workbench-toolbar">
          <div>
            <span className={`live-indicator${submitting ? ' live-indicator--busy' : ''}`}><i />实时融合工作台</span>
            <h1>智能安检工作台</h1>
          </div>
          <div className="workbench-toolbar-actions">
            <span className="current-stage" aria-live="polite"><i />当前状态：<strong>{currentStatus}</strong></span>
            <button type="button" className="button button--secondary button--small" onClick={loadServiceStatus} disabled={statusLoading}>{statusLoading && <Spinner small />}{statusLoading ? '刷新中…' : '刷新状态'}</button>
          </div>
        </div>

        {statusError && <div className="form-error" role="alert"><span>!</span>{statusError}</div>}
        {serverError && <div className="form-error" role="alert"><span>!</span>{serverError}</div>}
        {notice && <div className="notice notice--success" role="status">{notice}<button type="button" onClick={() => setNotice('')}>×</button></div>}

        <div className="workbench-grid">
          <div className="workbench-vision-column">
            <section className="workbench-panel workbench-image-panel">
              <header className="workbench-panel-header">
                <div><span className="panel-symbol">▧</span><h2>X 光原始图像</h2></div>
                <span className="package-chip">包裹编号：<strong>{form.packageId || '待设置'}</strong></span>
              </header>
              <div
                className={`workbench-image-stage${dragActive ? ' workbench-image-stage--dragging' : ''}`}
                role="button"
                tabIndex={submitting ? -1 : 0}
                aria-label={originalImage ? '更换安检图片' : '选择或拖拽安检图片'}
                onClick={() => !submitting && !record && fileInputRef.current?.click()}
                onKeyDown={(event) => { if (!submitting && !record && ['Enter', ' '].includes(event.key)) fileInputRef.current?.click(); }}
                onDragEnter={(event) => { event.preventDefault(); if (!submitting && !record) setDragActive(true); }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={() => setDragActive(false)}
                onDrop={(event) => { event.preventDefault(); if (!record) handleDrop(event); }}
              >
                {originalImage ? (
                  <ImageOverlay src={originalImage} alt="当前包裹 X 光原始图像" emptyTitle="暂无原始图片" />
                ) : (
                  <div className="workbench-empty-image">
                    <span>▧</span><strong>等待安检图像</strong><small>点击选择或拖拽 JPG / PNG / BMP / WebP，最大 5 MB</small>
                  </div>
                )}
                {!record && <input ref={fileInputRef} className="upload-input" type="file" accept="image/jpeg,image/png,image/bmp,image/webp" onChange={(event) => selectImage(event.target.files?.[0])} disabled={submitting} />}
                {!record && originalImage && <div className="stage-actions"><button type="button" className="button button--secondary button--small" onClick={(event) => { event.stopPropagation(); fileInputRef.current?.click(); }} disabled={submitting}>更换图像</button><button type="button" className="button button--danger button--small" onClick={(event) => { event.stopPropagation(); clearImage(); }} disabled={submitting}>移除</button></div>}
              </div>
              {selectedImage && !record && <div className="stage-file-meta"><span>{selectedImage.name}</span><span>{(selectedImage.size / 1024 / 1024).toFixed(2)} MB</span><span>{visionMode === 'real' ? 'YOLO 真实检测' : '视觉模拟'}</span></div>}
              {imageViews.length > 1 && <div className="image-view-switcher" aria-label="安检图像视角">{imageViews.map((view) => <button key={view.viewId} type="button" className={Number(view.viewId) === activeViewId ? 'is-active' : ''} onClick={() => setActiveViewId(Number(view.viewId))}>{Number(view.viewId) === 0 ? '主视角' : '侧视角'}</button>)}</div>}
              {record && <dl className="image-source-meta"><div><dt>数据来源</dt><dd>{record.imageSource === 'security_machine' ? '真实安检仪 HTTP' : record.imageSource === 'local' ? '本地监听文件夹' : '本地手动上传'}</dd></div><div><dt>设备 ID</dt><dd>{record.sourceDeviceId || '本地工作台'}</dd></div><div><dt>imgID</dt><dd>{record.sourceImageId || record.packageId}</dd></div><div><dt>图像时间</dt><dd>{formatDateTime(record.imageTime || record.timestamp)}</dd></div></dl>}
              {errors.image && <small className="field-error workbench-field-error">{errors.image}</small>}
            </section>

            <section className="workbench-panel workbench-result-panel">
              <header className="workbench-panel-header">
                <div><span className="panel-symbol">AI</span><h2>AI 违禁品检测结果</h2></div>
                <span className="panel-count">检测目标 {detections.length}</span>
              </header>
              <div className="workbench-result-stage">
                <ImageOverlay src={resultImage} detections={resultBoxes} alt="YOLO 违禁品检测结果" emptyTitle="等待 YOLO 检测" emptyDescription="提交当前图像后显示标注结果" />
                {selectedImage && !record && <span className="result-awaiting">等待开始检测</span>}
              </div>
              <div className="target-summary">
                <div className="target-summary-title"><strong>检测目标摘要（{detections.length}）</strong><span>类别 / 置信度 / 位置</span></div>
                {detections.length ? (
                  <div className="target-table-wrap"><table><thead><tr><th>序号</th><th>类别</th><th>置信度</th><th>位置 (x, y, w, h)</th></tr></thead><tbody>{detections.map((item, index) => <tr key={item._id ?? `${item.className}-${index}`}><td>{index + 1}</td><td>{detectionClassLabel(item.className, item.className || '未知目标')}</td><td className="confidence-cell">{formatPercent(item.confidence, 1)}</td><td className="mono">{[item.bbox?.x, item.bbox?.y, item.bbox?.width, item.bbox?.height].map((value) => formatNumber(value, 2)).join(', ')}</td></tr>)}</tbody></table></div>
                ) : <p className="target-empty">{record ? 'YOLO 未检测到目标，仍需结合气体数据人工复核。' : '等待检测结果…'}</p>}
              </div>
            </section>
          </div>

          <aside className="workbench-sensor-column">
            <section className="workbench-panel gas-status-panel">
              <header className="workbench-panel-header"><div><span className={`status-dot ${gasConnection === 'online' || gasConnection === 'simulation' ? 'status-dot--online' : 'status-dot--danger'}`} /><h2>气体传感器状态</h2></div></header>
              <div className="sensor-status-grid">
                <div><span>连接状态</span><strong className={gasConnection === 'online' || gasConnection === 'simulation' ? 'status-normal' : 'status-danger'}>{connectionNames[gasConnection] || '未连接'}</strong></div>
                <div><span>报警状态</span><strong className={!gasDataAvailable ? '' : gasAlarm ? 'status-warning' : 'status-normal'}>{gasDataAvailable ? gasAlarm ? '已报警' : '正常' : '等待数据'}</strong></div>
                <div><span>设备状态</span><strong className={!gasDataAvailable ? '' : recordGas?.sensorStatus === 'fault' || recordGas?.sensorStatus === 'offline' ? 'status-danger' : 'status-normal'}>{!gasDataAvailable ? '等待数据' : recordGas?.sensorStatus === 'fault' ? '故障' : recordGas?.sensorStatus === 'offline' ? '离线' : '正常'}</strong></div>
                <div><span>最后更新时间</span><strong>{formatDateTime(gasUpdatedAt, '设备未提供')}</strong></div>
              </div>
            </section>

            <section className="workbench-panel gas-reading-panel">
              <header className="workbench-panel-header"><div><span className="panel-symbol">⌁</span><h2>实时气体数据</h2></div></header>
              <div className="gas-reading-grid">
                <div className={`gas-primary-value${gasAlarm ? ' gas-primary-value--danger' : ''}`}><span>可燃气体浓度</span>{gasHasValue ? <strong>{formatNumber(recordGas.concentration, 2)} <small>{recordGas.unit || '单位未提供'}</small></strong> : <p>等待气体数据…</p>}</div>
                <div className="gas-levels"><div><span>报警等级</span><strong className={!gasDataAvailable ? '' : gasAlarm ? 'status-warning' : 'status-normal'}>{gasDataAvailable ? alarmLevelNames[gasAlarmLevel] || `${gasAlarmLevel} 级` : '等待数据'}</strong></div><div><span>危险等级</span><strong className={!gasDataAvailable ? '' : gasAlarmLevel >= 2 ? 'status-danger' : gasAlarmLevel === 1 ? 'status-warning' : 'status-normal'}>{gasDataAvailable ? gasAlarmLevel >= 3 ? '高危' : gasAlarmLevel === 2 ? '危险' : gasAlarmLevel === 1 ? '关注' : '正常' : '等待数据'}</strong></div></div>
              </div>
              <div className="channel-strip">
                {gasChannels.length ? gasChannels.map((channel, index) => <div key={channel.channel ?? index} className={channel.connected ? 'channel-item channel-item--online' : 'channel-item'}><span>通道 {channel.channel ?? index + 1}</span><strong>{channel.connected ? channel.alarmText || alarmLevelNames[channel.alarmLevel] || '在线' : '未连接'}</strong></div>) : <p>设备未提供通道明细</p>}
              </div>
            </section>

            <section className="workbench-panel communication-panel">
              <header className="workbench-panel-header"><div><span className="panel-symbol">&lt;/&gt;</span><h2>通信报文</h2></div></header>
              <div className="raw-frame"><span>原始报文</span><code>{rawFrameText(recordGas?.rawFrame ?? gas?.rawFrame)}</code><small>后端未暴露报文字段时不生成模拟报文</small></div>
              <div className="parsed-frame"><strong>解析结果</strong><dl><div><dt>Transport</dt><dd>{gas?.transport || recordGas?.source || '设备未提供'}</dd></div><div><dt>Channels</dt><dd>{gasChannels.length ? `${gasChannels.filter((item) => item.connected).length} / ${gasChannels.length} 在线` : '设备未提供'}</dd></div><div><dt>Alarm Level</dt><dd>{gasDataAvailable ? alarmLevelNames[gasAlarmLevel] || `${gasAlarmLevel} 级` : '设备未提供'}</dd></div><div><dt>Device Status</dt><dd>{gasConnection === 'online' ? '正常' : connectionNames[gasConnection] || '设备未提供'}</dd></div></dl></div>
            </section>
          </aside>
        </div>

        <section className={`workbench-panel risk-assessment risk-assessment--${riskLevel || 'pending'}`}>
          <header className="workbench-panel-header"><div><span className="panel-symbol">◇</span><h2>综合风险研判</h2></div>{recordId && <Link to={`/inspections/${recordId}`}>查看完整检测记录 →</Link>}</header>
          <div className="risk-assessment-grid">
            <div className="risk-level-block"><span>综合风险</span><strong>{riskLabels[riskLevel] || '待研判'}</strong></div>
            <div className="risk-score-block"><span>风险评分</span><strong>{record ? formatNumber(record.riskScore, 0) : '—'} <small>/ 100</small></strong></div>
            <div className="risk-reasons-block"><span>判断依据</span>{riskReasons.length ? <ul>{riskReasons.map((reason, index) => <li key={`${reason}-${index}`}>{reason}</li>)}</ul> : <p>等待 YOLO 与气体数据完成融合；风险结果由后端计算。</p>}</div>
            <div className="risk-action-block"><span>建议处置</span><strong>{record?.reviewSuggestion || '完成检测后给出处置建议'}</strong><small>所有系统结论均需安检人员现场复核</small></div>
            <div className="risk-controls">
              {record ? <button type="button" className="button button--secondary" onClick={startNextInspection}>下一件包裹</button> : <button className="button button--primary button--large" type="submit" disabled={submitting}>{submitting && <Spinner small />}{submitting ? '智能检测进行中…' : '开始智能检测'}</button>}
            </div>
          </div>
        </section>

        {advancedOpen && <div className="settings-backdrop" role="presentation" onMouseDown={closeAdvanced}>
          <aside className="advanced-settings" role="dialog" aria-modal="true" aria-labelledby="advanced-settings-title" onMouseDown={(event) => event.stopPropagation()}>
            <header className="advanced-settings-header"><div><span>系统管理</span><h2 id="advanced-settings-title">高级设置</h2><p>服务详情、数据来源和调试参数</p></div><button type="button" className="settings-close" aria-label="关闭高级设置" onClick={closeAdvanced}>×</button></header>
            <div className="advanced-links"><Link to="/overview" onClick={closeAdvanced}>运行总览</Link><Link to="/alarms" onClick={closeAdvanced}>报警中心</Link><Link to="/devices" onClick={closeAdvanced}>设备管理</Link></div>

            <section className="settings-section"><div className="settings-section-title"><h3>服务详细状态</h3><span>更新于 {formatDateTime(serviceStatus?.timestamp, statusLoading ? '检查中…' : '设备未提供')}</span></div><div className="service-status-grid service-status-grid--settings">
              <ServiceStatusCard title="YOLO 服务" tone={yoloTone} value={statusLoading && !yolo ? '检查中' : connectionNames[yolo?.status] || '离线'}><dl><div><dt>模型状态</dt><dd>{yolo?.modelLoaded ? '已加载' : '未加载'}</dd></div><div><dt>计算设备</dt><dd>{yolo?.device ? String(yolo.device).toUpperCase() : '设备未提供'}</dd></div></dl>{yolo?.error && <p className="service-status-error">{yolo.error}</p>}</ServiceStatusCard>
              <ServiceStatusCard title="气体通信" tone={gasTone} value={statusLoading && !gas ? '检查中' : connectionNames[gas?.connectionStatus] || '未知'}><dl><div><dt>最后接收</dt><dd>{formatDateTime(gas?.lastReceivedAt, '设备未提供')}</dd></div><div><dt>通道</dt><dd>{gasChannels.length ? `${gasChannels.filter((item) => item.connected).length}/${gasChannels.length} 在线` : '设备未提供'}</dd></div></dl>{gasOnline && <button type="button" className="button button--secondary button--small button--full" onClick={handleClearAlarm} disabled={clearingAlarm}>{clearingAlarm && <Spinner small />}{clearingAlarm ? '正在发送…' : gas?.alarm ? '解除当前报警' : '发送解除报警命令'}</button>}</ServiceStatusCard>
              <ServiceStatusCard title="MongoDB" tone={databaseTone} value={statusLoading && !database ? '检查中' : databaseOnline ? '正常' : '异常'}><dl><div><dt>连接状态</dt><dd>{connectionNames[database?.status] || database?.status || '设备未提供'}</dd></div><div><dt>记录保存</dt><dd>{databaseOnline ? '可用' : '不可用'}</dd></div></dl></ServiceStatusCard>
            </div></section>

            <section className="settings-section"><div className="settings-section-title"><h3>包裹与关联设备</h3></div><div className="form-grid form-grid--2"><label className="field"><span>包裹编号 <em>*</em></span><input value={form.packageId} onChange={(event) => update('packageId', event.target.value)} disabled={submitting || Boolean(record)} />{errors.packageId && <small className="field-error">{errors.packageId}</small>}</label><label className="field"><span>检测时间 <em>*</em></span><input type="datetime-local" value={form.timestamp} onChange={(event) => update('timestamp', event.target.value)} disabled={submitting || Boolean(record)} />{errors.timestamp && <small className="field-error">{errors.timestamp}</small>}</label><label className="field settings-span-2"><span>关联设备</span><select value={form.deviceId} onChange={(event) => update('deviceId', event.target.value)} disabled={submitting || Boolean(record)}><option value="">不关联业务设备</option>{devices.map((device) => <option key={device._id} value={device._id}>{device.deviceName || device.deviceCode} · {device.location || '未设置位置'}</option>)}</select></label></div></section>

            <section className="settings-section"><div className="settings-section-title"><h3>数据来源配置</h3><span>视觉和气体来源保持解耦</span></div><div className="mode-grid"><fieldset className="mode-group"><legend>视觉数据</legend><label className={`mode-option${visionMode === 'real' ? ' mode-option--selected' : ''}`}><input type="radio" name="visionMode" value="real" checked={visionMode === 'real'} onChange={() => setVisionMode('real')} disabled={submitting || Boolean(record)} /><span><strong>YOLO 真实检测</strong><small>上传图片并调用本地模型服务</small></span></label><label className={`mode-option${visionMode === 'simulation' ? ' mode-option--selected' : ''}`}><input type="radio" name="visionMode" value="simulation" checked={visionMode === 'simulation'} onChange={() => setVisionMode('simulation')} disabled={submitting || Boolean(record)} /><span><strong>视觉模拟数据</strong><small>保留演示目标框录入能力</small></span></label></fieldset><fieldset className="mode-group"><legend>气体数据</legend><label className={`mode-option${gasMode === 'device' ? ' mode-option--selected' : ''}`}><input type="radio" name="gasMode" value="device" checked={gasMode === 'device'} onChange={() => setGasMode('device')} disabled={submitting || Boolean(record)} /><span><strong>通信设备数据</strong><small>读取后端最新气体通信数据</small></span></label><label className={`mode-option${gasMode === 'simulation' ? ' mode-option--selected' : ''}`}><input type="radio" name="gasMode" value="simulation" checked={gasMode === 'simulation'} onChange={() => setGasMode('simulation')} disabled={submitting || Boolean(record)} /><span><strong>气体模拟数据</strong><small>手动输入演示数据</small></span></label></fieldset></div>{!statusLoading && visionMode === 'real' && !yoloReady && <div className="mode-warning">YOLO 服务不可用或模型未加载，可切换视觉模拟数据。</div>}{!statusLoading && gasMode === 'device' && !gasOnline && <div className="mode-warning">气体通信当前离线，可切换气体模拟数据，或继续由后端记录数据不完整。</div>}</section>

            {visionMode === 'simulation' && <section className="settings-section"><div className="settings-section-title"><h3>视觉模拟参数</h3></div><div className="form-grid form-grid--2"><label className="field"><span>目标类别</span><input value={form.className} onChange={(event) => update('className', event.target.value)} placeholder="例如 lighter；留空表示无目标" disabled={submitting || Boolean(record)} /></label><label className="field"><span>置信度（0–1）</span><input type="number" min="0" max="1" step="0.01" value={form.confidence} onChange={(event) => update('confidence', event.target.value)} disabled={submitting || Boolean(record)} />{errors.confidence && <small className="field-error">{errors.confidence}</small>}</label></div><div className="bbox-grid"><label className="field"><span>X</span><input type="number" min="0" max="1" step="0.01" value={form.bboxX} onChange={(event) => update('bboxX', event.target.value)} disabled={submitting || Boolean(record)} /></label><label className="field"><span>Y</span><input type="number" min="0" max="1" step="0.01" value={form.bboxY} onChange={(event) => update('bboxY', event.target.value)} disabled={submitting || Boolean(record)} /></label><label className="field"><span>宽度</span><input type="number" min="0" max="1" step="0.01" value={form.bboxWidth} onChange={(event) => update('bboxWidth', event.target.value)} disabled={submitting || Boolean(record)} /></label><label className="field"><span>高度</span><input type="number" min="0" max="1" step="0.01" value={form.bboxHeight} onChange={(event) => update('bboxHeight', event.target.value)} disabled={submitting || Boolean(record)} /></label></div>{errors.bbox && <small className="field-error">{errors.bbox}</small>}</section>}

            {gasMode === 'simulation' && <section className="settings-section"><div className="settings-section-title"><h3>气体模拟参数</h3><button type="button" className="button button--secondary button--small" onClick={generateGasSimulation} disabled={submitting || Boolean(record)}>生成模拟数据</button></div><div className="form-grid form-grid--2"><label className="field"><span>气体类型</span><input value={form.gasType} onChange={(event) => update('gasType', event.target.value)} disabled={submitting || Boolean(record)} />{errors.gasType && <small className="field-error">{errors.gasType}</small>}</label><label className="field"><span>浓度</span><input type="number" min="0" step="0.01" value={form.concentration} onChange={(event) => update('concentration', event.target.value)} disabled={submitting || Boolean(record)} />{errors.concentration && <small className="field-error">{errors.concentration}</small>}</label><label className="field"><span>单位</span><select value={form.unit} onChange={(event) => update('unit', event.target.value)} disabled={submitting || Boolean(record)}><option value="ppm">ppm</option><option value="mg/m³">mg/m³</option><option value="%LEL">%LEL</option></select></label><label className="field"><span>变化趋势</span><select value={form.trend} onChange={(event) => update('trend', event.target.value)} disabled={submitting || Boolean(record)}><option value="stable">稳定</option><option value="rising">上升</option><option value="falling">下降</option><option value="unknown">未知</option></select></label><label className="field"><span>传感器状态</span><select value={form.sensorStatus} onChange={(event) => update('sensorStatus', event.target.value)} disabled={submitting || Boolean(record)}><option value="online">正常在线</option><option value="calibrating">校准中</option><option value="offline">离线</option><option value="fault">故障</option></select></label><label className="checkbox checkbox--card"><input type="checkbox" checked={form.gasAlarm} onChange={(event) => update('gasAlarm', event.target.checked)} disabled={submitting || Boolean(record)} /><span><strong>气体报警</strong><small>仅用于模拟传感器输入</small></span></label></div></section>}

            <section className="settings-section settings-risk-note"><label className="checkbox"><input type="checkbox" checked readOnly /><span><strong>由服务端自动计算最终风险</strong><small>前端不会提交或覆盖 riskLevel、riskScore 和 riskReasons。</small></span></label></section>
          </aside>
        </div>}
      </form>
    </div>
  );
}
