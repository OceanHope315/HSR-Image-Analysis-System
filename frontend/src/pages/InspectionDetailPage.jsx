import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { inspectionApi } from '../api/inspectionApi.js';
import ImageOverlay from '../components/ImageOverlay.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { AlarmStatusBadge, DeviceStatusBadge, InspectionStatusBadge, RiskBadge } from '../components/Badges.jsx';
import { ErrorBlock, LoadingBlock } from '../components/StateViews.jsx';
import { displayName, formatDateTime, formatNumber, formatPercent } from '../utils/formatters.js';

const trendNames = { rising: '上升', falling: '下降', stable: '稳定', unknown: '未知' };
const sensorNames = { online: '正常在线', calibrating: '校准中', offline: '离线', fault: '故障' };

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
  const detections = record.xrayResult || [];
  const device = record.deviceId ?? record.device;
  const operator = record.operatorId ?? record.operator;

  return (
    <div>
      <PageHeader
        title={`检测详情 · ${record.packageId}`}
        description="风险结果为规则式模拟计算，必须结合现场情况由安检人员复核"
        actions={<Link className="button button--ghost" to="/inspections">← 返回记录</Link>}
      />
      {location.state?.created && <div className="notice notice--success">模拟检测记录已创建，服务端已完成风险计算。</div>}
      {record.isDeleted && <div className="notice notice--warning"><strong>该记录已被逻辑删除。</strong> 删除时间：{formatDateTime(record.deletedAt)}</div>}

      <section className="detail-hero panel">
        <div className="detail-primary"><span>包裹编号</span><h2>{record.packageId}</h2><p>{formatDateTime(record.timestamp)}</p></div>
        <div className="risk-score"><RiskBadge level={record.riskLevel} /><strong>{formatNumber(record.riskScore)}</strong><span>/ 100 风险分</span></div>
        <div className="detail-meta"><div><span>处理状态</span><InspectionStatusBadge status={record.status} /></div><div><span>数据来源</span><strong>{record.source?.includes('simulation') ? '模拟数据' : record.source || '—'}</strong></div><div><span>操作人员</span><strong>{displayName(operator)}</strong></div></div>
      </section>

      <section className="detail-grid detail-grid--image">
        <article className="panel">
          <div className="panel-header"><div><h2>X 光图像与目标框</h2><p>检测框会按图片原始尺寸或归一化坐标换算</p></div><span className="panel-count">{detections.length} 个目标</span></div>
          <ImageOverlay src={record.xrayImageUrl} detections={detections} />
        </article>
        <article className="panel">
          <div className="panel-header"><div><h2>风险解释</h2><p>由融合规则生成的可解释理由</p></div></div>
          {record.riskReasons?.length ? <ol className="reason-list">{record.riskReasons.map((reason, index) => <li key={`${reason}-${index}`}><span>{index + 1}</span>{reason}</li>)}</ol> : <p className="muted">暂无风险原因，请结合数据完整性人工复核。</p>}
          <div className="review-note"><strong>人工复核提示</strong><p>{record.reviewSuggestion || '请安检人员结合现场情况复核。'} 风险低不等于绝对安全；传感器离线、数据缺失或图像质量异常时，应执行现场复检。</p></div>
        </article>
      </section>

      <section className="detail-grid detail-grid--equal">
        <article className="panel">
          <div className="panel-header"><div><h2>YOLO 模拟结果</h2><p>当前来自适配器模拟数据</p></div></div>
          {detections.length ? <div className="table-wrap"><table><thead><tr><th>类别</th><th>置信度</th><th>检测框 (x, y, w, h)</th><th>模型</th></tr></thead><tbody>{detections.map((item, index) => <tr key={item._id ?? index}><td><strong>{item.className}</strong></td><td>{formatPercent(item.confidence, 1)}</td><td className="mono">{[item.bbox?.x, item.bbox?.y, item.bbox?.width, item.bbox?.height].map((value) => Number.isFinite(Number(value)) ? Number(value).toFixed(2) : '—').join(', ')}</td><td>{item.modelName || '—'}<small className="cell-subtitle">{item.modelVersion}</small></td></tr>)}</tbody></table></div> : <p className="muted">未检测到目标，或本记录未包含有效图像结果。</p>}
        </article>
        <article className="panel">
          <div className="panel-header"><div><h2>气体传感器</h2><p>模拟浓度与设备状态</p></div></div>
          {gasList.length ? <div className="sensor-list">{gasList.map((gas, index) => <div className="sensor-card" key={gas._id ?? index}><div><span>{gas.gasType || '未知气体'}</span><strong>{formatNumber(gas.concentration, 2)} <small>{gas.unit}</small></strong></div><dl><div><dt>报警</dt><dd className={gas.alarm ? 'danger-text' : ''}>{gas.alarm ? '已触发' : '未触发'}</dd></div><div><dt>趋势</dt><dd>{trendNames[gas.trend] || gas.trend || '—'}</dd></div><div><dt>状态</dt><dd>{sensorNames[gas.sensorStatus] || gas.sensorStatus || '—'}</dd></div><div><dt>采集时间</dt><dd>{formatDateTime(gas.collectedAt)}</dd></div></dl></div>)}</div> : <p className="muted">本记录没有气体传感器数据，不能据此判定安全。</p>}
        </article>
      </section>

      <section className="detail-grid detail-grid--equal">
        <article className="panel">
          <div className="panel-header"><div><h2>关联设备</h2><p>检测来源设备及最后心跳</p></div></div>
          {device && typeof device === 'object' ? <dl className="description-list"><div><dt>设备编号</dt><dd>{device.deviceCode || '—'}</dd></div><div><dt>设备名称</dt><dd>{device.deviceName || '—'}</dd></div><div><dt>类型 / 位置</dt><dd>{device.deviceType || '—'} · {device.location || '—'}</dd></div><div><dt>状态</dt><dd><DeviceStatusBadge status={device.status} possiblyOffline={device.possiblyOffline} /></dd></div><div><dt>最后心跳</dt><dd>{formatDateTime(device.lastHeartbeatAt)}</dd></div></dl> : <p className="muted">{device ? `设备 ID：${device}` : '未关联设备'}</p>}
        </article>
        <article className="panel">
          <div className="panel-header"><div><h2>关联报警</h2><p>高风险记录会自动生成报警</p></div>{alarm && <Link to="/alarms">前往处置</Link>}</div>
          {alarm ? <dl className="description-list"><div><dt>报警标题</dt><dd>{alarm.title}</dd></div><div><dt>报警级别</dt><dd><RiskBadge level={alarm.level} /></dd></div><div><dt>报警状态</dt><dd><AlarmStatusBadge status={alarm.status} /></dd></div><div><dt>指派给</dt><dd>{displayName(alarm.assignedTo)}</dd></div><div><dt>处置备注</dt><dd>{alarm.handlingNote || '暂无'}</dd></div><div><dt>创建时间</dt><dd>{formatDateTime(alarm.createdAt)}</dd></div></dl> : <p className="muted">当前记录没有关联报警。</p>}
        </article>
      </section>

      <section className="panel">
        <div className="panel-header"><div><h2>操作日志</h2><p>该记录的关键写操作追踪</p></div><span className="panel-count">{logs.length} 条</span></div>
        {logs.length ? <div className="timeline">{logs.map((log) => <div className="timeline-item" key={log._id}><span className="timeline-dot" /><div><strong>{log.action}</strong><p>{displayName(log.userId, '系统')} · {formatDateTime(log.createdAt)}</p>{log.after && <details><summary>查看变更后快照</summary><pre>{JSON.stringify(log.after, null, 2)}</pre></details>}</div></div>)}</div> : <p className="muted">暂无关联操作日志。</p>}
      </section>
    </div>
  );
}
