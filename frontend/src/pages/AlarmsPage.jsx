import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { alarmApi } from '../api/alarmApi.js';
import { userApi } from '../api/adminApi.js';
import { useAuth } from '../context/auth-context.js';
import { useRealtime } from '../context/realtime-context.js';
import PageHeader from '../components/PageHeader.jsx';
import Pagination from '../components/Pagination.jsx';
import { AlarmStatusBadge, RiskBadge } from '../components/Badges.jsx';
import { EmptyBlock, ErrorBlock, LoadingBlock, Spinner } from '../components/StateViews.jsx';
import { ALARM_TRANSITIONS } from '../utils/alarmTransitions.js';
import { alarmStatusLabel, displayName, formatDateTime, objectId } from '../utils/formatters.js';

const statusActionNames = { confirmed: '确认报警', processing: '开始处理', resolved: '标记解决', ignored: '忽略报警' };

function AlarmActionModal({ alarm, nextStatus, busy, error, onClose, onSubmit }) {
  const [note, setNote] = useState(alarm?.handlingNote || '');
  const requiresNote = nextStatus === 'resolved' || nextStatus === 'ignored';
  const [localError, setLocalError] = useState('');
  if (!alarm) return null;
  const submit = (event) => {
    event.preventDefault();
    if (requiresNote && note.trim().length < 2) { setLocalError('解决或忽略报警时，请填写处置备注。'); return; }
    onSubmit(note.trim());
  };
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
      <form className="modal modal--form" role="dialog" aria-modal="true" onSubmit={submit}>
        <div className="modal-heading"><div><span className="eyebrow">报警处置</span><h2>{statusActionNames[nextStatus]}</h2></div><button type="button" className="modal-close" onClick={onClose} disabled={busy}>×</button></div>
        <div className="alarm-modal-summary"><RiskBadge level={alarm.level} /><div><strong>{alarm.title}</strong><span>{alarm.description || '请结合检测详情进行人工复核。'}</span></div></div>
        <label className="field"><span>处置备注 {requiresNote && <em>*</em>}</span><textarea rows="4" value={note} onChange={(event) => setNote(event.target.value)} placeholder={requiresNote ? '请记录核查结果、采取的措施或忽略原因' : '可填写确认信息（选填）'} /></label>
        {(localError || error) && <div className="form-error" role="alert"><span>!</span>{localError || error}</div>}
        <div className="modal-actions"><button type="button" className="button button--secondary" onClick={onClose} disabled={busy}>取消</button><button type="submit" className={`button${nextStatus === 'ignored' ? ' button--danger' : ' button--primary'}`} disabled={busy}>{busy && <Spinner small />}{busy ? '正在保存…' : statusActionNames[nextStatus]}</button></div>
      </form>
    </div>
  );
}

function AssignModal({ alarm, users, currentUser, busy, error, onClose, onAssign }) {
  const initial = objectId(alarm?.assignedTo) || (currentUser.role === 'inspector' ? objectId(currentUser) : '');
  const [assignedTo, setAssignedTo] = useState(initial);
  if (!alarm) return null;
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
      <form className="modal modal--form" role="dialog" aria-modal="true" onSubmit={(event) => { event.preventDefault(); if (assignedTo) onAssign(assignedTo); }}>
        <div className="modal-heading"><div><span className="eyebrow">处理人员</span><h2>指派报警</h2></div><button type="button" className="modal-close" onClick={onClose} disabled={busy}>×</button></div>
        {currentUser.role === 'admin' ? <label className="field"><span>指派给</span><select value={assignedTo} onChange={(event) => setAssignedTo(event.target.value)} required><option value="">请选择安检员</option>{users.map((item) => <option key={item._id} value={item._id}>{item.username || item.email}（{item.role === 'admin' ? '管理员' : '安检员'}）</option>)}</select></label> : <p>将此报警指派给当前登录账号：<strong>{currentUser.username || currentUser.email}</strong></p>}
        {error && <div className="form-error"><span>!</span>{error}</div>}
        <div className="modal-actions"><button type="button" className="button button--secondary" onClick={onClose} disabled={busy}>取消</button><button type="submit" className="button button--primary" disabled={busy || !assignedTo}>{busy && <Spinner small />}{busy ? '正在指派…' : '确认指派'}</button></div>
      </form>
    </div>
  );
}

