import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import { FullPageLoader } from './components/StateViews.jsx';

const DashboardPage = lazy(() => import('./pages/DashboardPage.jsx'));
const InspectionsPage = lazy(() => import('./pages/InspectionsPage.jsx'));
const NewInspectionPage = lazy(() => import('./pages/NewInspectionPage.jsx'));
const InspectionDetailPage = lazy(() => import('./pages/InspectionDetailPage.jsx'));
const AlarmsPage = lazy(() => import('./pages/AlarmsPage.jsx'));
const DevicesPage = lazy(() => import('./pages/DevicesPage.jsx'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage.jsx'));

export default function App() {
  return (
    <Suspense fallback={<FullPageLoader label="正在加载页面…" />}><Routes>
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route element={<Layout />}>
        <Route index element={<NewInspectionPage />} />
        <Route path="overview" element={<DashboardPage />} />
        <Route path="inspections" element={<InspectionsPage />} />
        <Route path="inspections/new" element={<Navigate to="/" replace />} />
        <Route path="inspections/:id" element={<InspectionDetailPage />} />
        <Route path="alarms" element={<AlarmsPage />} />
        <Route path="devices" element={<DevicesPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes></Suspense>
  );
}
