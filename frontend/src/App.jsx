import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import { FullPageLoader } from './components/StateViews.jsx';

const LoginPage = lazy(() => import('./pages/LoginPage.jsx'));
const DashboardPage = lazy(() => import('./pages/DashboardPage.jsx'));
const InspectionsPage = lazy(() => import('./pages/InspectionsPage.jsx'));
const NewInspectionPage = lazy(() => import('./pages/NewInspectionPage.jsx'));
const InspectionDetailPage = lazy(() => import('./pages/InspectionDetailPage.jsx'));
const AlarmsPage = lazy(() => import('./pages/AlarmsPage.jsx'));
const DevicesPage = lazy(() => import('./pages/DevicesPage.jsx'));
const UsersPage = lazy(() => import('./pages/UsersPage.jsx'));
const LogsPage = lazy(() => import('./pages/LogsPage.jsx'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage.jsx'));

export default function App() {
  return (
    <Suspense fallback={<FullPageLoader label="正在加载页面…" />}><Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route index element={<DashboardPage />} />
          <Route path="inspections" element={<InspectionsPage />} />
          <Route path="inspections/:id" element={<InspectionDetailPage />} />
          <Route path="alarms" element={<AlarmsPage />} />
          <Route path="devices" element={<DevicesPage />} />
          <Route element={<ProtectedRoute roles={['admin', 'inspector']} />}>
            <Route path="inspections/new" element={<NewInspectionPage />} />
          </Route>
          <Route element={<ProtectedRoute roles={['admin']} />}>
            <Route path="users" element={<UsersPage />} />
            <Route path="logs" element={<LogsPage />} />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes></Suspense>
  );
}
