import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { inspectionApi } from '../api/inspectionApi.js';
import ImageOverlay from '../components/ImageOverlay.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { AlarmStatusBadge, DeviceStatusBadge, InspectionStatusBadge, RiskBadge } from '../components/Badges.jsx';
import { ErrorBlock, LoadingBlock } from '../components/StateViews.jsx';
import {
  detectionClassLabel,
  displayName,
  formatDateTime,
  formatNumber,
  formatPercent,
  resolveAssetUrl,
} from '../utils/formatters.js';

const trendNames = { rising: '上升', falling: '下降', stable: '稳定', unknown: '未知' };
const sensorNames = { online: '正常在线', calibrating: '校准中', offline: '离线', fault: '故障' };
const connectionNames = { online: '在线', offline: '离线', timeout: '通信超时', simulation: '模拟模式' };
const alarmLevelNames = ['无报警', '一级报警', '二级报警', '三级报警'];

function provided(value, fallback = '设备未提供') {
  return value === null || value === undefined || value === '' ? fallback : value;
}

function sourceModeText(visionMode, gasMode, fallback) {
  if (!visionMode && !gasMode) return fallback || '设备未提供';
  const vision = visionMode === 'real' ? '真实 YOLO' : visionMode === 'simulation' ? '视觉模拟' : '视觉来源未提供';
  const gas = gasMode === 'device' ? '通信气体' : gasMode === 'simulation' ? '气体模拟' : '气体来源未提供';
  return `${vision} · ${gas}`;
}

function alarmLevelText(value) {
  if (value === null || value === undefined || value === '') return '设备未提供';
  return alarmLevelNames[Number(value)] || `${value} 级`;
}

