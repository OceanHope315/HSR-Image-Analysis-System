import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { dashboardApi } from '../api/dashboardApi.js';
import { simulationApi } from '../api/simulationApi.js';
import { useAuth } from '../context/auth-context.js';
import { useRealtime } from '../context/realtime-context.js';
import PageHeader from '../components/PageHeader.jsx';
import { DeviceStatusBadge, RiskBadge, AlarmStatusBadge } from '../components/Badges.jsx';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../components/StateViews.jsx';
import { detectionClassLabel, formatDateTime, formatNumber, objectId } from '../utils/formatters.js';

const COLORS = { high: '#d64545', medium: '#e98b2a', low: '#249b72' };

function StatCard({ label, value, tone = 'blue', helper, loading }) {
  return (
    <article className={`stat-card stat-card--${tone}`}>
      <div className="stat-icon" aria-hidden="true">{label.slice(0, 1)}</div>
      <div><span>{label}</span><strong>{loading ? '…' : formatNumber(value ?? 0)}</strong>{helper && <small>{helper}</small>}</div>
    </article>
  );
}

function normalizeRiskCounts(summary) {
  const counts = summary?.riskCounts ?? summary?.riskDistribution ?? summary?.byRiskLevel ?? {};
  if (Array.isArray(counts)) {
    return Object.fromEntries(counts.map((item) => [item._id ?? item.riskLevel ?? item.level, item.count ?? item.value ?? 0]));
  }
  return counts;
}

function normalizeTrend(value) {
  const list = Array.isArray(value) ? value : value?.items ?? value?.trend ?? [];
  return list.map((item) => ({
    date: item.date ?? item._id ?? item.day,
    high: item.high ?? item.counts?.high ?? 0,
    medium: item.medium ?? item.counts?.medium ?? 0,
    low: item.low ?? item.counts?.low ?? 0,
  }));
}

