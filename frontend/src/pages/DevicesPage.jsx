import { useCallback, useEffect, useState } from 'react';
import { deviceApi } from '../api/deviceApi.js';
import { useAuth } from '../context/auth-context.js';
import { useRealtime } from '../context/realtime-context.js';
import PageHeader from '../components/PageHeader.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import Pagination from '../components/Pagination.jsx';
import { DeviceStatusBadge } from '../components/Badges.jsx';
import { EmptyBlock, ErrorBlock, LoadingBlock, Spinner } from '../components/StateViews.jsx';
import { formatDateTime } from '../utils/formatters.js';

const emptyDevice = { deviceCode: '', deviceName: '', deviceType: 'integrated', location: '', status: 'offline' };
const typeNames = { xray: 'X 光安检仪', gas_sensor: '气体传感器', integrated: '多模态一体机', gateway: '通信网关', other: '其他设备' };

function DeviceModal({ device, busy, error, onClose, onSave }) {
  const [form, setForm] = useState(() => device ? {
    deviceCode: device.deviceCode || '', deviceName: device.deviceName || '', deviceType: device.deviceType || 'integrated',
    location: device.location || '', status: device.status || 'offline',
  } : emptyDevice);
  const [fieldError, setFieldError] = useState('');
  const submit = (event) => {
    event.preventDefault();
    if (!form.deviceCode.trim() || !form.deviceName.trim() || !form.location.trim()) { setFieldError('请填写设备编号、名称和位置。'); return; }
    onSave({ ...form, deviceCode: form.deviceCode.trim(), deviceName: form.deviceName.trim(), location: form.location.trim() });
  };
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
      <form className="modal modal--form" role="dialog" aria-modal="true" onSubmit={submit}>
        <div className="modal-heading"><div><span className="eyebrow">模拟设备</span><h2>{device ? '编辑设备' : '新增设备'}</h2></div><button type="button" className="modal-close" disabled={busy} onClick={onClose}>×</button></div>
        <div className="form-grid form-grid--2">
          <label className="field"><span>设备编号 <em>*</em></span><input value={form.deviceCode} disabled={Boolean(device)} onChange={(event) => setForm({ ...form, deviceCode: event.target.value })} placeholder="例如 XRY-001" /></label>
          <label className="field"><span>设备名称 <em>*</em></span><input value={form.deviceName} onChange={(event) => setForm({ ...form, deviceName: event.target.value })} placeholder="例如 1 号通道安检仪" /></label>
          <label className="field"><span>设备类型</span><select value={form.deviceType} onChange={(event) => setForm({ ...form, deviceType: event.target.value })}>{Object.entries(typeNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="field"><span>状态</span><select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}><option value="online">在线</option><option value="offline">离线</option><option value="warning">告警</option><option value="maintenance">维护中</option></select></label>
        </div>
        <label className="field"><span>安装位置 <em>*</em></span><input value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} placeholder="例如 北京南站 2 号安检通道" /></label>
        {(fieldError || error) && <div className="form-error"><span>!</span>{fieldError || error}</div>}
        <div className="modal-actions"><button type="button" className="button button--secondary" disabled={busy} onClick={onClose}>取消</button><button type="submit" className="button button--primary" disabled={busy}>{busy && <Spinner small />}{busy ? '正在保存…' : '保存设备'}</button></div>
      </form>
    </div>
  );
}

