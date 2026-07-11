import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <main className="not-found">
      <span>404</span>
      <h1>页面未找到</h1>
      <p>该地址不存在，或您没有访问它的权限。</p>
      <Link to="/" className="button button--primary">返回运行总览</Link>
    </main>
  );
}
