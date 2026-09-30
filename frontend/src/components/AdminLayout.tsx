import { useState, useEffect, type ReactNode } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase, type UserRole, type Order } from '@/lib/supabase';
import { playOrderChime } from '@/lib/audio';
import SavoryLogo from './SavoryLogo';
import {
  LayoutDashboard,
  ClipboardList,
  Utensils,
  Users,
  LogOut,
  Menu,
  X,
  ShoppingBag,
  ChevronDown,
  QrCode,
  Tag,
  Settings,
  Bell,
  Volume2,
  VolumeX,
  Package,
  BarChart3,
} from 'lucide-react';

export type AdminPage =
  | 'dashboard'
  | 'orders'
  | 'menu'
  | 'inventory'
  | 'reports'
  | 'coupons'
  | 'tables'
  | 'settings'
  | 'staff';

type NavItem = {
  id: AdminPage;
  label: string;
  icon: typeof LayoutDashboard;
  roles: UserRole[];
};

const navItems: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'manager', 'staff'] },
  { id: 'orders', label: 'Live Orders', icon: ClipboardList, roles: ['admin', 'manager', 'staff'] },
  { id: 'menu', label: 'Menu & Dishes', icon: Utensils, roles: ['admin', 'manager', 'staff'] },
  { id: 'inventory', label: 'Inventory & Stock', icon: Package, roles: ['admin', 'manager', 'staff'] },
  { id: 'reports', label: 'Sales Reports', icon: BarChart3, roles: ['admin', 'manager'] },
  { id: 'coupons', label: 'Promotions', icon: Tag, roles: ['admin', 'manager'] },
  { id: 'tables', label: 'QR Tables', icon: QrCode, roles: ['admin', 'manager', 'staff'] },
  { id: 'settings', label: 'Settings', icon: Settings, roles: ['admin', 'manager'] },
  { id: 'staff', label: 'Staff & Roles', icon: Users, roles: ['admin'] },
];

type Props = {
  currentPage: AdminPage;
  onPageChange: (page: AdminPage) => void;
  onExitToCustomer: () => void;
  children: ReactNode;
};