export default function DevicesPage() {
  const { user } = useAuth();
  const { revision } = useRealtime();
  const [devices, setDevices] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 10, total: 0, totalPages: 1 });
  const [query, setQuery] = useState({ page: 1, pageSize: 10, status: '', deviceType: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState(undefined);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);
  const [modalError, setModalError] = useState('');

  const loadDevices = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const payload = await deviceApi.list(query);
      setDevices(Array.isArray(payload.data) ? payload.data : []);
      setPagination(payload.pagination || { ...query, total: payload.data?.length || 0, totalPages: 1 });
    } catch (loadError) { setError(loadError.message); } finally { setLoading(false); }
  }, [query]);
  useEffect(() => { loadDevices(); }, [loadDevices, revision]);

  const saveDevice = async (form) => {
    setBusy(true); setModalError('');
    try {
      if (editing) await deviceApi.update(editing._id, form); else await deviceApi.create(form);
      setNotice(editing ? '设备信息已更新。' : '模拟设备已创建。'); setEditing(undefined); await loadDevices();
    } catch (saveError) { setModalError(saveError.message); } finally { setBusy(false); }
  };
  const deleteDevice = async () => {
    setBusy(true);
    try { await deviceApi.remove(deleting._id); setDeleting(null); setNotice('设备已删除。'); await loadDevices(); }
    catch (deleteError) { setError(deleteError.message); setDeleting(null); } finally { setBusy(false); }
  };
  const heartbeat = async (device) => {
    setBusy(true); setError('');
    try { await deviceApi.heartbeat(device._id); setNotice(`${device.deviceName || device.deviceCode} 的模拟心跳已更新。`); await loadDevices(); }
    catch (heartbeatError) { setError(heartbeatError.message); } finally { setBusy(false); }
  };
  const isAdmin = user?.role === 'admin';

  return (
    <div>
      <PageHeader title="设备管理" description="维护模拟安检仪、气体传感器和通信网关，查看最后心跳" actions={isAdmin && <button type="button" className="button button--primary" onClick={() => { setEditing(null); setModalError(''); }}>＋ 新增设备</button>} />
      {notice && <div className="notice notice--success">{notice}<button type="button" onClick={() => setNotice('')}>×</button></div>}
      <section className="filter-panel filter-panel--inline">
        <label className="field field--compact"><span>设备状态</span><select value={query.status} onChange={(event) => setQuery({ ...query, page: 1, status: event.target.value })}><option value="">全部状态</option><option value="online">在线</option><option value="offline">离线</option><option value="warning">告警</option><option value="maintenance">维护中</option></select></label>
        <label className="field field--compact"><span>设备类型</span><select value={query.deviceType} onChange={(event) => setQuery({ ...query, page: 1, deviceType: event.target.value })}><option value="">全部类型</option>{Object.entries(typeNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <button type="button" className="button button--ghost align-end" onClick={() => setQuery({ page: 1, pageSize: 10, status: '', deviceType: '' })}>重置</button>
      </section>
      <section className="panel table-panel">
        {loading ? <LoadingBlock /> : error ? <ErrorBlock message={error} onRetry={loadDevices} /> : devices.length === 0 ? <EmptyBlock title="暂无设备" description={isAdmin ? '创建第一台模拟设备以开始演示心跳。' : '管理员尚未配置设备。'} /> : <>
          <div className="table-wrap"><table><thead><tr><th>设备编号</th><th>设备名称</th><th>类型</th><th>位置</th><th>状态</th><th>最后心跳</th>{isAdmin && <th>操作</th>}</tr></thead><tbody>{devices.map((device) => <tr key={device._id}><td className="mono"><strong>{device.deviceCode}</strong></td><td>{device.deviceName}</td><td>{typeNames[device.deviceType] || device.deviceType}</td><td>{device.location || '—'}</td><td><DeviceStatusBadge status={device.effectiveStatus || device.status} possiblyOffline={device.possiblyOffline || device.heartbeatStale} /></td><td>{formatDateTime(device.lastHeartbeatAt)}{(device.possiblyOffline || device.heartbeatStale) && <small className="cell-subtitle danger-text">心跳超时</small>}</td>{isAdmin && <td><div className="table-actions"><button type="button" className="text-button" disabled={busy} onClick={() => heartbeat(device)}>模拟心跳</button><button type="button" className="text-button" onClick={() => { setEditing(device); setModalError(''); }}>编辑</button><button type="button" className="text-button text-button--danger" onClick={() => setDeleting(device)}>删除</button></div></td>}</tr>)}</tbody></table></div>
          <Pagination pagination={pagination} onPageChange={(page) => setQuery({ ...query, page })} onPageSizeChange={(pageSize) => setQuery({ ...query, page: 1, pageSize })} />
        </>}
      </section>
      {editing !== undefined && <DeviceModal device={editing} busy={busy} error={modalError} onClose={() => !busy && setEditing(undefined)} onSave={saveDevice} />}
      <ConfirmDialog open={Boolean(deleting)} title="删除这台模拟设备？" description={`设备 ${deleting?.deviceCode || ''} 将从设备列表移除。若已有检测记录引用它，后端会按数据完整性规则处理。`} confirmLabel="确认删除" danger busy={busy} onCancel={() => !busy && setDeleting(null)} onConfirm={deleteDevice} />
    </div>
  );
}
