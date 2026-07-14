import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { detectionApi } from '../api/detectionApi.js';
import { deviceApi } from '../api/deviceApi.js';
import PageHeader from '../components/PageHeader.jsx';
import { InlineNotice, Spinner } from '../components/StateViews.jsx';
import { formatDateTime, normalizeList, objectId, toDateTimeLocal } from '../utils/formatters.js';

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

const initialForm = {
  packageId: '',
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

function stepState(index, currentStep, failed) {
  if (currentStep < 0) return 'pending';
  if (failed) {
    if (index < currentStep) return 'complete';
    return index === currentStep ? 'error' : 'pending';
  }
  if (index < currentStep || currentStep === detectionSteps.length - 1) return 'complete';
  return index === currentStep ? 'active' : 'pending';
}

export default function NewInspectionPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const [form, setForm] = useState(initialForm);
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
  const [clearingAlarm, setClearingAlarm] = useState(false);

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
      setDetectionStage(detectionSteps.length - 1);
      const id = objectId(result?.inspection ?? result);
      navigate(id ? `/inspections/${id}` : '/inspections', {
        replace: true,
        state: { created: true, smartDetection: true },
      });
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

  return (
    <div>
      <PageHeader
        title="智能检测"
        description="上传安检图像，独立选择视觉与气体来源，并由后端完成融合判断和保存"
        actions={<><button type="button" className="button button--secondary" onClick={loadServiceStatus} disabled={statusLoading}>{statusLoading && <Spinner small />}{statusLoading ? '检查中…' : '刷新服务状态'}</button><Link to="/inspections" className="button button--ghost">← 返回记录</Link></>}
      />

      <InlineNotice type="warning"><strong>辅助决策说明：</strong>真实或模拟检测结果均需由安检人员结合现场情况复核，系统结论不替代人工判断。</InlineNotice>
      {statusError && <div className="form-error" role="alert"><span>!</span>{statusError}</div>}
      {serverError && <div className="form-error" role="alert"><span>!</span>{serverError}</div>}
      {notice && <div className="notice notice--success" role="status">{notice}<button type="button" onClick={() => setNotice('')}>×</button></div>}
      {detectionResult && <div className="notice notice--success" role="status">检测已完成，正在打开结果详情。</div>}

      <section className="panel integration-status-panel">
        <div className="panel-header">
          <div><h2>接入服务状态</h2><p>页面会每 15 秒刷新；服务离线时可在下方切换对应模拟模式</p></div>
          <span className="panel-count">更新于 {formatDateTime(serviceStatus?.timestamp, statusLoading ? '检查中…' : '设备未提供')}</span>
        </div>
        <div className="service-status-grid">
          <ServiceStatusCard title="YOLO 服务" tone={yoloTone} value={statusLoading && !yolo ? '检查中' : connectionNames[yolo?.status] || '离线'}>
            <dl><div><dt>模型状态</dt><dd>{yolo?.modelLoaded ? '已加载' : '未加载'}</dd></div><div><dt>计算设备</dt><dd>{yolo?.device ? String(yolo.device).toUpperCase() : '设备未提供'}</dd></div></dl>
            {yolo?.error && <p className="service-status-error">{yolo.error}</p>}
          </ServiceStatusCard>
          <ServiceStatusCard
            title="气体通信"
            tone={gasTone}
            value={statusLoading && !gas ? '检查中' : connectionNames[gas?.connectionStatus] || '未知'}
            action={gasOnline && <button type="button" className="button button--secondary button--small button--full" onClick={handleClearAlarm} disabled={clearingAlarm}>{clearingAlarm && <Spinner small />}{clearingAlarm ? '正在发送…' : gas?.alarm ? '解除当前报警' : '发送解除报警命令'}</button>}
          >
            <dl><div><dt>最后接收</dt><dd>{formatDateTime(gas?.lastReceivedAt, '设备未提供')}</dd></div><div><dt>通道</dt><dd>{Array.isArray(gas?.channels) && gas.channels.length ? `${gas.channels.filter((item) => item.connected).length}/${gas.channels.length} 在线` : '设备未提供'}</dd></div></dl>
          </ServiceStatusCard>
          <ServiceStatusCard title="MongoDB" tone={databaseTone} value={statusLoading && !database ? '检查中' : databaseOnline ? '正常' : '异常'}>
            <dl><div><dt>连接状态</dt><dd>{connectionNames[database?.status] || database?.status || '设备未提供'}</dd></div><div><dt>记录保存</dt><dd>{databaseOnline ? '可用' : '不可用'}</dd></div></dl>
          </ServiceStatusCard>
        </div>
      </section>

      <form className="record-form" onSubmit={handleSubmit} noValidate>
        <section className="panel form-section">
          <div className="panel-header"><div><h2>基础信息</h2><p>包裹编号需要保持唯一</p></div></div>
          <div className="form-grid form-grid--3">
            <label className="field"><span>包裹编号 <em>*</em></span><input value={form.packageId} onChange={(event) => update('packageId', event.target.value)} placeholder="例如 PKG-20260714-001" disabled={submitting} />{errors.packageId && <small className="field-error">{errors.packageId}</small>}</label>
            <label className="field"><span>检测时间 <em>*</em></span><input type="datetime-local" value={form.timestamp} onChange={(event) => update('timestamp', event.target.value)} disabled={submitting} />{errors.timestamp && <small className="field-error">{errors.timestamp}</small>}</label>
            <label className="field"><span>关联设备</span><select value={form.deviceId} onChange={(event) => update('deviceId', event.target.value)} disabled={submitting}><option value="">不关联业务设备</option>{devices.map((device) => <option key={device._id} value={device._id}>{device.deviceName || device.deviceCode} · {device.location || '未设置位置'}</option>)}</select></label>
          </div>
        </section>

        <section className="panel form-section">
          <div className="panel-header"><div><h2>数据来源模式</h2><p>视觉和气体来源互不绑定，可按现场服务状态组合</p></div></div>
          <div className="mode-grid">
            <fieldset className="mode-group">
              <legend>视觉数据</legend>
              <label className={`mode-option${visionMode === 'real' ? ' mode-option--selected' : ''}`}><input type="radio" name="visionMode" value="real" checked={visionMode === 'real'} onChange={() => setVisionMode('real')} disabled={submitting} /><span><strong>YOLO 真实检测</strong><small>上传图片并调用本地 Python 模型服务</small></span></label>
              <label className={`mode-option${visionMode === 'simulation' ? ' mode-option--selected' : ''}`}><input type="radio" name="visionMode" value="simulation" checked={visionMode === 'simulation'} onChange={() => setVisionMode('simulation')} disabled={submitting} /><span><strong>视觉模拟数据</strong><small>保留原有演示目标框录入能力</small></span></label>
            </fieldset>
            <fieldset className="mode-group">
              <legend>气体数据</legend>
              <label className={`mode-option${gasMode === 'device' ? ' mode-option--selected' : ''}`}><input type="radio" name="gasMode" value="device" checked={gasMode === 'device'} onChange={() => setGasMode('device')} disabled={submitting} /><span><strong>通信设备数据</strong><small>读取后端收到的最新气体通信帧</small></span></label>
              <label className={`mode-option${gasMode === 'simulation' ? ' mode-option--selected' : ''}`}><input type="radio" name="gasMode" value="simulation" checked={gasMode === 'simulation'} onChange={() => setGasMode('simulation')} disabled={submitting} /><span><strong>气体模拟数据</strong><small>手动输入或随机生成演示数据</small></span></label>
            </fieldset>
          </div>
          {!statusLoading && visionMode === 'real' && !yoloReady && <div className="mode-warning">YOLO 服务当前不可用或模型未加载；可切换“视觉模拟数据”继续演示。</div>}
          {!statusLoading && gasMode === 'device' && !gasOnline && <div className="mode-warning">气体通信当前{gas?.connectionStatus === 'timeout' ? '已超时' : '离线'}；可切换“气体模拟数据”，或继续提交并由系统记录数据不完整。</div>}
        </section>

        <section className="panel form-section">
          <div className="panel-header"><div><h2>{visionMode === 'real' ? '安检图像上传' : '视觉模拟检测'}</h2><p>{visionMode === 'real' ? '图片将交由 YOLO 服务执行目标检测' : '图片可选，并可录入一个模拟目标框'}</p></div></div>
          <div className="upload-layout">
            <div
              className={`upload-box${previewUrl ? ' upload-box--preview' : ''}${dragActive ? ' upload-box--dragging' : ''}`}
              role="button"
              tabIndex={submitting ? -1 : 0}
              aria-label={previewUrl ? '已选择图片' : '选择或拖拽安检图片'}
              onClick={() => !submitting && !previewUrl && fileInputRef.current?.click()}
              onKeyDown={(event) => { if (!submitting && !previewUrl && ['Enter', ' '].includes(event.key)) fileInputRef.current?.click(); }}
              onDragEnter={(event) => { event.preventDefault(); if (!submitting) setDragActive(true); }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
            >
              {previewUrl ? <><img src={previewUrl} alt="待检测安检图片预览" /><div className="upload-preview-actions"><button type="button" className="button button--secondary button--small" onClick={(event) => { event.stopPropagation(); if (fileInputRef.current) { fileInputRef.current.value = ''; fileInputRef.current.click(); } }} disabled={submitting}>重新选择</button><button type="button" className="button button--danger button--small" onClick={(event) => { event.stopPropagation(); clearImage(); }} disabled={submitting}>删除图片</button></div></> : <><span>▧</span><strong>点击选择或拖拽图片</strong><small>JPG / PNG / BMP / WebP，最大 5 MB</small></>}
              <input ref={fileInputRef} className="upload-input" type="file" accept="image/jpeg,image/png,image/bmp,image/webp" onChange={(event) => selectImage(event.target.files?.[0])} disabled={submitting} />
            </div>
            <div className="upload-fields">
              {selectedImage && <dl className="file-summary"><div><dt>文件名</dt><dd>{selectedImage.name}</dd></div><div><dt>大小</dt><dd>{(selectedImage.size / 1024 / 1024).toFixed(2)} MB</dd></div><div><dt>检测方式</dt><dd>{visionMode === 'real' ? 'YOLO 真实检测' : '视觉模拟数据'}</dd></div></dl>}
              {errors.image && <small className="field-error">{errors.image}</small>}
              {visionMode === 'simulation' && <>
                <div className="form-grid form-grid--2">
                  <label className="field"><span>目标类别</span><input value={form.className} onChange={(event) => update('className', event.target.value)} placeholder="例如 lighter；留空表示无目标" disabled={submitting} /></label>
                  <label className="field"><span>置信度（0–1）</span><input type="number" min="0" max="1" step="0.01" value={form.confidence} onChange={(event) => update('confidence', event.target.value)} disabled={submitting} />{errors.confidence && <small className="field-error">{errors.confidence}</small>}</label>
                </div>
                <div className="bbox-grid">
                  <label className="field"><span>X</span><input type="number" min="0" max="1" step="0.01" value={form.bboxX} onChange={(event) => update('bboxX', event.target.value)} disabled={submitting} /></label>
                  <label className="field"><span>Y</span><input type="number" min="0" max="1" step="0.01" value={form.bboxY} onChange={(event) => update('bboxY', event.target.value)} disabled={submitting} /></label>
                  <label className="field"><span>宽度</span><input type="number" min="0" max="1" step="0.01" value={form.bboxWidth} onChange={(event) => update('bboxWidth', event.target.value)} disabled={submitting} /></label>
                  <label className="field"><span>高度</span><input type="number" min="0" max="1" step="0.01" value={form.bboxHeight} onChange={(event) => update('bboxHeight', event.target.value)} disabled={submitting} /></label>
                </div>
                {errors.bbox && <small className="field-error">{errors.bbox}</small>}
              </>}
              {visionMode === 'real' && !selectedImage && <div className="upload-hint"><strong>等待选择图片</strong><p>真实模式下图片为必填；模型离线时图片不会丢失，可直接切换视觉模拟模式。</p></div>}
            </div>
          </div>
        </section>

        <section className="panel form-section">
          <div className="panel-header"><div><h2>{gasMode === 'device' ? '气体通信数据' : '气体模拟数据'}</h2><p>{gasMode === 'device' ? '检测时读取后端收到的最新通信状态' : '报警、浓度与趋势应保持基本逻辑一致'}</p></div>{gasMode === 'simulation' && <button type="button" className="button button--secondary button--small" onClick={generateGasSimulation} disabled={submitting}>生成模拟气体数据</button>}</div>
          {gasMode === 'device' ? (
            <div className={`device-reading-summary device-reading-summary--${gasOnline ? 'online' : 'offline'}`}><span className="service-status-dot" /><div><strong>{connectionNames[gas?.connectionStatus] || '未知状态'}</strong><p>最后接收：{formatDateTime(gas?.lastReceivedAt, '设备未提供')} · 当前报警：{gas?.alarm ? `${gas.alarmLevel || 1} 级` : '未报警'}</p></div></div>
          ) : (
            <div className="form-grid form-grid--3">
              <label className="field"><span>气体类型</span><input value={form.gasType} onChange={(event) => update('gasType', event.target.value)} disabled={submitting} />{errors.gasType && <small className="field-error">{errors.gasType}</small>}</label>
              <label className="field"><span>浓度</span><input type="number" min="0" step="0.01" value={form.concentration} onChange={(event) => update('concentration', event.target.value)} disabled={submitting} />{errors.concentration && <small className="field-error">{errors.concentration}</small>}</label>
              <label className="field"><span>单位</span><select value={form.unit} onChange={(event) => update('unit', event.target.value)} disabled={submitting}><option value="ppm">ppm</option><option value="mg/m³">mg/m³</option><option value="%LEL">%LEL</option></select></label>
              <label className="field"><span>变化趋势</span><select value={form.trend} onChange={(event) => update('trend', event.target.value)} disabled={submitting}><option value="stable">稳定</option><option value="rising">上升</option><option value="falling">下降</option><option value="unknown">未知</option></select></label>
              <label className="field"><span>传感器状态</span><select value={form.sensorStatus} onChange={(event) => update('sensorStatus', event.target.value)} disabled={submitting}><option value="online">正常在线</option><option value="calibrating">校准中</option><option value="offline">离线</option><option value="fault">故障</option></select></label>
              <label className="checkbox checkbox--card"><input type="checkbox" checked={form.gasAlarm} onChange={(event) => update('gasAlarm', event.target.checked)} disabled={submitting} /><span><strong>气体报警</strong><small>表示模拟传感器已触发阈值</small></span></label>
            </div>
          )}
        </section>

        <section className="panel detection-progress-panel" aria-live="polite">
          <div className="panel-header"><div><h2>检测阶段</h2><p>{detectionStage < 0 ? '准备就绪，点击开始后将显示处理进度' : detectionFailed ? '检测中断，请根据上方错误处理后重试' : detectionStage === detectionSteps.length - 1 ? '全部阶段已完成' : '请求处理中，请勿重复提交'}</p></div></div>
          <ol className="detection-steps">
            {detectionSteps.map(([title, description], index) => {
              const state = stepState(index, detectionStage, detectionFailed);
              return <li key={title} className={`detection-step detection-step--${state}`}><span>{state === 'complete' ? '✓' : state === 'error' ? '!' : index + 1}</span><div><strong>{title}</strong><small>{description}</small></div>{state === 'active' && <Spinner small />}</li>;
            })}
          </ol>
        </section>

        <section className="calculation-box">
          <label className="checkbox"><input type="checkbox" checked readOnly /><span><strong>由服务端自动计算最终风险</strong><small>前端不会提交或覆盖 riskLevel、riskScore 和 riskReasons。</small></span></label>
          <div className="form-submit"><Link className="button button--ghost" to="/inspections">取消</Link><button className="button button--primary button--large" type="submit" disabled={submitting}>{submitting && <Spinner small />}{submitting ? '智能检测进行中…' : '开始智能检测'}</button></div>
        </section>
      </form>
    </div>
  );
}
