import { useEffect, useState, useCallback } from 'react';
import { supabase, type Order, type OrderItem, type MenuItem, type OrderStatus } from '@/lib/supabase';
import {
  ClipboardList,
  Clock,
  CheckCircle2,
  XCircle,
  TrendingUp,
  DollarSign,
  Utensils,
  Truck,
  Store,
  CreditCard,
  QrCode,
  Banknote,
  Package,
  Calendar,
  Sparkles,
} from 'lucide-react';

interface Stats {
  totalOrders: number;
  pending: number;
  confirmed: number;
  preparing: number;
  ready: number;
  outForDelivery: number;
  completed: number;
  cancelled: number;
  pendingPayments: number;
  revenueToday: number;
  revenueWeek: number;
  revenueMonth: number;
  totalRevenue: number;
  todayOrders: number;
  avgOrderValue: number;
  deliveryCount: number;
  pickupCount: number;
  dineInCount: number;
  cashCount: number;
  khqrCount: number;
  cardCount: number;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [topItems, setTopItems] = useState<{ name: string; count: number; revenue: number }[]>([]);
  const [loading, setLoading] = useState(true);

  const loadDashboard = useCallback(async () => {
    try {
      const [{ data: rawOrders }, { data: orderItems }, { data: menuItems }] = await Promise.all([
        supabase.from('orders').select('*').order('created_at', { ascending: false }),
        supabase.from('order_items').select('*'),
        supabase.from('menu_items').select('id, name'),
      ]);

      const orders: Order[] = (rawOrders as Order[]) || [];
      const now = new Date();
      const todayStr = now.toISOString().split('T')[0];
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const todayOrders = orders.filter((o) => o.created_at.startsWith(todayStr));
      const weekOrders = orders.filter((o) => new Date(o.created_at) >= sevenDaysAgo);
      const monthOrders = orders.filter((o) => new Date(o.created_at) >= thirtyDaysAgo);

      const nonCancelledOrders = orders.filter((o) => o.status !== 'cancelled');
      const totalRev = nonCancelledOrders.reduce((sum, o) => sum + Number(o.total), 0);
      const avgValue = nonCancelledOrders.length > 0 ? totalRev / nonCancelledOrders.length : 0;

      setStats({
        totalOrders: orders.length,
        pending: orders.filter((o) => o.status === 'pending').length,
        confirmed: orders.filter((o) => o.status === 'confirmed').length,
        preparing: orders.filter((o) => o.status === 'preparing').length,
        ready: orders.filter((o) => o.status === 'ready').length,
        outForDelivery: orders.filter((o) => o.status === 'out_for_delivery').length,
        completed: orders.filter((o) => o.status === 'completed' || o.status === 'delivered').length,
        cancelled: orders.filter((o) => o.status === 'cancelled').length,
        pendingPayments: orders.filter((o) => o.payment_status === 'pending' || o.payment_status === 'unpaid').length,
        revenueToday: todayOrders
          .filter((o) => o.status !== 'cancelled')
          .reduce((sum, o) => sum + Number(o.total), 0),
        revenueWeek: weekOrders
          .filter((o) => o.status !== 'cancelled')
          .reduce((sum, o) => sum + Number(o.total), 0),
        revenueMonth: monthOrders
          .filter((o) => o.status !== 'cancelled')
          .reduce((sum, o) => sum + Number(o.total), 0),
        totalRevenue: totalRev,
        todayOrders: todayOrders.length,
        avgOrderValue: avgValue,
        deliveryCount: orders.filter((o) => o.order_type === 'delivery').length,
        pickupCount: orders.filter((o) => o.order_type === 'pickup').length,
        dineInCount: orders.filter((o) => o.order_type === 'dine_in').length,
        cashCount: orders.filter((o) => (o.payment_method || 'cash') === 'cash').length,
        khqrCount: orders.filter((o) => o.payment_method === 'khqr').length,
        cardCount: orders.filter((o) => o.payment_method === 'card').length,
      });

      setRecentOrders(orders.slice(0, 7));

      // Calculate Top Ordered Dishes
      if (orderItems && menuItems) {
        const menuMap = new Map((menuItems as MenuItem[]).map((m) => [m.id, m.name]));
        const countMap = new Map<string, { name: string; count: number; revenue: number }>();

        for (const item of (orderItems as OrderItem[])) {
          const name = menuMap.get(item.menu_item_id) || 'Item';
          const existing = countMap.get(item.menu_item_id) || { name, count: 0, revenue: 0 };
          existing.count += item.quantity;
          existing.revenue += Number(item.unit_price) * item.quantity;
          countMap.set(item.menu_item_id, existing);
        }

        const sorted = Array.from(countMap.values())
          .sort((a, b) => b.count - a.count)
          .slice(0, 5);
        setTopItems(sorted);
      }
    } catch (err) {
      console.error('Dashboard load error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
    const interval = setInterval(loadDashboard, 15000);
    return () => clearInterval(interval);
  }, [loadDashboard]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <div className="w-10 h-10 border-3 border-orange-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-xs font-semibold text-slate-400">Loading analytics &amp; statistics...</p>
      </div>
    );
  }

  const primaryCards = [
    {
      label: "Today's Orders",
      value: stats?.todayOrders ?? 0,
      icon: ClipboardList,
      gradient: 'from-amber-400 to-orange-500',
    },
    {
      label: "Today's Revenue",
      value: `$${(stats?.revenueToday ?? 0).toFixed(2)}`,
      icon: DollarSign,
      gradient: 'from-emerald-400 to-teal-500',
    },
    {
      label: 'Average Order Value',
      value: `$${(stats?.avgOrderValue ?? 0).toFixed(2)}`,
      icon: TrendingUp,
      gradient: 'from-sky-400 to-blue-500',
    },
    {
      label: 'Pending Orders',
      value: (stats?.pending ?? 0) + (stats?.preparing ?? 0),
      icon: Clock,
      gradient: 'from-rose-400 to-orange-500',
    },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">Executive Dashboard</h2>
          <p className="text-xs text-slate-500 mt-0.5">Real-time restaurant performance metrics and live kitchen pipeline</p>
        </div>
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-orange-50 text-orange-700 text-xs font-bold border border-orange-200">
          <Sparkles className="w-3.5 h-3.5 text-orange-500" /> Auto-updates with Supabase
        </div>
      </div>

      {/* Primary 4 Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {primaryCards.map((c) => {
          const Icon = c.icon;
          return (
            <div
              key={c.label}
              className="bg-white rounded-3xl border border-slate-200/90 p-5 shadow-xs hover:shadow-md transition-shadow"
            >
              <div
                className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${c.gradient} flex items-center justify-center text-slate-950 mb-3 shadow-md shadow-orange-500/10`}
              >
                <Icon className="w-5 h-5" />
              </div>
              <div className="text-2xl font-black text-slate-900">{c.value}</div>
              <div className="text-xs font-semibold text-slate-400 mt-1">{c.label}</div>
            </div>
          );
        })}
      </div>

      {/* Revenue Range Breakdown */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-900 text-white rounded-3xl p-5 border border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>This Week's Revenue</span>
            <Calendar className="w-4 h-4 text-orange-400" />
          </div>
          <div className="text-2xl font-black text-white mt-2">
            ${(stats?.revenueWeek ?? 0).toFixed(2)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Last 7 days total sales</div>
        </div>

        <div className="bg-slate-900 text-white rounded-3xl p-5 border border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>This Month's Revenue</span>
            <Calendar className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-black text-white mt-2">
            ${(stats?.revenueMonth ?? 0).toFixed(2)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Last 30 days total sales</div>
        </div>

        <div className="bg-slate-900 text-white rounded-3xl p-5 border border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>All-Time Gross Sales</span>
            <DollarSign className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-white mt-2">
            ${(stats?.totalRevenue ?? 0).toFixed(2)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Across all completed orders</div>
        </div>
      </div>

      {/* Kitchen Pipeline Status Breakdown */}
      <div className="bg-white rounded-3xl border border-slate-200/90 p-6 shadow-xs">
        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4">
          Live Kitchen &amp; Fulfillment Pipeline
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
            <Clock className="w-5 h-5 text-amber-600 mb-2" />
            <div className="text-2xl font-black text-amber-900">{stats?.pending ?? 0}</div>
            <div className="text-xs font-bold text-amber-700">Pending</div>
          </div>
          <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4">
            <CheckCircle2 className="w-5 h-5 text-indigo-600 mb-2" />
            <div className="text-2xl font-black text-indigo-900">{stats?.confirmed ?? 0}</div>
            <div className="text-xs font-bold text-indigo-700">Confirmed</div>
          </div>
          <div className="bg-sky-50 border border-sky-200 rounded-2xl p-4">
            <Utensils className="w-5 h-5 text-sky-600 mb-2" />
            <div className="text-2xl font-black text-sky-900">{stats?.preparing ?? 0}</div>
            <div className="text-xs font-bold text-sky-700">Preparing</div>
          </div>
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
            <Package className="w-5 h-5 text-emerald-600 mb-2" />
            <div className="text-2xl font-black text-emerald-900">{stats?.ready ?? 0}</div>
            <div className="text-xs font-bold text-emerald-700">Ready</div>
          </div>
          <div className="bg-purple-50 border border-purple-200 rounded-2xl p-4">
            <Truck className="w-5 h-5 text-purple-600 mb-2" />
            <div className="text-2xl font-black text-purple-900">{stats?.outForDelivery ?? 0}</div>
            <div className="text-xs font-bold text-purple-700">Out for Delivery</div>
          </div>
          <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4">
            <XCircle className="w-5 h-5 text-rose-600 mb-2" />
            <div className="text-2xl font-black text-rose-900">{stats?.cancelled ?? 0}</div>
            <div className="text-xs font-bold text-rose-700">Cancelled</div>
          </div>
        </div>
      </div>

      {/* Grid: Order Distribution & Most Popular Dishes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Order Channels & Payment Distribution */}
        <div className="bg-white rounded-3xl border border-slate-200/90 p-6 space-y-6 shadow-xs">
          <div>
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4">
              Fulfillment Channels
            </h3>
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-center">
                <Truck className="w-5 h-5 text-orange-500 mx-auto mb-1" />
                <div className="text-lg font-black text-slate-900">{stats?.deliveryCount ?? 0}</div>
                <div className="text-[11px] text-slate-400 font-semibold">Delivery</div>
              </div>
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-center">
                <Store className="w-5 h-5 text-amber-500 mx-auto mb-1" />
                <div className="text-lg font-black text-slate-900">{stats?.pickupCount ?? 0}</div>
                <div className="text-[11px] text-slate-400 font-semibold">Pickup</div>
              </div>
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-center">
                <Utensils className="w-5 h-5 text-sky-500 mx-auto mb-1" />
                <div className="text-lg font-black text-slate-900">{stats?.dineInCount ?? 0}</div>
                <div className="text-[11px] text-slate-400 font-semibold">Dine-In</div>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4">
              Payment Methods
            </h3>
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-center">
                <Banknote className="w-5 h-5 text-emerald-600 mx-auto mb-1" />
                <div className="text-lg font-black text-slate-900">{stats?.cashCount ?? 0}</div>
                <div className="text-[11px] text-slate-400 font-semibold">Cash</div>
              </div>
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-center">
                <QrCode className="w-5 h-5 text-purple-600 mx-auto mb-1" />
                <div className="text-lg font-black text-slate-900">{stats?.khqrCount ?? 0}</div>
                <div className="text-[11px] text-slate-400 font-semibold">KHQR / Bakong</div>
              </div>
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-center">
                <CreditCard className="w-5 h-5 text-blue-600 mx-auto mb-1" />
                <div className="text-lg font-black text-slate-900">{stats?.cardCount ?? 0}</div>
                <div className="text-[11px] text-slate-400 font-semibold">Card</div>
              </div>
            </div>
          </div>
        </div>

        {/* Most Ordered Foods */}
        <div className="bg-white rounded-3xl border border-slate-200/90 p-6 shadow-xs flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4">
              Top Ordered Dishes
            </h3>
            {topItems.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs">
                No menu items ordered yet
              </div>
            ) : (
              <div className="space-y-3">
                {topItems.map((item, idx) => (
                  <div
                    key={item.name}
                    className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-100"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-full bg-orange-100 text-orange-700 text-xs font-black flex items-center justify-center">
                        {idx + 1}
                      </span>
                      <span className="font-bold text-sm text-slate-900">{item.name}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-extrabold text-slate-900 block">
                        {item.count} orders
                      </span>
                      <span className="text-[10px] text-slate-400 font-semibold">
                        ${item.revenue.toFixed(2)} rev
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recent Orders List */}
      <div className="bg-white rounded-3xl border border-slate-200/90 overflow-hidden shadow-xs">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
            Recent Orders
          </h3>
          <span className="text-xs text-slate-400 font-semibold">Latest 7 entries</span>
        </div>

        {recentOrders.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-xs">No orders placed yet</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {recentOrders.map((order) => (
              <div
                key={order.id}
                className="px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
              >
                <div>
                  <div className="font-bold text-sm text-slate-900">
                    {order.customer_name || 'Guest'} · {order.order_number || `#SV-${order.id.slice(0, 8)}`}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-2">
                    <span>
                      {new Date(order.created_at).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </span>
                    <span>•</span>
                    <span className="capitalize">{order.order_type || 'Delivery'}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-sm font-black text-slate-900">${Number(order.total).toFixed(2)}</span>
                  <span
                    className={`px-2.5 py-1 rounded-full text-xs font-bold border uppercase ${
                      order.status === 'completed'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : order.status === 'cancelled'
                        ? 'bg-rose-50 text-rose-700 border-rose-200'
                        : 'bg-amber-50 text-amber-700 border-amber-200'
                    }`}
                  >
                    {order.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