export default function InspectionDetailPage() {
  const { id } = useParams();
  const location = useLocation();
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadDetail = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const payload = await inspectionApi.get(id);
      const data = payload.data ?? payload;
      setDetail(data.inspection ? data : { inspection: data, alarm: data.alarm, operationLogs: data.operationLogs || [] });
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, [id]);
  useEffect(() => { loadDetail(); }, [loadDetail]);

  if (loading) return <><PageHeader title="检测详情" /><LoadingBlock label="正在读取检测记录及关联数据…" /></>;
  if (error || !detail?.inspection) return <><PageHeader title="检测详情" actions={<Link className="button button--ghost" to="/inspections">← 返回记录</Link>} /><ErrorBlock message={error || '未找到检测记录'} onRetry={loadDetail} /></>;

  const record = detail.inspection;
  const alarm = detail.alarm ?? record.alarm;
  const logs = detail.operationLogs ?? detail.logs ?? [];
  const gasList = Array.isArray(record.gasSensor) ? record.gasSensor : record.gasSensor ? [record.gasSensor] : [];
  const detections = Array.isArray(record.xrayResult) ? record.xrayResult : [];
  const device = record.deviceId ?? record.device;
  const operator = record.operatorId ?? record.operator;
  const legacySimulation = record.source === 'simulation' || record.source === 'manual-simulation';
  const visionMode = record.sourceMode?.vision ?? (legacySimulation ? 'simulation' : record.serviceStatus?.yolo === 'online' ? 'real' : null);
  const gasMode = record.sourceMode?.gas ?? (legacySimulation ? 'simulation' : record.serviceStatus?.gas && record.serviceStatus.gas !== 'simulation' ? 'device' : null);
  const originalImageUrl = record.originalImageUrl || record.xrayImageUrl;
  const annotatedImageUrl = record.annotatedImageUrl;
  const inferenceTime = record.inferenceTimeMs === null || record.inferenceTimeMs === undefined
    ? '设备未提供'
    : `${formatNumber(record.inferenceTimeMs, 0)} ms`;
  const imageSize = record.imageWidth === null || record.imageWidth === undefined || record.imageHeight === null || record.imageHeight === undefined
    ? '设备未提供'
    : `${formatNumber(record.imageWidth)} × ${formatNumber(record.imageHeight)}`;

  return (
    <div>
      <PageHeader
        title={`检测详情 · ${record.packageId}`}
        description="风险结果由视觉与气体数据在服务端融合计算，必须结合现场情况由安检人员复核"
        actions={<Link className="button button--ghost" to="/inspections">← 返回记录</Link>}
      />
      {location.state?.created && <div className="notice notice--success">{location.state?.smartDetection ? '智能检测已完成，记录和关联报警已按规则保存。' : '检测记录已创建，服务端已完成风险计算。'}</div>}
      {record.isDeleted && <div className="notice notice--warning"><strong>该记录已被逻辑删除。</strong> 删除时间：{formatDateTime(record.deletedAt)}</div>}

      <section className="detail-hero panel">
        <div className="detail-primary"><span>包裹编号</span><h2>{record.packageId}</h2><p>{formatDateTime(record.timestamp)}</p></div>
        <div className="risk-score"><RiskBadge level={record.riskLevel} /><strong>{formatNumber(record.riskScore)}</strong><span>/ 100 风险分</span></div>
        <div className="detail-meta"><div><span>处理状态</span><InspectionStatusBadge status={record.status} /></div><div><span>数据来源</span><strong>{sourceModeText(visionMode, gasMode, record.source)}</strong></div><div><span>操作人员</span><strong>{displayName(operator)}</strong></div></div>
      </section>

      <section className="detail-grid detail-grid--image">
        <article className="panel">
          <div className="panel-header"><div><h2>X 光图像结果</h2><p>同时保留上传原图和 YOLO 服务生成的标注图片</p></div><span className="panel-count">{detections.length} 个目标</span></div>
          <div className="result-image-grid">
            <div className="result-image-item">
              <h3>原始图片与目标框</h3>
              <ImageOverlay src={originalImageUrl} detections={detections} alt="原始安检 X 光图片" emptyTitle="暂无原始图片" emptyDescription="设备未提供原始图片" />
              <small className="image-source-url mono">{provided(originalImageUrl)}</small>
            </div>
            <div className="result-image-item">
              <h3>YOLO 标注图片</h3>
              <ImageOverlay src={annotatedImageUrl} alt="YOLO 标注检测结果图" emptyTitle="暂无标注图片" emptyDescription="设备未提供标注图片" />
              {annotatedImageUrl ? <a className="image-source-url mono" href={resolveAssetUrl(annotatedImageUrl)} target="_blank" rel="noreferrer">{annotatedImageUrl}</a> : <small className="image-source-url mono">设备未提供</small>}
            </div>
          </div>
        </article>
        <article className="panel">
          <div className="panel-header"><div><h2>风险解释</h2><p>由融合规则生成的可解释理由</p></div></div>
          {record.riskReasons?.length ? <ol className="reason-list">{record.riskReasons.map((reason, index) => <li key={`${reason}-${index}`}><span>{index + 1}</span>{reason}</li>)}</ol> : <p className="muted">暂无风险原因，请结合数据完整性人工复核。</p>}
          <div className="review-note"><strong>人工复核提示</strong><p>{record.reviewSuggestion || '请安检人员结合现场情况复核。'} 风险低不等于绝对安全；传感器离线、数据缺失或图像质量异常时，应执行现场复检。</p></div>
        </article>
      </section>

      <section className="detail-grid detail-grid--equal">
        <article className="panel">
          <div className="panel-header"><div><h2>{visionMode === 'real' ? 'YOLO 真实检测结果' : visionMode === 'simulation' ? '视觉模拟结果' : '视觉检测结果'}</h2><p>{visionMode === 'real' ? '来自本地 Python YOLO 模型服务' : visionMode === 'simulation' ? '来自保留的演示目标框数据' : '旧记录未提供明确视觉来源'}</p></div></div>
          <dl className="vision-run-meta">
            <div><dt>视觉来源</dt><dd>{visionMode === 'real' ? '真实 YOLO' : visionMode === 'simulation' ? '模拟数据' : '设备未提供'}</dd></div>
            <div><dt>服务状态</dt><dd>{connectionNames[record.serviceStatus?.yolo] || provided(record.serviceStatus?.yolo)}</dd></div>
            <div><dt>推理耗时</dt><dd>{inferenceTime}</dd></div>
            <div><dt>图像尺寸</dt><dd>{imageSize}</dd></div>
          </dl>
          {detections.length ? <div className="table-wrap"><table><thead><tr><th>类别标识</th><th>中文名称</th><th>置信度</th><th>检测框 (x, y, w, h)</th><th>模型</th></tr></thead><tbody>{detections.map((item, index) => <tr key={item._id ?? index}><td><strong>{provided(item.className)}</strong></td><td>{detectionClassLabel(item.className, '设备未提供')}</td><td>{formatPercent(item.confidence, 1)}</td><td className="mono">{[item.bbox?.x, item.bbox?.y, item.bbox?.width, item.bbox?.height].map((value) => formatNumber(value, 2)).join(', ')}</td><td>{provided(item.modelName)}<small className="cell-subtitle">{provided(item.modelVersion)}</small></td></tr>)}</tbody></table></div> : <p className="muted">{visionMode === 'real' ? 'YOLO 未检测到目标；系统仍会结合气体数据完成风险判断。' : '本记录未提供模拟目标，或模拟结果为空。'}</p>}
        </article>
        <article className="panel">
          <div className="panel-header"><div><h2>气体传感器</h2><p>{gasMode === 'device' ? '来自气体通信设备的最新有效数据' : gasMode === 'simulation' ? '来自用户输入的气体模拟数据' : '旧记录未提供明确气体来源'}</p></div></div>
          {gasList.length ? <div className="sensor-list">{gasList.map((gas, index) => {
            const channels = Array.isArray(gas.channels) ? gas.channels : [];
            const concentration = gas.concentration === null || gas.concentration === undefined
              ? '设备未提供'
              : `${formatNumber(gas.concentration, 2)} ${gas.unit || '单位未提供'}`;
            return <div className="sensor-card" key={gas._id ?? index}>
              <div><span>{provided(gas.gasType, '未知气体')}</span><strong>{concentration}</strong></div>
              <dl>
                <div><dt>数据来源</dt><dd>{gas.source === 'device' || gasMode === 'device' ? '通信设备' : gas.source === 'simulation' || gasMode === 'simulation' ? '模拟数据' : '设备未提供'}</dd></div>
                <div><dt>通信状态</dt><dd>{connectionNames[gas.connectionStatus] || provided(gas.connectionStatus)}</dd></div>
                <div><dt>报警</dt><dd className={gas.alarm ? 'danger-text' : ''}>{gas.alarm ? '已触发' : '未触发'}</dd></div>
                <div><dt>报警等级</dt><dd className={gas.alarm ? 'danger-text' : ''}>{alarmLevelText(gas.alarmLevel)}</dd></div>
                <div><dt>趋势</dt><dd>{trendNames[gas.trend] || provided(gas.trend)}</dd></div>
                <div><dt>传感器状态</dt><dd>{sensorNames[gas.sensorStatus] || provided(gas.sensorStatus)}</dd></div>
                <div><dt>最后接收</dt><dd>{formatDateTime(gas.lastReceivedAt, '设备未提供')}</dd></div>
                <div><dt>采集时间</dt><dd>{formatDateTime(gas.collectedAt, '设备未提供')}</dd></div>
              </dl>
              <div className="gas-channel-block">
                <strong>通信通道等级</strong>
                {channels.length ? <div className="gas-channel-grid">{channels.map((channel, channelIndex) => <div key={channel.channel ?? channelIndex} className={channel.connected ? 'gas-channel gas-channel--online' : 'gas-channel gas-channel--offline'}><span>通道 {channel.channel ?? channelIndex + 1}</span><strong>{channel.connected ? channel.alarmText || alarmLevelText(channel.alarmLevel) : '未连接'}</strong></div>)}</div> : <p>设备未提供通道明细。</p>}
              </div>
            </div>;
          })}</div> : <p className="muted">设备未提供气体传感器数据，不能据此判定安全。</p>}
        </article>
      </section>

      <section className="detail-grid detail-grid--equal">
        <article className="panel">
          <div className="panel-header"><div><h2>关联设备</h2><p>业务关联设备及最后心跳</p></div></div>
          {device && typeof device === 'object' ? <dl className="description-list"><div><dt>设备编号</dt><dd>{provided(device.deviceCode)}</dd></div><div><dt>设备名称</dt><dd>{provided(device.deviceName)}</dd></div><div><dt>类型 / 位置</dt><dd>{provided(device.deviceType)} · {provided(device.location)}</dd></div><div><dt>状态</dt><dd>{device.status ? <DeviceStatusBadge status={device.status} possiblyOffline={device.possiblyOffline} /> : '设备未提供'}</dd></div><div><dt>最后心跳</dt><dd>{formatDateTime(device.lastHeartbeatAt, '设备未提供')}</dd></div></dl> : <p className="muted">{device ? `设备 ID：${device}` : '未关联业务设备'}</p>}
        </article>
        <article className="panel">
          <div className="panel-header"><div><h2>关联报警</h2><p>高风险记录会自动生成报警</p></div>{alarm && <Link to="/alarms">前往处置</Link>}</div>
          {alarm ? <dl className="description-list"><div><dt>报警标题</dt><dd>{provided(alarm.title)}</dd></div><div><dt>报警级别</dt><dd><RiskBadge level={alarm.level} /></dd></div><div><dt>报警状态</dt><dd><AlarmStatusBadge status={alarm.status} /></dd></div><div><dt>指派给</dt><dd>{displayName(alarm.assignedTo)}</dd></div><div><dt>处置备注</dt><dd>{alarm.handlingNote || '暂无'}</dd></div><div><dt>创建时间</dt><dd>{formatDateTime(alarm.createdAt, '设备未提供')}</dd></div></dl> : <p className="muted">当前记录没有关联报警。</p>}
        </article>
      </section>

      <section className="panel">
        <div className="panel-header"><div><h2>操作日志</h2><p>该记录的关键写操作追踪</p></div><span className="panel-count">{logs.length} 条</span></div>
        {logs.length ? <div className="timeline">{logs.map((log) => <div className="timeline-item" key={log._id}><span className="timeline-dot" /><div><strong>{log.action}</strong><p>{displayName(log.userId, '系统')} · {formatDateTime(log.createdAt)}</p>{log.after && <details><summary>查看变更后快照</summary><pre>{JSON.stringify(log.after, null, 2)}</pre></details>}</div></div>)}</div> : <p className="muted">暂无关联操作日志。</p>}
      </section>
    </div>
  );
}