export default function AdminLayout({ currentPage, onPageChange, onExitToCustomer, children }: Props) {
  const { profile, signOut } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Realtime notification banner
  const [newOrderAlert, setNewOrderAlert] = useState<{
    orderNumber: string;
    customerName: string;
    total: number;
    paymentStatus: string;
  } | null>(null);

  // Setup Realtime listening for new orders
  useEffect(() => {
    const channel = supabase
      .channel('admin-realtime-orders')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders' },
        (payload) => {
          const newOrder = payload.new as Order;
          if (soundEnabled) {
            playOrderChime();
          }
          setNewOrderAlert({
            orderNumber: newOrder.order_number || `#SV-${newOrder.id.slice(0, 8)}`,
            customerName: newOrder.customer_name || 'Guest',
            total: Number(newOrder.total),
            paymentStatus: newOrder.payment_status || 'unpaid',
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [soundEnabled]);

  const visibleItems = navItems.filter((item) => profile && item.roles.includes(profile.role));

  const handleNav = (page: AdminPage) => {
    onPageChange(page);
    setSidebarOpen(false);
  };

  const roleBadge: Record<UserRole, { label: string; color: string }> = {
    admin: { label: 'Admin', color: 'bg-rose-500/20 text-rose-300 border-rose-500/30' },
    manager: { label: 'Manager', color: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
    staff: { label: 'Staff', color: 'bg-sky-500/20 text-sky-300 border-sky-500/30' },
    customer: { label: 'Customer', color: 'bg-slate-500/20 text-slate-300 border-slate-500/30' },
  };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Real-time Order Popup Alert */}
      {newOrderAlert && (
        <div className="fixed top-5 right-5 z-50 max-w-sm bg-slate-900 border-2 border-orange-500 text-white rounded-3xl p-4 shadow-2xl animate-bounce flex items-start gap-3">
          <div className="w-10 h-10 rounded-2xl bg-orange-500 text-white flex items-center justify-center shrink-0">
            <Bell className="w-5 h-5 animate-pulse" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-orange-400">
                🔔 New Order Placed!
              </span>
              <button
                onClick={() => setNewOrderAlert(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm font-bold text-white mt-0.5 truncate">
              {newOrderAlert.orderNumber} · {newOrderAlert.customerName}
            </p>
            <div className="flex items-center justify-between text-xs text-slate-300 mt-1">
              <span>Total: ${newOrderAlert.total.toFixed(2)}</span>
              <span className="uppercase text-amber-400 font-bold">{newOrderAlert.paymentStatus}</span>
            </div>
            <button
              onClick={() => {
                setNewOrderAlert(null);
                onPageChange('orders');
              }}
              className="mt-2 w-full py-1.5 bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs rounded-xl transition-colors"
            >
              View Order
            </button>
          </div>
        </div>
      )}

      {/* Sidebar — Desktop */}
      <aside className="hidden lg:flex w-64 flex-col bg-slate-950 fixed inset-y-0 left-0 z-40 border-r border-slate-800">
        <div className="flex items-center gap-3 px-6 h-18 border-b border-slate-800/80">
          <SavoryLogo size="sm" theme="dark" showSubtitle={true} />
        </div>

        <nav className="flex-1 px-3 py-5 space-y-1.5 overflow-y-auto">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const active = currentPage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNav(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                  active
                    ? 'bg-gradient-to-r from-amber-400 to-orange-500 text-slate-950 shadow-md shadow-orange-500/20'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Sidebar Footer */}
        <div className="px-3 py-4 border-t border-slate-800/80 space-y-1">
          {/* Sound Toggle */}
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="w-full flex items-center justify-between px-3.5 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-white/5 transition-all"
          >
            <span className="flex items-center gap-2">
              {soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4 text-slate-500" />}
              <span>Kitchen Alert Sound</span>
            </span>
            <span className={`text-[10px] font-bold uppercase ${soundEnabled ? 'text-emerald-400' : 'text-slate-500'}`}>
              {soundEnabled ? 'ON' : 'OFF'}
            </span>
          </button>

          <button
            onClick={onExitToCustomer}
            className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold text-slate-400 hover:text-white hover:bg-white/5 transition-all"
          >
            <ShoppingBag className="w-4 h-4" />
            Customer Ordering View
          </button>
          <button
            onClick={signOut}
            className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-all"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
          <aside className="relative w-64 flex-col bg-slate-950 flex animate-slide-in z-10 border-r border-slate-800">
            <div className="flex items-center justify-between px-6 h-18 border-b border-slate-800">
              <SavoryLogo size="sm" theme="dark" showSubtitle={true} />
              <button onClick={() => setSidebarOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
              {visibleItems.map((item) => {
                const Icon = item.icon;
                const active = currentPage === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleNav(item.id)}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                      active
                        ? 'bg-gradient-to-r from-amber-400 to-orange-500 text-slate-950 shadow-md shadow-orange-500/20'
                        : 'text-slate-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {item.label}
                  </button>
                );
              })}
            </nav>
            <div className="px-3 py-4 border-t border-slate-800 space-y-1">
              <button
                onClick={onExitToCustomer}
                className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold text-slate-400 hover:text-white hover:bg-white/5"
              >
                <ShoppingBag className="w-4 h-4" />
                Customer View
              </button>
              <button
                onClick={signOut}
                className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold text-slate-400 hover:text-rose-400 hover:bg-rose-500/10"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 lg:ml-64 flex flex-col min-w-0">
        {/* Top Navbar */}
        <header className="h-18 bg-white border-b border-slate-200 flex items-center justify-between px-4 lg:px-8 sticky top-0 z-30 shadow-xs">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden text-slate-600 hover:text-slate-900 p-2 -ml-2 rounded-xl hover:bg-slate-100"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div>
              <h2 className="text-base font-extrabold text-slate-900 capitalize">
                {navItems.find((n) => n.id === currentPage)?.label || currentPage}
              </h2>
              <span className="text-[10px] text-slate-400 hidden sm:block">
                Savory Operations Management
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-2.5 pl-2 pr-3 py-1.5 rounded-2xl hover:bg-slate-100 transition-colors border border-slate-200"
              >
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-slate-950 text-xs font-black shadow-xs">
                  {profile?.full_name?.charAt(0).toUpperCase() || 'A'}
                </div>
                <div className="hidden sm:block text-left">
                  <div className="text-xs font-bold text-slate-900 leading-tight">
                    {profile?.full_name || 'Staff User'}
                  </div>
                  <div className="text-[10px] text-orange-600 uppercase font-bold leading-tight">
                    {profile?.role || 'Staff'}
                  </div>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>

              {userMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
                  <div className="absolute right-0 mt-2 w-56 bg-white rounded-2xl shadow-xl border border-slate-200 z-50 overflow-hidden animate-fade-in">
                    <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50">
                      <div className="text-xs font-bold text-slate-900">{profile?.full_name}</div>
                      {profile && (
                        <span
                          className={`inline-flex mt-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold border uppercase ${
                            roleBadge[profile.role]?.color || ''
                          }`}
                        >
                          {profile.role}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        onExitToCustomer();
                        setUserMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                      <ShoppingBag className="w-4 h-4 text-orange-500" />
                      Customer View
                    </button>
                    <button
                      onClick={() => {
                        signOut();
                        setUserMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      Sign Out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-8 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
