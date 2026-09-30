import { useEffect, useState, useCallback } from 'react';
import type { Order, OrderStatus } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { fetchOrders } from '@/lib/api';
import OrderReceiptModal from './OrderReceiptModal';
import {
  ClipboardList,
  Clock,
  CheckCircle2,
  XCircle,
  Truck,
  Store,
  ChevronRight,
  RotateCcw,
  Utensils,
  Search,
  FileText,
} from 'lucide-react';

interface Props {
  onSelectOrder: (orderId: string) => void;
  onReorder: (orderId: string) => void;
}

const statusBadgeConfig: Record<
  OrderStatus,
  { label: string; color: string; icon: typeof Clock }
> = {
  pending: { label: 'Pending', color: 'bg-amber-100 text-amber-800 border-amber-200', icon: Clock },
  confirmed: { label: 'Confirmed', color: 'bg-indigo-100 text-indigo-800 border-indigo-200', icon: CheckCircle2 },
  preparing: { label: 'Preparing', color: 'bg-sky-100 text-sky-800 border-sky-200', icon: Utensils },
  ready: { label: 'Ready', color: 'bg-emerald-100 text-emerald-800 border-emerald-200', icon: CheckCircle2 },
  out_for_delivery: { label: 'Out for Delivery', color: 'bg-purple-100 text-purple-800 border-purple-200', icon: Truck },
  delivered: { label: 'Delivered', color: 'bg-emerald-100 text-emerald-800 border-emerald-200', icon: CheckCircle2 },
  completed: { label: 'Completed', color: 'bg-slate-100 text-slate-700 border-slate-200', icon: CheckCircle2 },
  cancelled: { label: 'Cancelled', color: 'bg-rose-100 text-rose-800 border-rose-200', icon: XCircle },
};

export default function CustomerOrderHistory({ onSelectOrder, onReorder }: Props) {
  const { profile } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [receiptOrder, setReceiptOrder] = useState<any | null>(null);

  const loadHistory = useCallback(async () => {
    if (!profile) {
      setLoading(false);
      return;
    }
    try {
      const data = await fetchOrders(undefined, profile.id);
      setOrders(data);
    } catch (err) {
      console.error('History load error:', err);
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const filteredOrders = orders.filter((o) => {
    const term = search.toLowerCase();
    const orderNo = (o.order_number || o.id).toLowerCase();
    const date = new Date(o.created_at).toLocaleDateString().toLowerCase();
    return orderNo.includes(term) || date.includes(term) || o.status.includes(term);
  });

  if (loading) {
    return (
      <div className="py-16 text-center">
        <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-xs text-slate-400 font-medium">Loading your orders...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">Order History</h2>
          <p className="text-slate-500 text-sm mt-0.5">
            View status, details, and reorder your favorite meals
          </p>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search orders..."
            className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
          />
        </div>
      </div>

      {filteredOrders.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-orange-50 text-orange-500 flex items-center justify-center mx-auto mb-4">
            <ClipboardList className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-slate-900 mb-1">No Orders Yet</h3>
          <p className="text-slate-400 text-sm max-w-sm mx-auto mb-6">
            When you place an order, it will appear here so you can track its progress or reorder quickly.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredOrders.map((order) => {
            const badge = statusBadgeConfig[order.status] || statusBadgeConfig.pending;
            const Icon = badge.icon;
            const isDelivery = order.order_type === 'delivery';

            return (
              <div
                key={order.id}
                onClick={() => onSelectOrder(order.id)}
                className="bg-white rounded-2xl border border-slate-200 p-5 hover:shadow-md transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-4 group"
              >
                <div className="flex items-start gap-4 min-w-0">
                  <div className="w-12 h-12 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center shrink-0 mt-0.5">
                    {isDelivery ? <Truck className="w-6 h-6" /> : <Store className="w-6 h-6" />}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-base text-slate-900 truncate">
                        {order.order_number || `#SV-${order.id.slice(0, 8)}`}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border ${badge.color}`}
                      >
                        <Icon className="w-3 h-3" />
                        {badge.label}
                      </span>
                    </div>

                    <div className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-2">
                      <span>
                        {new Date(order.created_at).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </span>
                      <span>•</span>
                      <span className="capitalize">{order.order_type || 'Order'}</span>
                      {order.address && (
                        <>
                          <span>•</span>
                          <span className="truncate max-w-[200px]">{order.address}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0 border-t sm:border-t-0 pt-3 sm:pt-0 border-slate-100">
                  <div className="text-right">
                    <span className="text-base font-extrabold text-slate-900 block">
                      ${Number(order.total).toFixed(2)}
                    </span>
                    <span className="text-[10px] text-slate-400 uppercase font-semibold">
                      {order.payment_method?.toUpperCase()}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setReceiptOrder(order);
                      }}
                      title="View Official Receipt"
                      className="p-2 text-slate-400 hover:text-orange-600 hover:bg-orange-50 rounded-xl transition-colors"
                    >
                      <FileText className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onReorder(order.id);
                      }}
                      title="Reorder items"
                      className="p-2 text-slate-400 hover:text-orange-600 hover:bg-orange-50 rounded-xl transition-colors"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                    <div className="p-1 text-slate-300 group-hover:text-slate-700 transition-colors">
                      <ChevronRight className="w-5 h-5" />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {receiptOrder && (
        <OrderReceiptModal
          order={receiptOrder}
          isOpen={Boolean(receiptOrder)}
          onClose={() => setReceiptOrder(null)}
        />
      )}
    </div>
  );
}
