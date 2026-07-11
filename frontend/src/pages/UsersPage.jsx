import { useCallback, useEffect, useState } from 'react';
import { userApi } from '../api/adminApi.js';
import { useAuth } from '../context/auth-context.js';
import PageHeader from '../components/PageHeader.jsx';
import Pagination from '../components/Pagination.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import { RoleBadge } from '../components/Badges.jsx';
import { EmptyBlock, ErrorBlock, LoadingBlock, Spinner } from '../components/StateViews.jsx';
import { formatDateTime, objectId } from '../utils/formatters.js';

const emptyUser = { username: '', email: '', password: '', role: 'viewer', isActive: true };

function UserModal({ account, isSelf = false, busy, error, onClose, onSave }) {
  const [form, setForm] = useState(() => account ? { username: account.username || '', email: account.email || '', password: '', role: account.role || 'viewer', isActive: account.isActive !== false } : emptyUser);
  const [fieldError, setFieldError] = useState('');
  const submit = (event) => {
    event.preventDefault(); setFieldError('');
    if (form.username.trim().length < 2) { setFieldError('用户名至少需要 2 个字符。'); return; }
    if (!/^\S+@\S+\.\S+$/.test(form.email)) { setFieldError('请输入有效邮箱地址。'); return; }
    if (!account && (!/^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(form.password))) { setFieldError('初始密码至少 8 位，并同时包含字母和数字。'); return; }
    if (account && form.password && !/^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(form.password)) { setFieldError('新密码至少 8 位，并同时包含字母和数字。'); return; }
    const payload = { ...form, username: form.username.trim(), email: form.email.trim().toLowerCase() };
    if (!payload.password) delete payload.password;
    onSave(payload);
  };
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
      <form className="modal modal--form" role="dialog" aria-modal="true" onSubmit={submit}>
        <div className="modal-heading"><div><span className="eyebrow">账号与权限</span><h2>{account ? '编辑用户' : '新增用户'}</h2></div><button type="button" className="modal-close" onClick={onClose} disabled={busy}>×</button></div>
        <div className="form-grid form-grid--2">
          <label className="field"><span>用户名 <em>*</em></span><input value={form.username} autoComplete="off" onChange={(event) => setForm({ ...form, username: event.target.value })} /></label>
          <label className="field"><span>邮箱 <em>*</em></span><input type="email" value={form.email} autoComplete="off" onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
          <label className="field"><span>{account ? '新密码（留空不修改）' : '初始密码'} {!account && <em>*</em>}</span><input type="password" value={form.password} autoComplete="new-password" onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder="至少 8 位，含字母和数字" /></label>
          <label className="field"><span>角色</span><select value={form.role} disabled={isSelf} onChange={(event) => setForm({ ...form, role: event.target.value })}><option value="admin">管理员</option><option value="inspector">安检员</option><option value="viewer">只读人员</option></select>{isSelf && <small>不能修改当前账号自己的角色</small>}</label>
        </div>
        <label className="checkbox checkbox--card"><input type="checkbox" checked={form.isActive} disabled={isSelf} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} /><span><strong>账号启用</strong><small>{isSelf ? '不能停用当前登录账号。' : '停用后该用户不能继续登录。'}</small></span></label>
        {(fieldError || error) && <div className="form-error"><span>!</span>{fieldError || error}</div>}
        <div className="modal-actions"><button type="button" className="button button--secondary" onClick={onClose} disabled={busy}>取消</button><button type="submit" className="button button--primary" disabled={busy}>{busy && <Spinner small />}{busy ? '正在保存…' : '保存用户'}</button></div>
      </form>
    </div>
  );
}

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 10, total: 0, totalPages: 1 });
  const [query, setQuery] = useState({ page: 1, pageSize: 10, role: '', isActive: '', keyword: '' });
  const [draftKeyword, setDraftKeyword] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState(undefined);
  const [deactivating, setDeactivating] = useState(null);
  const [busy, setBusy] = useState(false);
  const [modalError, setModalError] = useState('');

  const loadUsers = useCallback(async () => {
    setLoading(true); setError('');
    try { const payload = await userApi.list(query); setUsers(payload.data || []); setPagination(payload.pagination || { ...query, total: 0, totalPages: 1 }); }
    catch (loadError) { setError(loadError.message); } finally { setLoading(false); }
  }, [query]);
  useEffect(() => { loadUsers(); }, [loadUsers]);

  const saveUser = async (payload) => {
    setBusy(true); setModalError('');
    try {
      const changes = { ...payload };
      if (editing && objectId(editing) === objectId(currentUser)) { delete changes.role; delete changes.isActive; }
      if (editing) await userApi.update(editing._id, changes); else await userApi.create(changes);
      setNotice(editing ? '用户信息已更新。' : '用户账号已创建。'); setEditing(undefined); await loadUsers();
    }
    catch (saveError) { setModalError(saveError.message); } finally { setBusy(false); }
  };
  const deactivate = async () => {
    setBusy(true);
    try { await userApi.remove(deactivating._id); setNotice('用户账号已停用。'); setDeactivating(null); await loadUsers(); }
    catch (saveError) { setError(saveError.message); setDeactivating(null); } finally { setBusy(false); }
  };
  const currentId = objectId(currentUser);

  return (
    <div>
      <PageHeader title="用户管理" description="创建账号并配置管理员、安检员和只读人员权限" actions={<button type="button" className="button button--primary" onClick={() => { setEditing(null); setModalError(''); }}>＋ 新增用户</button>} />
      {notice && <div className="notice notice--success">{notice}<button type="button" onClick={() => setNotice('')}>×</button></div>}
      <form className="filter-panel filter-panel--inline" onSubmit={(event) => { event.preventDefault(); setQuery({ ...query, page: 1, keyword: draftKeyword.trim() }); }}>
        <label className="field field--compact"><span>搜索用户</span><input value={draftKeyword} onChange={(event) => setDraftKeyword(event.target.value)} placeholder="用户名或邮箱" /></label>
        <label className="field field--compact"><span>角色</span><select value={query.role} onChange={(event) => setQuery({ ...query, page: 1, role: event.target.value })}><option value="">全部角色</option><option value="admin">管理员</option><option value="inspector">安检员</option><option value="viewer">只读人员</option></select></label>
        <label className="field field--compact"><span>账号状态</span><select value={query.isActive} onChange={(event) => setQuery({ ...query, page: 1, isActive: event.target.value })}><option value="">全部状态</option><option value="true">启用</option><option value="false">停用</option></select></label>
        <button type="submit" className="button button--secondary align-end">查询</button>
        <button type="button" className="button button--ghost align-end" onClick={() => { setDraftKeyword(''); setQuery({ page: 1, pageSize: 10, role: '', isActive: '', keyword: '' }); }}>重置</button>
      </form>
      <section className="panel table-panel">
        {loading ? <LoadingBlock /> : error ? <ErrorBlock message={error} onRetry={loadUsers} /> : users.length === 0 ? <EmptyBlock title="暂无用户" /> : <>
          <div className="table-wrap"><table><thead><tr><th>用户</th><th>邮箱</th><th>角色</th><th>状态</th><th>最后登录</th><th>创建时间</th><th>操作</th></tr></thead><tbody>{users.map((account) => { const self = objectId(account) === currentId; return <tr key={account._id}><td><div className="identity-cell"><span>{(account.username || 'U').slice(0, 1).toUpperCase()}</span><div><strong>{account.username}</strong>{self && <small>当前账号</small>}</div></div></td><td>{account.email}</td><td><RoleBadge role={account.role} /></td><td><span className={`active-state active-state--${account.isActive !== false ? 'on' : 'off'}`}><i />{account.isActive !== false ? '启用' : '停用'}</span></td><td>{formatDateTime(account.lastLoginAt)}</td><td>{formatDateTime(account.createdAt)}</td><td><div className="table-actions"><button type="button" className="text-button" onClick={() => { setEditing(account); setModalError(''); }}>编辑</button>{account.isActive !== false && !self && <button type="button" className="text-button text-button--danger" onClick={() => setDeactivating(account)}>停用</button>}</div></td></tr>; })}</tbody></table></div>
          <Pagination pagination={pagination} onPageChange={(page) => setQuery({ ...query, page })} onPageSizeChange={(pageSize) => setQuery({ ...query, page: 1, pageSize })} />
        </>}
      </section>
      {editing !== undefined && <UserModal account={editing} isSelf={Boolean(editing && objectId(editing) === currentId)} busy={busy} error={modalError} onClose={() => !busy && setEditing(undefined)} onSave={saveUser} />}
      <ConfirmDialog open={Boolean(deactivating)} title="停用这个用户账号？" description={`停用后，${deactivating?.username || ''} 将无法继续登录。历史操作日志和关联记录会保留。`} confirmLabel="确认停用" danger busy={busy} onCancel={() => !busy && setDeactivating(null)} onConfirm={deactivate} />
    </div>
  );
}
