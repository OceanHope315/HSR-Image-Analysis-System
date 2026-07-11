import { useCallback, useEffect, useState } from 'react';
import { logApi } from '../api/adminApi.js';
import PageHeader from '../components/PageHeader.jsx';
import Pagination from '../components/Pagination.jsx';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../components/StateViews.jsx';
import { displayName, formatDateTime } from '../utils/formatters.js';

const actionNames = {
  'auth.login': '用户登录', 'inspection.create': '新增检测', 'inspection.update': '更新检测',
  'inspection.soft-delete': '逻辑删除检测', 'inspection.restore': '恢复检测',
  'alarm.status': '更新报警状态', 'alarm.assign': '指派报警', 'alarm.reopen': '重新打开报警',
  'device.create': '新增设备', 'device.update': '更新设备', 'device.delete': '删除设备', 'device.heartbeat': '设备心跳',
  'user.create': '新增用户', 'user.update': '更新用户', 'user.deactivate': '停用用户',
};

export default function LogsPage() {
  const [logs, setLogs] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20, total: 0, totalPages: 1 });
  const [query, setQuery] = useState({ page: 1, pageSize: 20, action: '', resourceType: '', startTime: '', endTime: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(null);

  const loadLogs = useCallback(async () => {
    setLoading(true); setError('');
    try { const payload = await logApi.list(query); setLogs(payload.data || []); setPagination(payload.pagination || { ...query, total: 0, totalPages: 1 }); }
    catch (loadError) { setError(loadError.message); } finally { setLoading(false); }
  }, [query]);
  useEffect(() => { loadLogs(); }, [loadLogs]);

  return (
    <div>
      <PageHeader title="操作日志" description="审计关键写操作，追踪操作者、资源与变更前后状态" actions={<button className="button button--secondary" type="button" onClick={loadLogs}>刷新日志</button>} />
      <section className="filter-panel filter-panel--inline">
        <label className="field field--compact"><span>操作标识</span><input value={query.action} onChange={(event) => setQuery({ ...query, page: 1, action: event.target.value })} placeholder="例如 inspection.create" /></label>
        <label className="field field--compact"><span>资源类型</span><input value={query.resourceType} onChange={(event) => setQuery({ ...query, page: 1, resourceType: event.target.value })} placeholder="例如 InspectionRecord" /></label>
        <label className="field field--compact"><span>开始时间</span><input type="datetime-local" value={query.startTime} onChange={(event) => setQuery({ ...query, page: 1, startTime: event.target.value })} /></label>
        <label className="field field--compact"><span>结束时间</span><input type="datetime-local" value={query.endTime} onChange={(event) => setQuery({ ...query, page: 1, endTime: event.target.value })} /></label>
        <button type="button" className="button button--ghost align-end" onClick={() => setQuery({ page: 1, pageSize: 20, action: '', resourceType: '', startTime: '', endTime: '' })}>重置</button>
      </section>
      <section className="panel table-panel">
        {loading ? <LoadingBlock /> : error ? <ErrorBlock message={error} onRetry={loadLogs} /> : logs.length === 0 ? <EmptyBlock title="暂无操作日志" /> : <>
          <div className="table-wrap"><table><thead><tr><th>时间</th><th>操作者</th><th>操作</th><th>资源类型</th><th>资源 ID</th><th>来源</th><th>详情</th></tr></thead><tbody>{logs.map((log) => <tr key={log._id}><td>{formatDateTime(log.createdAt)}</td><td>{displayName(log.userId, '系统')}</td><td><strong>{actionNames[log.action] || log.action}</strong><small className="cell-subtitle mono">{log.action}</small></td><td>{log.resourceType}</td><td className="mono truncate-id" title={log.resourceId}>{log.resourceId || '—'}</td><td>{log.ip || '—'}<small className="cell-subtitle user-agent" title={log.userAgent}>{log.userAgent || ''}</small></td><td><button type="button" className="text-button" onClick={() => setExpanded(expanded === log._id ? null : log._id)}>{expanded === log._id ? '收起' : '查看变更'}</button></td></tr>)}</tbody></table></div>
          {expanded && (() => { const log = logs.find((item) => item._id === expanded); return log ? <div className="log-diff"><div><strong>变更前</strong><pre>{log.before ? JSON.stringify(log.before, null, 2) : '无快照'}</pre></div><div><strong>变更后</strong><pre>{log.after ? JSON.stringify(log.after, null, 2) : '无快照'}</pre></div></div> : null; })()}
          <Pagination pagination={pagination} onPageChange={(page) => setQuery({ ...query, page })} onPageSizeChange={(pageSize) => setQuery({ ...query, page: 1, pageSize })} />
        </>}
      </section>
    </div>
  );
}