export default function AlarmsPage() {
  const { user } = useAuth();
  const { revision } = useRealtime();
  const [searchParams, setSearchParams] = useSearchParams();
  const [alarms, setAlarms] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 10, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [action, setAction] = useState(null);
  const [assigning, setAssigning] = useState(null);
  const [busy, setBusy] = useState(false);
  const [modalError, setModalError] = useState('');
  const [users, setUsers] = useState([]);
  const queryString = searchParams.toString();

  const loadAlarms = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params = Object.fromEntries(new URLSearchParams(queryString));
      const payload = await alarmApi.list({ page: 1, pageSize: 10, ...params });
      setAlarms(Array.isArray(payload.data) ? payload.data : []);
      setPagination(payload.pagination || { page: 1, pageSize: 10, total: 0, totalPages: 1 });
    } catch (loadError) { setError(loadError.message); } finally { setLoading(false); }
  }, [queryString]);
  useEffect(() => { loadAlarms(); }, [loadAlarms, revision]);
  useEffect(() => {
    if (user?.role === 'admin') userApi.list({ pageSize: 100, role: 'inspector', isActive: true }).then((payload) => setUsers((payload.data || []).filter((item) => ['inspector', 'admin'].includes(item.role)))).catch(() => setUsers([]));
  }, [user?.role]);

  const updateQuery = (patch) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(patch).forEach(([key, value]) => value ? next.set(key, String(value)) : next.delete(key));
    setSearchParams(next);
  };
  const closeModals = () => { setAction(null); setAssigning(null); setModalError(''); };
  const saveStatus = async (handlingNote) => {
    setBusy(true); setModalError('');
    try {
      await alarmApi.updateStatus(action.alarm._id, { status: action.nextStatus, handlingNote: handlingNote || undefined });
      setNotice(`报警状态已更新为“${alarmStatusLabel(action.nextStatus)}”。`); closeModals(); await loadAlarms();
    } catch (saveError) { setModalError(saveError.message); } finally { setBusy(false); }
  };
  const assign = async (assignedTo) => {
    setBusy(true); setModalError('');
    try { await alarmApi.assign(assigning._id, assignedTo); setNotice('报警已成功指派。'); closeModals(); await loadAlarms(); }
    catch (saveError) { setModalError(saveError.message); } finally { setBusy(false); }
  };
  const reopen = async (alarm) => {
    setBusy(true); setError('');
    try { await alarmApi.reopen(alarm._id); setNotice('报警已由管理员重新打开。'); await loadAlarms(); }
    catch (saveError) { setError(saveError.message); } finally { setBusy(false); }
  };
  const canWrite = user?.role === 'admin' || user?.role === 'inspector';
  const activeFilters = useMemo(() => ({ status: searchParams.get('status') || '', level: searchParams.get('level') || '', startTime: searchParams.get('startTime') || '', endTime: searchParams.get('endTime') || '' }), [searchParams]);

  return (
    <div>
      <PageHeader title="报警中心" description="确认、指派并跟踪高风险检测报警的人工处置过程" actions={<button className="button button--secondary" type="button" onClick={loadAlarms}>刷新报警</button>} />
      {notice && <div className="notice notice--success">{notice}<button type="button" onClick={() => setNotice('')}>×</button></div>}
      <section className="filter-panel filter-panel--inline">
        <label className="field field--compact"><span>报警状态</span><select value={activeFilters.status} onChange={(event) => updateQuery({ status: event.target.value, page: 1 })}><option value="">全部状态</option><option value="unconfirmed">待确认</option><option value="confirmed">已确认</option><option value="processing">处理中</option><option value="resolved">已解决</option><option value="ignored">已忽略</option></select></label>
        <label className="field field--compact"><span>风险等级</span><select value={activeFilters.level} onChange={(event) => updateQuery({ level: event.target.value, page: 1 })}><option value="">全部等级</option><option value="high">高风险</option><option value="medium">中风险</option></select></label>
        <label className="field field--compact"><span>开始时间</span><input type="datetime-local" value={activeFilters.startTime} onChange={(event) => updateQuery({ startTime: event.target.value, page: 1 })} /></label>
        <label className="field field--compact"><span>结束时间</span><input type="datetime-local" value={activeFilters.endTime} onChange={(event) => updateQuery({ endTime: event.target.value, page: 1 })} /></label>
        <button type="button" className="button button--ghost align-end" onClick={() => setSearchParams({})}>重置</button>
      </section>

      {loading ? <LoadingBlock /> : error ? <ErrorBlock message={error} onRetry={loadAlarms} /> : alarms.length === 0 ? <EmptyBlock title="暂无匹配报警" description="高风险检测记录创建后，关联报警会显示在这里。" /> : (
        <div className="alarm-cards">
          {alarms.map((alarm) => {
            const inspectionId = objectId(alarm.inspectionId);
            const nextStatuses = ALARM_TRANSITIONS[alarm.status] || [];
            return (
              <article className={`alarm-card alarm-card--${alarm.level}`} key={alarm._id}>
                <div className="alarm-card-accent" />
                <div className="alarm-card-main">
                  <div className="alarm-card-heading"><div className="stacked-badges"><RiskBadge level={alarm.level} /><AlarmStatusBadge status={alarm.status} /></div><span>{formatDateTime(alarm.createdAt)}</span></div>
                  <h2>{alarm.title || '风险融合报警'}</h2>
                  <p>{alarm.description || '检测记录达到报警条件，请人工复核。'}</p>
                  {alarm.reasons?.length > 0 && <ul className="alarm-reasons">{alarm.reasons.slice(0, 3).map((reason, index) => <li key={`${reason}-${index}`}>{reason}</li>)}</ul>}
                  <div className="alarm-meta"><span>指派人员：<strong>{displayName(alarm.assignedTo, '暂未指派')}</strong></span><span>处置备注：<strong>{alarm.handlingNote || '暂无'}</strong></span></div>
                </div>
                <div className="alarm-card-actions">
                  {inspectionId && <Link className="button button--ghost button--small" to={`/inspections/${inspectionId}`}>查看检测</Link>}
                  {canWrite && <button type="button" className="button button--secondary button--small" onClick={() => { setAssigning(alarm); setModalError(''); }}>指派</button>}
                  {canWrite && nextStatuses.map((nextStatus) => <button key={nextStatus} type="button" className={`button button--small${nextStatus === 'ignored' ? ' button--ghost' : ' button--primary'}`} onClick={() => { setAction({ alarm, nextStatus }); setModalError(''); }}>{statusActionNames[nextStatus]}</button>)}
                  {user?.role === 'admin' && ['resolved', 'ignored'].includes(alarm.status) && <button type="button" className="button button--small button--secondary" disabled={busy} onClick={() => reopen(alarm)}>重新打开</button>}
                </div>
              </article>
            );
          })}
          <section className="panel"><Pagination pagination={pagination} onPageChange={(page) => updateQuery({ page })} onPageSizeChange={(pageSize) => updateQuery({ page: 1, pageSize })} /></section>
        </div>
      )}
      <AlarmActionModal alarm={action?.alarm} nextStatus={action?.nextStatus} busy={busy} error={modalError} onClose={closeModals} onSubmit={saveStatus} />
      <AssignModal alarm={assigning} users={users} currentUser={user} busy={busy} error={modalError} onClose={closeModals} onAssign={assign} />
    </div>
  );
}
