import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { inspectionApi } from '../api/inspectionApi.js';
import { useAuth } from '../context/auth-context.js';
import PageHeader from '../components/PageHeader.jsx';
import Pagination from '../components/Pagination.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import { InspectionStatusBadge, RiskBadge } from '../components/Badges.jsx';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../components/StateViews.jsx';
import { formatDateTime, formatNumber } from '../utils/formatters.js';

const initialFilters = (params) => ({
  packageId: params.get('packageId') || '',
  riskLevel: params.get('riskLevel') || '',
  status: params.get('status') || '',
  gasAlarm: params.get('gasAlarm') || '',
  startTime: params.get('startTime') || '',
  endTime: params.get('endTime') || '',
  sortBy: params.get('sortBy') || 'timestamp',
  sortOrder: params.get('sortOrder') || 'desc',
  includeDeleted: params.get('includeDeleted') === 'true',
});

export default function InspectionsPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [filters, setFilters] = useState(() => initialFilters(searchParams));
  const [records, setRecords] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 10, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirm, setConfirm] = useState(null);
  const [mutating, setMutating] = useState(false);
  const queryString = searchParams.toString();

  const loadRecords = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = Object.fromEntries(new URLSearchParams(queryString));
      params.page = params.page || 1;
      params.pageSize = params.pageSize || 10;
      const payload = await inspectionApi.list(params);
      setRecords(Array.isArray(payload.data) ? payload.data : []);
      setPagination(payload.pagination || { page: Number(params.page), pageSize: Number(params.pageSize), total: 0, totalPages: 1 });
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => { loadRecords(); }, [loadRecords]);

  const updateQuery = (patch) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(patch).forEach(([key, value]) => {
      if (value === '' || value === false || value === null || value === undefined) next.delete(key);
      else next.set(key, String(value));
    });
    setSearchParams(next);
  };

  const applyFilters = (event) => {
    event.preventDefault();
    updateQuery({ ...filters, includeDeleted: user?.role === 'admin' && filters.includeDeleted ? 'true' : '', page: 1 });
  };

  const resetFilters = () => {
    const reset = initialFilters(new URLSearchParams());
    setFilters(reset);
    setSearchParams({ page: '1', pageSize: String(pagination.pageSize || 10) });
  };

  const handleMutation = async () => {
    if (!confirm) return;
    setMutating(true);
    setNotice('');
    try {
      if (confirm.action === 'restore') await inspectionApi.restore(confirm.record._id);
      else await inspectionApi.remove(confirm.record._id);
      setNotice(confirm.action === 'restore' ? '检测记录已恢复。' : '检测记录已逻辑删除，可由管理员恢复。');
      setConfirm(null);
      await loadRecords();
    } catch (mutationError) {
      setError(mutationError.message);
    } finally {
      setMutating(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="历史检测记录"
        description="查询、筛选并复核模拟 X 光与气体融合检测结果"
        actions={user?.role !== 'viewer' && <Link className="button button--primary" to="/inspections/new">＋ 新增模拟检测</Link>}
      />

      {notice && <div className="notice notice--success" role="status">{notice}<button type="button" onClick={() => setNotice('')}>×</button></div>}

      <form className="filter-panel" onSubmit={applyFilters}>
        <div className="filter-grid">
          <label className="field field--compact"><span>包裹编号</span><input value={filters.packageId} onChange={(event) => setFilters({ ...filters, packageId: event.target.value })} placeholder="输入编号搜索" /></label>
          <label className="field field--compact"><span>风险等级</span><select value={filters.riskLevel} onChange={(event) => setFilters({ ...filters, riskLevel: event.target.value })}><option value="">全部风险</option><option value="high">高风险</option><option value="medium">中风险</option><option value="low">低风险</option></select></label>
          <label className="field field--compact"><span>处理状态</span><select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}><option value="">全部状态</option><option value="pending">待复核</option><option value="reviewed">已复核</option><option value="escalated">已升级</option><option value="closed">已关闭</option></select></label>
          <label className="field field--compact"><span>气体报警</span><select value={filters.gasAlarm} onChange={(event) => setFilters({ ...filters, gasAlarm: event.target.value })}><option value="">全部</option><option value="true">仅报警</option><option value="false">仅未报警</option></select></label>
          <label className="field field--compact"><span>开始时间</span><input type="datetime-local" value={filters.startTime} onChange={(event) => setFilters({ ...filters, startTime: event.target.value })} /></label>
          <label className="field field--compact"><span>结束时间</span><input type="datetime-local" value={filters.endTime} onChange={(event) => setFilters({ ...filters, endTime: event.target.value })} /></label>
          <label className="field field--compact"><span>排序字段</span><select value={filters.sortBy} onChange={(event) => setFilters({ ...filters, sortBy: event.target.value })}><option value="timestamp">检测时间</option><option value="riskScore">风险分数</option><option value="createdAt">创建时间</option><option value="packageId">包裹编号</option></select></label>
          <label className="field field--compact"><span>排序方向</span><select value={filters.sortOrder} onChange={(event) => setFilters({ ...filters, sortOrder: event.target.value })}><option value="desc">降序</option><option value="asc">升序</option></select></label>
        </div>
        <div className="filter-actions">
          {user?.role === 'admin' && <label className="checkbox"><input type="checkbox" checked={filters.includeDeleted} onChange={(event) => setFilters({ ...filters, includeDeleted: event.target.checked })} /><span>包含已删除记录</span></label>}
          <span className="filter-spacer" />
          <button type="button" className="button button--ghost" onClick={resetFilters}>重置筛选</button>
          <button type="submit" className="button button--secondary">应用筛选</button>
        </div>
      </form>

      <section className="panel table-panel">
        {loading ? <LoadingBlock /> : error ? <ErrorBlock message={error} onRetry={loadRecords} /> : records.length === 0 ? <EmptyBlock title="没有匹配的检测记录" description="可重置筛选，或新增一条模拟检测记录。" /> : (
          <>
            <div className="table-wrap">
              <table>
                <thead><tr><th>包裹编号</th><th>检测时间</th><th>风险等级</th><th>风险分数</th><th>气体报警</th><th>状态</th><th>来源</th><th className="table-actions-col">操作</th></tr></thead>
                <tbody>{records.map((record) => {
                  const gas = Array.isArray(record.gasSensor) ? record.gasSensor[0] : record.gasSensor;
                  return (
                    <tr key={record._id} className={record.isDeleted ? 'row--deleted' : ''}>
                      <td><Link className="record-link" to={`/inspections/${record._id}`}>{record.packageId}</Link>{record.isDeleted && <span className="deleted-mark">已删除</span>}</td>
                      <td>{formatDateTime(record.timestamp)}</td>
                      <td><RiskBadge level={record.riskLevel} /></td>
                      <td><strong>{formatNumber(record.riskScore)}</strong><span className="score-unit">/100</span></td>
                      <td>{gas?.alarm ? <span className="yes-alarm">是</span> : '否'}</td>
                      <td><InspectionStatusBadge status={record.status} /></td>
                      <td>{record.source === 'simulation' || record.source === 'manual-simulation' ? '模拟数据' : record.source || '—'}</td>
                      <td><div className="table-actions"><Link className="text-button" to={`/inspections/${record._id}`}>查看</Link>{user?.role === 'admin' && (record.isDeleted ? <button type="button" className="text-button" onClick={() => setConfirm({ action: 'restore', record })}>恢复</button> : <button type="button" className="text-button text-button--danger" onClick={() => setConfirm({ action: 'delete', record })}>删除</button>)}</div></td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
            <Pagination pagination={pagination} onPageChange={(page) => updateQuery({ page })} onPageSizeChange={(pageSize) => updateQuery({ page: 1, pageSize })} />
          </>
        )}
      </section>

      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.action === 'restore' ? '恢复这条检测记录？' : '逻辑删除这条记录？'}
        description={confirm?.action === 'restore' ? `恢复后，包裹 ${confirm?.record.packageId} 将重新出现在默认查询中。` : `包裹 ${confirm?.record.packageId} 不会被物理删除，管理员之后仍可查看和恢复。此操作会写入操作日志。`}
        confirmLabel={confirm?.action === 'restore' ? '确认恢复' : '确认删除'}
        danger={confirm?.action === 'delete'}
        busy={mutating}
        onCancel={() => !mutating && setConfirm(null)}
        onConfirm={handleMutation}
      />
    </div>
  );
}
