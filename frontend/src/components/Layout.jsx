import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/auth-context.js';
import { useRealtime } from '../context/realtime-context.js';
import { objectId, roleLabel } from '../utils/formatters.js';

const navigation = [
  { to: '/', label: '运行总览', icon: '▦', end: true },
  { to: '/inspections', label: '检测记录', icon: '⌕' },
  { to: '/alarms', label: '报警中心', icon: '!' },
  { to: '/devices', label: '设备管理', icon: '◇' },
  { to: '/users', label: '用户管理', icon: '♙', roles: ['admin'] },
  { to: '/logs', label: '操作日志', icon: '≡', roles: ['admin'] },
];

const connectionText = {
  connected: '已连接',
  connecting: '正在连接',
  reconnecting: '正在重连',
  disconnected: '已断开',
};

export default function Layout() {
  const { user, logout } = useAuth();
  const { status, highAlarm, dismissHighAlarm } = useRealtime();
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };
  const inspectionId = objectId(highAlarm?.inspectionId ?? highAlarm?.inspection);

  return (
    <div className="app-shell">
      <aside className={`sidebar${menuOpen ? ' sidebar--open' : ''}`}>
        <div className="brand">
          <div className="brand-mark">RA</div>
          <div>
            <strong>铁路安检辅助决策</strong>
            <span>演示与研究系统</span>
          </div>
        </div>
        <nav className="main-nav" aria-label="主导航">
          {navigation.filter((item) => !item.roles || item.roles.includes(user?.role)).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `nav-item${isActive ? ' nav-item--active' : ''}`}
              onClick={() => setMenuOpen(false)}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="simulation-label"><span>HYBRID</span> 真实 / 模拟双模式</div>
          <p>支持模型与气体通信接入；所有结论仍需由安检人员现场复核。</p>
        </div>
      </aside>

      {menuOpen && <button type="button" className="sidebar-scrim" aria-label="关闭菜单" onClick={() => setMenuOpen(false)} />}

      <div className="app-main">
        <header className="topbar">
          <button type="button" className="menu-button" aria-label="打开菜单" onClick={() => setMenuOpen(true)}>☰</button>
          <div className="topbar-context">
            <span className="topbar-eyebrow">当前模块</span>
            <strong>{navigation.find((item) => item.to === location.pathname)?.label || (location.pathname.startsWith('/inspections') ? '检测记录' : '系统')}</strong>
          </div>
          <div className="topbar-spacer" />
          <div className={`connection connection--${status}`} title="Socket.IO 实时连接状态">
            <span className="connection-dot" />{connectionText[status] || '已断开'}
          </div>
          <div className="user-block">
            <div className="user-avatar">{(user?.username || user?.email || 'U').slice(0, 1).toUpperCase()}</div>
            <div><strong>{user?.username || user?.email}</strong><span>{roleLabel(user?.role)}</span></div>
          </div>
          <button type="button" className="button button--ghost button--small" onClick={handleLogout}>退出登录</button>
        </header>

        <div className="simulation-banner">
          <strong>运行提示</strong>
          检测可使用真实服务或模拟数据；无论来源如何，所有风险结论均需由安检人员复核。
        </div>

        <main className="content"><Outlet /></main>
      </div>

      {highAlarm && (
        <aside className="alarm-toast" role="alert">
          <button type="button" className="toast-close" aria-label="关闭提示" onClick={dismissHighAlarm}>×</button>
          <div className="toast-icon">!</div>
          <div>
            <strong>收到新的高风险报警</strong>
            <p>{highAlarm.title || highAlarm.description || '请及时查看记录并进行人工复核。'}</p>
            {inspectionId ? <Link to={`/inspections/${inspectionId}`} onClick={dismissHighAlarm}>查看检测详情 →</Link> : <Link to="/alarms" onClick={dismissHighAlarm}>进入报警中心 →</Link>}
          </div>
        </aside>
      )}
    </div>
  );
}
