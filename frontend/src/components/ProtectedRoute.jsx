import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/auth-context.js';
import { FullPageLoader } from './StateViews.jsx';

export default function ProtectedRoute({ roles }) {
  const { loading, isAuthenticated, user } = useAuth();
  const location = useLocation();
  if (loading) return <FullPageLoader label="正在验证登录状态…" />;
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location }} />;
  if (roles && !roles.includes(user?.role)) return <Navigate to="/" replace />;
  return <Outlet />;
}
