import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { deviceApi } from '../api/deviceApi.js';
import { inspectionApi } from '../api/inspectionApi.js';
import { uploadApi } from '../api/simulationApi.js';
import PageHeader from '../components/PageHeader.jsx';
import { InlineNotice, Spinner } from '../components/StateViews.jsx';
import { normalizeList, objectId, toDateTimeLocal } from '../utils/formatters.js';

const initialForm = {
  packageId: '', timestamp: toDateTimeLocal(), deviceId: '', className: '', confidence: '0.80',
  bboxX: '0.2', bboxY: '0.2', bboxWidth: '0.3', bboxHeight: '0.3', gasType: '可燃气体',
  concentration: '0', unit: 'ppm', gasAlarm: false, trend: 'stable', sensorStatus: 'online',
};

export default function NewInspectionPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState(initialForm);
  const [devices, setDevices] = useState([]);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    deviceApi.list({ pageSize: 100 }).then((payload) => setDevices(normalizeList(payload))).catch(() => setDevices([]));
  }, []);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const update = (name, value) => setForm((current) => ({ ...current, [name]: value }));

  const handleFile = (event) => {
    const selected = event.target.files?.[0] || null;
    setErrors((current) => ({ ...current, image: '' }));
    if (!selected) { setFile(null); setPreview(''); return; }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(selected.type)) {
      setErrors((current) => ({ ...current, image: '仅支持 JPG、PNG 或 WebP 图片。' }));
      event.target.value = '';
      return;
    }
    if (selected.size > 5 * 1024 * 1024) {
      setErrors((current) => ({ ...current, image: '图片不能超过 5 MB。' }));
      event.target.value = '';
      return;
    }
    if (preview) URL.revokeObjectURL(preview);
    setFile(selected);
    setPreview(URL.createObjectURL(selected));
  };

  const validate = () => {
    const next = {};
    if (!form.packageId.trim()) next.packageId = '包裹编号为必填项。';
    if (!form.timestamp || Number.isNaN(new Date(form.timestamp).getTime())) next.timestamp = '请选择有效检测时间。';
    const confidence = Number(form.confidence);
    if (form.className.trim() && (!Number.isFinite(confidence) || confidence < 0 || confidence > 1)) next.confidence = '置信度必须在 0 到 1 之间。';
    const concentration = Number(form.concentration);
    if (!Number.isFinite(concentration) || concentration < 0) next.concentration = '浓度必须是非负数字。';
    ['bboxX', 'bboxY', 'bboxWidth', 'bboxHeight'].forEach((key) => {
      const value = Number(form[key]);
      if (form.className.trim() && (!Number.isFinite(value) || value < 0 || value > 1)) next.bbox = '演示框坐标需使用 0 到 1 的归一化数值。';
    });
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    setServerError('');
    try {
      let xrayImageUrl = '';
      if (file) {
        const uploaded = await uploadApi.xray(file);
        xrayImageUrl = uploaded?.url || uploaded?.path || '';
      }
      const xrayResult = form.className.trim() ? [{
        className: form.className.trim(), confidence: Number(form.confidence),
        bbox: { x: Number(form.bboxX), y: Number(form.bboxY), width: Number(form.bboxWidth), height: Number(form.bboxHeight) },
        modelName: 'mock-yolo-adapter', modelVersion: '1.0-demo',
      }] : [];
      const payload = {
        packageId: form.packageId.trim(),
        timestamp: new Date(form.timestamp).toISOString(),
        deviceId: form.deviceId || undefined,
        xrayImageUrl: xrayImageUrl || undefined,
        xrayResult,
        gasSensor: {
          gasType: form.gasType.trim(), concentration: Number(form.concentration), unit: form.unit,
          alarm: form.gasAlarm, trend: form.trend, sensorStatus: form.sensorStatus,
          collectedAt: new Date(form.timestamp).toISOString(),
        },
        source: 'simulation',
      };
      const created = await inspectionApi.create(payload);
      const id = objectId(created?.inspection ?? created);
      navigate(id ? `/inspections/${id}` : '/inspections', { replace: true, state: { created: true } });
    } catch (error) {
      setServerError(error.message || '提交失败，请稍后重试。');
      if (Array.isArray(error.details)) {
        const details = error.details.map((item) => item.message || item).filter(Boolean).join('；');
        if (details) setServerError(`${error.message}：${details}`);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <PageHeader title="新增模拟检测记录" description="录入模拟 X 光和气体数据，最终风险等级由服务端规则统一计算" actions={<Link to="/inspections" className="button button--ghost">← 返回记录</Link>} />
      <InlineNotice type="warning"><strong>模拟数据说明：</strong>此表单不连接真实 YOLO 模型或传感器，提交结果仅用于软件功能演示，不能用于真实安检判断。</InlineNotice>
      {serverError && <div className="form-error" role="alert"><span>!</span>{serverError}</div>}
      <form className="record-form" onSubmit={handleSubmit} noValidate>
        <section className="panel form-section">
          <div className="panel-header"><div><h2>基础信息</h2><p>包裹编号需要保持唯一</p></div></div>
          <div className="form-grid form-grid--3">
            <label className="field"><span>包裹编号 <em>*</em></span><input value={form.packageId} onChange={(event) => update('packageId', event.target.value)} placeholder="例如 PKG-20260711-001" />{errors.packageId && <small className="field-error">{errors.packageId}</small>}</label>
            <label className="field"><span>检测时间 <em>*</em></span><input type="datetime-local" value={form.timestamp} onChange={(event) => update('timestamp', event.target.value)} />{errors.timestamp && <small className="field-error">{errors.timestamp}</small>}</label>
            <label className="field"><span>关联设备</span><select value={form.deviceId} onChange={(event) => update('deviceId', event.target.value)}><option value="">不关联设备</option>{devices.map((device) => <option key={device._id} value={device._id}>{device.deviceName || device.deviceCode} · {device.location || '未设置位置'}</option>)}</select></label>
          </div>
        </section>

        <section className="panel form-section">
          <div className="panel-header"><div><h2>模拟 X 光检测</h2><p>可上传演示图片并录入一个模拟目标框</p></div></div>
          <div className="upload-layout">
            <label className={`upload-box${preview ? ' upload-box--preview' : ''}`}>
              {preview ? <img src={preview} alt="待上传 X 光图片预览" /> : <><span>▧</span><strong>选择演示图片</strong><small>JPG / PNG / WebP，最大 5 MB</small></>}
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFile} />
            </label>
            <div className="upload-fields">
              {errors.image && <small className="field-error">{errors.image}</small>}
              <div className="form-grid form-grid--2">
                <label className="field"><span>目标类别</span><input value={form.className} onChange={(event) => update('className', event.target.value)} placeholder="例如 lighter；留空表示无目标" /></label>
                <label className="field"><span>置信度（0–1）</span><input type="number" min="0" max="1" step="0.01" value={form.confidence} onChange={(event) => update('confidence', event.target.value)} />{errors.confidence && <small className="field-error">{errors.confidence}</small>}</label>
              </div>
              <div className="bbox-grid">
                <label className="field"><span>X</span><input type="number" min="0" max="1" step="0.01" value={form.bboxX} onChange={(event) => update('bboxX', event.target.value)} /></label>
                <label className="field"><span>Y</span><input type="number" min="0" max="1" step="0.01" value={form.bboxY} onChange={(event) => update('bboxY', event.target.value)} /></label>
                <label className="field"><span>宽度</span><input type="number" min="0" max="1" step="0.01" value={form.bboxWidth} onChange={(event) => update('bboxWidth', event.target.value)} /></label>
                <label className="field"><span>高度</span><input type="number" min="0" max="1" step="0.01" value={form.bboxHeight} onChange={(event) => update('bboxHeight', event.target.value)} /></label>
              </div>
              {errors.bbox && <small className="field-error">{errors.bbox}</small>}
            </div>
          </div>
        </section>

        <section className="panel form-section">
          <div className="panel-header"><div><h2>模拟气体传感器</h2><p>报警、浓度与趋势应保持基本逻辑一致</p></div></div>
          <div className="form-grid form-grid--3">
            <label className="field"><span>气体类型</span><input value={form.gasType} onChange={(event) => update('gasType', event.target.value)} /></label>
            <label className="field"><span>浓度</span><input type="number" min="0" step="0.01" value={form.concentration} onChange={(event) => update('concentration', event.target.value)} />{errors.concentration && <small className="field-error">{errors.concentration}</small>}</label>
            <label className="field"><span>单位</span><select value={form.unit} onChange={(event) => update('unit', event.target.value)}><option value="ppm">ppm</option><option value="mg/m³">mg/m³</option><option value="%LEL">%LEL</option></select></label>
            <label className="field"><span>变化趋势</span><select value={form.trend} onChange={(event) => update('trend', event.target.value)}><option value="stable">稳定</option><option value="rising">上升</option><option value="falling">下降</option><option value="unknown">未知</option></select></label>
            <label className="field"><span>传感器状态</span><select value={form.sensorStatus} onChange={(event) => update('sensorStatus', event.target.value)}><option value="online">正常在线</option><option value="calibrating">校准中</option><option value="offline">离线</option><option value="fault">故障</option></select></label>
            <label className="checkbox checkbox--card"><input type="checkbox" checked={form.gasAlarm} onChange={(event) => update('gasAlarm', event.target.checked)} /><span><strong>气体报警</strong><small>表示模拟传感器已触发阈值</small></span></label>
          </div>
        </section>

        <section className="calculation-box">
          <label className="checkbox"><input type="checkbox" checked readOnly /><span><strong>由服务端自动计算最终风险</strong><small>前端不会提交或覆盖 riskLevel、riskScore 和 riskReasons。</small></span></label>
          <div className="form-submit"><Link className="button button--ghost" to="/inspections">取消</Link><button className="button button--primary button--large" type="submit" disabled={submitting}>{submitting && <Spinner small />}{submitting ? '正在上传并计算…' : '提交模拟检测'}</button></div>
        </section>
      </form>
    </div>
  );
}
