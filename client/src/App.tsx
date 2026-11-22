import { Suspense, lazy, useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { api } from './lib/api';
import CustomerMenu from './pages/customer/CustomerMenu';
// الشاشات الثقيلة تُحمَّل كسولًا (D8) — تقسيم الحزمة وتسريع الإقلاع
const DashMenu = lazy(() => import('./pages/dash/DashMenu'));
const DashTables = lazy(() => import('./pages/dash/DashTables'));
const DashSettings = lazy(() => import('./pages/dash/DashSettings'));
const DashStaff = lazy(() => import('./pages/dash/DashStaff'));
const DashAnalytics = lazy(() => import('./pages/dash/DashAnalytics'));
const KitchenDisplay = lazy(() => import('./pages/dash/KitchenDisplay'));
const AdminPanel = lazy(() => import('./pages/admin/AdminPanel'));
import CartPage from './pages/customer/CartPage';
import OrderStatus from './pages/customer/OrderStatus';
import DashLogin from './pages/dash/DashLogin';
import DashLayout from './pages/dash/DashLayout';
import DashOrders from './pages/dash/DashOrders';
import LegalPage from './pages/LegalPage';

export default function App() {
  // الدومين المخصص (MKT-02): الزبون يمسح QR على cafe.example.com فيصل للجذر —
  // نحسم المحل من Host عبر /api/public/resolve ونوجه لمنيوه فورًا. الجذر عادي → تسجيل الدخول كما هو.
  useEffect(() => {
    if (window.location.pathname !== '/') return;
    api<{ slug: string }>('/api/public/resolve')
      .then((r) => {
        if (r?.slug) window.location.replace(`/${r.slug}`);
      })
      .catch(() => {});
  }, []);
  return (
    <Suspense
      fallback={
        <div className="grid min-h-dvh place-items-center bg-[#f5f5f7]">
          <span className="h-9 w-9 animate-spin rounded-full border-[3px] border-stone-200 border-t-teal-700" />
        </div>
      }
    >
    <Routes>
      <Route path="/" element={<Navigate to="/dash" replace />} />
      <Route path="/dash/login" element={<DashLogin />} />
      <Route path="/dash/kds" element={<KitchenDisplay />} />
      <Route path="/dash" element={<DashLayout />}>
        <Route index element={<DashOrders />} />
        <Route path="menu" element={<DashMenu />} />
        <Route path="tables" element={<DashTables />} />
        <Route path="settings" element={<DashSettings />} />
        <Route path="staff" element={<DashStaff />} />
        <Route path="analytics" element={<DashAnalytics />} />
      </Route>
      <Route path="/admin" element={<AdminPanel />} />
      {/* صفحات قانونية عامة (D6) */}
      <Route path="/privacy" element={<LegalPage />} />
      <Route path="/terms" element={<LegalPage />} />
      {/* العميل: /{shop-slug}/t/{table} حسب المواصفات */}
      <Route path="/:slug" element={<CustomerMenu />} />
      <Route path="/:slug/t/:table" element={<CustomerMenu />} />
      <Route path="/:slug/cart" element={<CartPage />} />
      <Route path="/:slug/o/:orderId" element={<OrderStatus />} />
      <Route path="*" element={<Navigate to="/dash" replace />} />
    </Routes>
    </Suspense>
  );
}