function normalizeTargets(summary, gas) {
  const source = summary?.dangerousTargets ?? summary?.targetStatistics ?? gas?.dangerousTargets ?? gas?.targetStatistics ?? [];
  if (Array.isArray(source)) return source.map((item) => ({ name: detectionClassLabel(item.name ?? item.className ?? item._id), count: item.count ?? item.value ?? 0 }));
  return Object.entries(source || {}).map(([name, count]) => ({ name: detectionClassLabel(name), count }));
}

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { revision, status: realtimeStatus } = useRealtime();
  const [data, setData] = useState({ summary: null, trend: null, gas: null, devices: null });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [simulating, setSimulating] = useState(false);
  const [simulationError, setSimulationError] = useState('');

  const loadDashboard = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    const requests = [
      ['summary', dashboardApi.summary()],
      ['trend', dashboardApi.riskTrend(7)],
      ['gas', dashboardApi.gasStatistics()],
      ['devices', dashboardApi.deviceStatus()],
    ];
    const results = await Promise.allSettled(requests.map((item) => item[1]));
    const nextErrors = {};
    setData((current) => {
      const next = { ...current };
      results.forEach((result, index) => {
        const key = requests[index][0];
        if (result.status === 'fulfilled') next[key] = result.value;
        else nextErrors[key] = result.reason?.message || '请求失败';
      });
      return next;
    });
    setErrors(nextErrors);
    setUpdatedAt(new Date());
    setLoading(false);
  }, []);

  useEffect(() => {
    loadDashboard({ silent: Boolean(data.summary) });
    // Socket 事件只触发刷新，已有卡片保留以避免页面闪烁。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadDashboard, revision]);

  useEffect(() => {
    const timer = window.setInterval(() => loadDashboard({ silent: true }), 30_000);
    return () => window.clearInterval(timer);
  }, [loadDashboard]);

  const summary = data.summary || {};
  const riskCounts = normalizeRiskCounts(summary);
  const riskData = ['high', 'medium', 'low'].map((level) => ({ level, name: { high: '高风险', medium: '中风险', low: '低风险' }[level], value: Number(riskCounts[level] || 0) }));
  const trendData = normalizeTrend(data.trend);
  const targets = normalizeTargets(summary, data.gas);
  const deviceCounts = data.devices?.counts ?? data.devices?.statusCounts ?? data.devices ?? {};
  const latestInspections = summary.latestInspections ?? summary.recentInspections ?? [];
  const latestAlarms = summary.latestAlarms ?? summary.recentAlarms ?? [];
  const devices = data.devices?.devices ?? data.devices?.latestDevices ?? [];
  const failureNames = useMemo(() => Object.keys(errors).map((key) => ({ summary: '概览', trend: '风险趋势', gas: '气体统计', devices: '设备状态' })[key]), [errors]);

  const generateSimulation = async () => {
    setSimulating(true); setSimulationError('');
    try {
      const generated = await simulationApi.generate();
      const id = objectId(generated?.inspection ?? generated);
      if (id) navigate(`/inspections/${id}`, { state: { created: true } });
      else await loadDashboard();
    } catch (generateError) {
      setSimulationError(generateError.message || '模拟数据生成失败');
    } finally {
      setSimulating(false);
    }
  };

  if (loading && !data.summary && Object.keys(errors).length === 0) return <><PageHeader title="运行总览" description="多模态检测、报警和设备运行情况" /><LoadingBlock label="正在汇总数据库统计…" /></>;
  if (!data.summary && errors.summary) return <><PageHeader title="运行总览" /><ErrorBlock message={errors.summary} onRetry={() => loadDashboard()} /></>;

  return (
    <div>
      <PageHeader
        title="运行总览"
        description={`多模态检测、报警和设备运行情况${updatedAt ? ` · 更新于 ${formatDateTime(updatedAt)}` : ''}`}
        actions={<><span className={`connection-pill connection-pill--${realtimeStatus}`}>实时：{realtimeStatus === 'connected' ? '已连接' : realtimeStatus === 'reconnecting' ? '重连中' : 'REST 降级'}</span>{user?.role !== 'viewer' && <button type="button" className="button button--primary" onClick={generateSimulation} disabled={simulating}>{simulating ? '正在生成…' : '＋ 随机模拟检测'}</button>}<button type="button" className="button button--secondary" onClick={() => loadDashboard()} disabled={loading}>刷新数据</button></>}
      />

      {simulationError && <div className="notice notice--warning" role="alert">随机模拟检测失败：{simulationError}<button type="button" onClick={() => setSimulationError('')}>×</button></div>}
      {failureNames.length > 0 && <div className="partial-warning">部分数据暂时不可用：{failureNames.join('、')}。其他模块仍可正常使用。</div>}

      <section className="stats-grid" aria-label="关键指标">
        <StatCard label="今日检测" value={summary.todayInspections ?? summary.todayCount} tone="blue" loading={loading} />
        <StatCard label="累计检测" value={summary.totalInspections ?? summary.totalCount} tone="navy" loading={loading} />
        <StatCard label="高风险" value={riskCounts.high} tone="red" loading={loading} helper="需优先人工复核" />
        <StatCard label="未处理报警" value={summary.unresolvedAlarms ?? summary.unhandledAlarms ?? summary.pendingAlarms ?? summary.unhandledAlarmCount} tone="orange" loading={loading} />
        <StatCard label="在线设备" value={deviceCounts.online ?? data.devices?.online} tone="teal" loading={loading} />
        <StatCard label="气体报警" value={summary.gasAlarmCount ?? summary.gasAlarms ?? data.gas?.alarmCount ?? data.gas?.totalAlarms} tone="purple" loading={loading} />
      </section>

      <section className="dashboard-grid dashboard-grid--charts">
        <article className="panel">
          <div className="panel-header"><div><h2>风险等级分布</h2><p>全部未删除检测记录</p></div></div>
          {riskData.some((item) => item.value > 0) ? (
            <div className="chart chart--pie"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={riskData} dataKey="value" nameKey="name" innerRadius={58} outerRadius={90} paddingAngle={3}>{riskData.map((item) => <Cell key={item.level} fill={COLORS[item.level]} />)}</Pie><Tooltip /><Legend /></PieChart></ResponsiveContainer></div>
          ) : <EmptyBlock title="暂无风险分布" description="完成一次智能检测后将显示统计。" />}
        </article>
        <article className="panel panel--wide">
          <div className="panel-header"><div><h2>最近七天风险趋势</h2><p>按检测日期聚合</p></div></div>
          {errors.trend ? <ErrorBlock message={errors.trend} onRetry={() => loadDashboard()} /> : trendData.length ? (
            <div className="chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={trendData} margin={{ top: 10, right: 12, left: -20, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" stroke="#e5ebf1" /><XAxis dataKey="date" tick={{ fontSize: 12 }} /><YAxis allowDecimals={false} tick={{ fontSize: 12 }} /><Tooltip /><Legend /><Line type="monotone" dataKey="high" name="高风险" stroke={COLORS.high} strokeWidth={2} dot={{ r: 3 }} /><Line type="monotone" dataKey="medium" name="中风险" stroke={COLORS.medium} strokeWidth={2} /><Line type="monotone" dataKey="low" name="低风险" stroke={COLORS.low} strokeWidth={2} /></LineChart></ResponsiveContainer></div>
          ) : <EmptyBlock title="暂无趋势数据" />}
        </article>
      </section>

      <section className="dashboard-grid dashboard-grid--equal">
        <article className="panel">
          <div className="panel-header"><div><h2>危险目标类别</h2><p>真实与模拟视觉检测结果聚合</p></div></div>
          {errors.gas ? <ErrorBlock message={errors.gas} onRetry={() => loadDashboard()} /> : targets.length ? (
            <div className="chart chart--short"><ResponsiveContainer width="100%" height="100%"><BarChart data={targets.slice(0, 8)} layout="vertical" margin={{ left: 10, right: 20 }}><CartesianGrid strokeDasharray="3 3" stroke="#e5ebf1" /><XAxis type="number" allowDecimals={false} /><YAxis type="category" dataKey="name" width={72} tick={{ fontSize: 12 }} /><Tooltip /><Bar dataKey="count" name="数量" fill="#167f86" radius={[0, 4, 4, 0]} /></BarChart></ResponsiveContainer></div>
          ) : <EmptyBlock title="暂无危险目标" description="当前记录未检测到可统计的危险目标。" />}
        </article>
        <article className="panel">
          <div className="panel-header"><div><h2>设备在线状态</h2><p>依据设备状态和最后心跳</p></div><Link to="/devices">查看全部</Link></div>
          {errors.devices ? <ErrorBlock message={errors.devices} onRetry={() => loadDashboard()} /> : devices.length ? (
            <ul className="compact-list">{devices.slice(0, 6).map((device) => <li key={device._id ?? device.deviceCode}><div><strong>{device.deviceName || device.deviceCode}</strong><span>{device.location || device.deviceType || '未设置位置'}</span></div><DeviceStatusBadge status={device.effectiveStatus || device.status} possiblyOffline={device.possiblyOffline || device.heartbeatStale} /></li>)}</ul>
          ) : (
            <div className="device-summary"><div><strong>{formatNumber(deviceCounts.online ?? 0)}</strong><span>在线</span></div><div><strong>{formatNumber(deviceCounts.offline ?? 0)}</strong><span>离线</span></div><div><strong>{formatNumber(deviceCounts.warning ?? 0)}</strong><span>告警</span></div><div><strong>{formatNumber(deviceCounts.maintenance ?? 0)}</strong><span>维护</span></div></div>
          )}
        </article>
      </section>

      <section className="dashboard-grid dashboard-grid--equal">
        <article className="panel">
          <div className="panel-header"><div><h2>最新检测记录</h2><p>实时接收并自动刷新</p></div><Link to="/inspections">历史记录</Link></div>
          {latestInspections.length ? <div className="table-wrap"><table><thead><tr><th>包裹编号</th><th>风险</th><th>时间</th></tr></thead><tbody>{latestInspections.slice(0, 6).map((record) => <tr key={record._id}><td><Link to={`/inspections/${record._id}`}>{record.packageId}</Link></td><td><RiskBadge level={record.riskLevel} /></td><td>{formatDateTime(record.timestamp)}</td></tr>)}</tbody></table></div> : <EmptyBlock title="暂无检测记录" action={<Link className="button button--small" to="/inspections/new">开始智能检测</Link>} />}
        </article>
        <article className="panel">
          <div className="panel-header"><div><h2>最新报警</h2><p>高风险记录需要人工处置</p></div><Link to="/alarms">报警中心</Link></div>
          {latestAlarms.length ? <ul className="compact-list alarm-list">{latestAlarms.slice(0, 6).map((alarm) => <li key={alarm._id}><div><strong>{alarm.title || `报警 ${String(alarm._id).slice(-6)}`}</strong><span>{formatDateTime(alarm.createdAt)}</span></div><div className="stacked-badges"><RiskBadge level={alarm.level} /><AlarmStatusBadge status={alarm.status} /></div></li>)}</ul> : <EmptyBlock title="暂无报警" description="高风险检测会在事务流程中生成报警。" />}
        </article>
      </section>

      <div className="simulation-footnote"><strong>数据说明：</strong>本页统计来自 MongoDB 中的真实或模拟检测记录；风险等级用于辅助复核，不替代现场安检结论。</div>
    </div>
  );
}
