import { Navigate, Route, Routes } from 'react-router-dom';
import CustomerMenu from './pages/customer/CustomerMenu';
import CartPage from './pages/customer/CartPage';
import OrderStatus from './pages/customer/OrderStatus';
import DashLogin from './pages/dash/DashLogin';
import DashLayout from './pages/dash/DashLayout';
import DashOrders from './pages/dash/DashOrders';
import KitchenDisplay from './pages/dash/KitchenDisplay';
import DashMenu from './pages/dash/DashMenu';
import DashTables from './pages/dash/DashTables';
import DashSettings from './pages/dash/DashSettings';
import DashStaff from './pages/dash/DashStaff';
import AdminPanel from './pages/admin/AdminPanel';
import DashAnalytics from './pages/dash/DashAnalytics';
import LegalPage from './pages/LegalPage';

export default function App() {
  return (
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
  );
}
