import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/auth-context.js';
import { Spinner } from '../components/StateViews.jsx';

export default function LoginPage() {
  const { login, isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ account: '', password: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!loading && isAuthenticated) return <Navigate to="/" replace />;

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    if (!form.account.trim() || !form.password) {
      setError('请输入账号和密码。');
      return;
    }
    setSubmitting(true);
    try {
      const account = form.account.trim();
      const credentials = account.includes('@')
        ? { email: account, password: form.password }
        : { username: account, password: form.password };
      await login(credentials);
      const target = location.state?.from?.pathname || '/';
      navigate(target, { replace: true });
    } catch (submitError) {
      setError(submitError.message || '登录失败，请检查账号和密码。');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="login-page">
      <section className="login-intro">
        <div className="login-brand"><span>RA</span> Railway Assist</div>
        <div className="login-copy">
          <span className="login-kicker">多模态融合感知 · 软件原型</span>
          <h1>铁路安检判图<br />辅助决策系统</h1>
          <p>统一呈现 YOLO 视觉检测、气体通信和设备状态，同时保留离线演示模式，帮助安检人员完成风险复核与报警处置。</p>
          <div className="login-principle"><strong>辅助决策，不替代人工判断</strong><span>所有结果均需由安检人员复核</span></div>
        </div>
        <div className="login-grid" aria-hidden="true" />
      </section>
      <section className="login-panel">
        <form className="login-card" onSubmit={handleSubmit} noValidate>
          <div className="login-card-header">
            <span className="login-mobile-mark">RA</span>
            <h2>登录系统</h2>
            <p>使用已创建的系统账号继续</p>
          </div>
          {error && <div className="form-error" role="alert"><span>!</span>{error}</div>}
          <label className="field">
            <span>账号</span>
            <input
              autoFocus
              autoComplete="username"
              value={form.account}
              onChange={(event) => setForm((current) => ({ ...current, account: event.target.value }))}
              placeholder="用户名或邮箱"
              disabled={submitting}
            />
          </label>
          <label className="field">
            <span>密码</span>
            <input
              type="password"
              autoComplete="current-password"
              value={form.password}
              onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
              placeholder="请输入密码"
              disabled={submitting}
            />
          </label>
          <button type="submit" className="button button--primary button--large button--full" disabled={submitting}>
            {submitting && <Spinner small />}{submitting ? '正在登录…' : '登录'}
          </button>
          <div className="login-demo-note">
            <strong>演示账号</strong>
            <span>请先运行初始化数据命令，账号信息会显示在命令输出中。</span>
          </div>
          <p className="login-disclaimer">系统支持真实服务与模拟数据；检测结果仅用于辅助决策，必须由安检人员复核。</p>
        </form>
      </section>
    </main>
  );
}
