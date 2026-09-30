import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from '@/lib/auth';
import AuthPage from '@/pages/AuthPage';
import AdminLayout, { type AdminPage } from '@/components/AdminLayout';
import DashboardPage from '@/pages/DashboardPage';
import OrdersPage from '@/pages/OrdersPage';
import MenuPage from '@/pages/MenuPage';
import StaffPage from '@/pages/StaffPage';
import CouponsPage from '@/pages/CouponsPage';
import TablesPage from '@/pages/TablesPage';
import InventoryPage from '@/pages/InventoryPage';
import ReportsPage from '@/pages/ReportsPage';
import RestaurantSettingsPage from '@/pages/RestaurantSettingsPage';
import CustomerPage from '@/pages/CustomerPage';
import PublicOrderPage from '@/pages/PublicOrderPage';
import TelegramMiniAppPage from '@/pages/TelegramMiniAppPage';
import { isTelegramWebApp } from '@/lib/telegram';

function AppContent() {
  const { session, profile, loading } = useAuth();
  const [adminView, setAdminView] = useState(false);
  const [adminPage, setAdminPage] = useState<AdminPage>('dashboard');
  const [isPublicOrder, setIsPublicOrder] = useState(false);
  const [isTelegram, setIsTelegram] = useState(false);

  useEffect(() => {
    const path = window.location.pathname;
    const search = window.location.search;
    if (
      isTelegramWebApp() ||
      path.startsWith('/tg') ||
      path.startsWith('/miniapp') ||
      search.includes('tgWebApp=true')
    ) {
      setIsTelegram(true);
    } else if (path === '/order' || path === '/menu') {
      setIsPublicOrder(true);
    } else {
      setIsPublicOrder(false);
    }
  }, []);

  // Telegram Mini App mode (runs inside Telegram without login barrier)
  if (isTelegram) {
    return <TelegramMiniAppPage />;
  }

  // Public ordering page — no auth required
  if (isPublicOrder) {
    return <PublicOrderPage />;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <img src="/logo.png" alt="Savory" className="w-16 h-16 rounded-2xl object-cover drop-shadow-lg animate-pulse" />
          <div className="w-6 h-6 border-2 border-slate-200 border-t-orange-500 rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  // Not signed in — show auth page
  if (!session) {
    return <AuthPage />;
  }

  // Signed in but no profile yet — show loading
  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-slate-300 border-t-orange-500 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-500">Loading your profile...</p>
        </div>
      </div>
    );
  }

  const isAdminOrStaff = profile.role === 'admin' || profile.role === 'manager' || profile.role === 'staff';

  // Admin/manager/staff viewing the dashboard
  if (adminView && isAdminOrStaff) {
    return (
      <AdminLayout
        currentPage={adminPage}
        onPageChange={setAdminPage}
        onExitToCustomer={() => setAdminView(false)}
      >
        {adminPage === 'dashboard' && <DashboardPage />}
        {adminPage === 'orders' && <OrdersPage />}
        {adminPage === 'menu' && <MenuPage />}
        {adminPage === 'inventory' && <InventoryPage />}
        {adminPage === 'reports' && (profile.role === 'admin' || profile.role === 'manager') && <ReportsPage />}
        {adminPage === 'coupons' && (profile.role === 'admin' || profile.role === 'manager') && <CouponsPage />}
        {adminPage === 'tables' && <TablesPage />}
        {adminPage === 'settings' && (profile.role === 'admin' || profile.role === 'manager') && <RestaurantSettingsPage />}
        {adminPage === 'staff' && profile.role === 'admin' && <StaffPage />}
      </AdminLayout>
    );
  }

  // Customer view (default for all signed-in users)
  return (
    <CustomerPage
      onGoToAdmin={isAdminOrStaff ? () => {
        setAdminPage('dashboard');
        setAdminView(true);
      } : undefined}
    />
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
