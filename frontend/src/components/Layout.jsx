import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { detectionApi } from '../api/detectionApi.js';
import { useRealtime } from '../context/realtime-context.js';
import { objectId } from '../utils/formatters.js';

const navigation = [
  { to: '/', label: '智能安检', icon: '▣', end: true },
  { to: '/inspections', label: '检测记录', icon: '⌕' },
];

const routeTitles = [
  ['/inspections/new', '智能安检工作台'],
  ['/inspections/', '检测详情'],
  ['/inspections', '检测记录'],
  ['/overview', '运行总览'],
  ['/alarms', '报警中心'],
  ['/devices', '设备管理'],
];

function serviceTone(ready, loading) {
  if (loading) return 'checking';
  return ready ? 'online' : 'offline';
}

export default function Layout() {
  const { highAlarm, dismissHighAlarm } = useRealtime();
  const [menuOpen, setMenuOpen] = useState(false);
  const [serviceStatus, setServiceStatus] = useState(null);
  const [serviceChecked, setServiceChecked] = useState(false);
  const [clock, setClock] = useState(() => new Date());
  const location = useLocation();
  const inspectionId = objectId(highAlarm?.inspectionId ?? highAlarm?.inspection);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const next = await detectionApi.status();
        if (active) setServiceStatus(next);
      } catch {
        if (active) setServiceStatus(null);
      } finally {
        if (active) setServiceChecked(true);
      }
    };
    load();
    const statusTimer = window.setInterval(load, 15_000);
    const clockTimer = window.setInterval(() => setClock(new Date()), 1_000);
    return () => {
      active = false;
      window.clearInterval(statusTimer);
      window.clearInterval(clockTimer);
    };
  }, []);

  const yoloReady = serviceStatus?.yolo?.status === 'online' && serviceStatus?.yolo?.modelLoaded;
  const gasReady = serviceStatus?.gas?.connectionStatus === 'online';
  const databaseReady = serviceStatus?.database?.connected === true;
  const loadingServices = !serviceChecked;
  const currentTitle = location.pathname === '/'
    ? '智能安检工作台'
    : routeTitles.find(([prefix]) => location.pathname.startsWith(prefix))?.[1] || '系统';
  const currentTime = new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(clock).replaceAll('/', '-');

  return (
    <div className="app-shell">
      <aside className={`sidebar${menuOpen ? ' sidebar--open' : ''}`}>
        <div className="brand">
          <div className="brand-mark">安</div>
          <div>
            <strong>智能安检工作台</strong>
            <span>铁路安防融合研判系统</span>
          </div>
        </div>
        <nav className="main-nav" aria-label="主导航">
          {navigation.map((item) => (
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
          <div className="simulation-label"><span>LIVE</span> 实时融合监测</div>
          <p>原有运行总览、报警和设备页面已收进高级设置，路由与数据均保留。</p>
        </div>
      </aside>

      {menuOpen && <button type="button" className="sidebar-scrim" aria-label="关闭菜单" onClick={() => setMenuOpen(false)} />}

      <div className="app-main">
        <header className="topbar">
          <button type="button" className="menu-button" aria-label="打开菜单" onClick={() => setMenuOpen(true)}>☰</button>
          <div className="topbar-context">
            <span className="topbar-eyebrow">当前模块</span>
            <strong>{currentTitle}</strong>
          </div>
          <div className="topbar-spacer" />
          <div className="service-strip" aria-label="接入服务状态">
            <div className={`service-chip service-chip--${serviceTone(yoloReady, loadingServices)}`}><span />YOLO <strong>{loadingServices ? '检查中' : yoloReady ? '在线' : '离线'}</strong></div>
            <div className={`service-chip service-chip--${serviceTone(gasReady, loadingServices)}`}><span />气体传感器 <strong>{loadingServices ? '检查中' : gasReady ? '已连接' : '未连接'}</strong></div>
            <div className={`service-chip service-chip--${serviceTone(databaseReady, loadingServices)}`}><span />数据库 <strong>{loadingServices ? '检查中' : databaseReady ? '正常' : '异常'}</strong></div>
          </div>
          <Link className="topbar-settings" to="/?settings=1" aria-label="打开高级设置">⚙ <span>高级设置</span></Link>
          <time className="topbar-clock" dateTime={clock.toISOString()}>{currentTime}</time>
        </header>

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
