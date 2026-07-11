export function Spinner({ small = false }) {
  return <span className={`spinner${small ? ' spinner--small' : ''}`} aria-hidden="true" />;
}

export function FullPageLoader({ label = '正在加载…' }) {
  return (
    <div className="full-page-state" role="status">
      <Spinner />
      <p>{label}</p>
    </div>
  );
}

export function LoadingBlock({ label = '正在加载数据…' }) {
  return (
    <div className="state-block" role="status">
      <Spinner />
      <p>{label}</p>
    </div>
  );
}

export function ErrorBlock({ message = '数据加载失败', onRetry }) {
  return (
    <div className="state-block state-block--error" role="alert">
      <span className="state-icon">!</span>
      <div>
        <strong>暂时无法显示</strong>
        <p>{message}</p>
      </div>
      {onRetry && (
        <button type="button" className="button button--secondary button--small" onClick={onRetry}>
          重新加载
        </button>
      )}
    </div>
  );
}

export function EmptyBlock({ title = '暂无数据', description = '当前筛选条件下没有可显示的记录。', action }) {
  return (
    <div className="state-block state-block--empty">
      <span className="state-icon state-icon--muted">○</span>
      <div>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}

export function InlineNotice({ type = 'info', children }) {
  return <div className={`notice notice--${type}`}>{children}</div>;
}
