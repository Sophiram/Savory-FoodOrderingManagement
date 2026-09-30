import { useEffect, useState, useCallback } from 'react';
import type { Order, OrderItem, OrderStatus, PaymentStatus } from '@/lib/supabase';
import { fetchOrders, updateOrderStatus, updatePaymentStatus } from '@/lib/api';
import OrderReceiptModal from '@/components/OrderReceiptModal';
import {
  Clock,
  Utensils,
  CheckCircle2,
  XCircle,
  Truck,
  Store,
  Navigation,
  Phone,
  MapPin,
  Calendar,
  X,
  ArrowRight,
  ClipboardList,
  Search,
  Filter,
  DollarSign,
  AlertCircle,
  RotateCcw,
  Sparkles,
  FileText,
} from 'lucide-react';

type OrderWithItems = Order & { items: (OrderItem & { menu_item_name?: string })[] };

const statusFlow: OrderStatus[] = [
  'pending',
  'confirmed',
  'preparing',
  'ready',
  'out_for_delivery',
  'delivered',
  'completed',
];

const statusConfig: Record<
  OrderStatus,
  { label: string; color: string; bg: string; icon: typeof Clock }
> = {
  pending: { label: 'Pending', color: 'text-amber-800', bg: 'bg-amber-50 border-amber-200', icon: Clock },
  confirmed: { label: 'Confirmed', color: 'text-indigo-800', bg: 'bg-indigo-50 border-indigo-200', icon: CheckCircle2 },
  preparing: { label: 'Preparing', color: 'text-sky-800', bg: 'bg-sky-50 border-sky-200', icon: Utensils },
  ready: { label: 'Ready', color: 'text-emerald-800', bg: 'bg-emerald-50 border-emerald-200', icon: CheckCircle2 },
  out_for_delivery: { label: 'Out for Delivery', color: 'text-purple-800', bg: 'bg-purple-50 border-purple-200', icon: Truck },
  delivered: { label: 'Delivered', color: 'text-emerald-800', bg: 'bg-emerald-50 border-emerald-200', icon: CheckCircle2 },
  completed: { label: 'Completed', color: 'text-slate-700', bg: 'bg-slate-50 border-slate-200', icon: CheckCircle2 },
  cancelled: { label: 'Cancelled', color: 'text-rose-800', bg: 'bg-rose-50 border-rose-200', icon: XCircle },
};

export default function OrdersPage() {
  const [orders, setOrders] = useState<OrderWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all');
  const [paymentFilter, setPaymentFilter] = useState<PaymentStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<OrderWithItems | null>(null);
  const [receiptModalOrder, setReceiptModalOrder] = useState<OrderWithItems | null>(null);

  const loadOrders = useCallback(async () => {
    try {
      const data = await fetchOrders();
      setOrders(data);
    } catch (err) {
      console.error('Failed to load orders:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();
    const interval = setInterval(loadOrders, 10000);
    return () => clearInterval(interval);
  }, [loadOrders]);

  const handleStatusChange = async (orderId: string, newStatus: OrderStatus) => {
    await updateOrderStatus(orderId, newStatus);
    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o))
    );
    if (selectedOrder?.id === orderId) {
      setSelectedOrder((prev) => (prev ? { ...prev, status: newStatus } : null));
    }
  };

  const handlePaymentChange = async (orderId: string, newPaymentStatus: PaymentStatus) => {
    await updatePaymentStatus(orderId, newPaymentStatus);
    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId
          ? {
              ...o,
              payment_status: newPaymentStatus,
              status: newPaymentStatus === 'paid' ? 'confirmed' : o.status,
            }
          : o
      )
    );
    if (selectedOrder?.id === orderId) {
      setSelectedOrder((prev) =>
        prev
          ? {
              ...prev,
              payment_status: newPaymentStatus,
              status: newPaymentStatus === 'paid' ? 'confirmed' : prev.status,
            }
          : null
      );
    }
  };

  const advanceStatus = (order: OrderWithItems) => {
    const currentIdx = statusFlow.indexOf(order.status);
    if (currentIdx >= 0 && currentIdx < statusFlow.length - 1) {
      handleStatusChange(order.id, statusFlow[currentIdx + 1]);
    }
  };

  const filteredOrders = orders.filter((o) => {
    const matchesStatus = statusFilter === 'all' || o.status === statusFilter;
    const matchesPayment = paymentFilter === 'all' || (o.payment_status || 'unpaid') === paymentFilter;
    const term = search.toLowerCase();
    const matchesSearch =
      (o.order_number || o.id).toLowerCase().includes(term) ||
      o.customer_name.toLowerCase().includes(term) ||
      (o.phone && o.phone.toLowerCase().includes(term)) ||
      (o.address && o.address.toLowerCase().includes(term));

    return matchesStatus && matchesPayment && matchesSearch;
  });

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="w-10 h-10 border-3 border-orange-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-xs font-semibold text-slate-400">Loading order pipeline...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">Orders Pipeline</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage preparation, delivery dispatch, payments, and order fulfillment
          </p>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search order #, customer, phone..."
            className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 shadow-xs"
          />
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              statusFilter === 'all'
                ? 'bg-slate-900 text-white'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            All Statuses ({orders.length})
          </button>
          {(['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'completed', 'cancelled'] as OrderStatus[]).map((status) => {
            const count = orders.filter((o) => o.status === status).length;
            const config = statusConfig[status];
            const Icon = config.icon;
            return (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                  statusFilter === status
                    ? 'bg-orange-500 text-white shadow-xs'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {config.label} ({count})
              </button>
            );
          })}
        </div>

        {/* Payment Filter row */}
        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-slate-400">
          <span className="font-semibold">Payment:</span>
          {(['all', 'unpaid', 'pending', 'paid', 'refunded'] as (PaymentStatus | 'all')[]).map((p) => (
            <button
              key={p}
              onClick={() => setPaymentFilter(p)}
              className={`px-2.5 py-1 rounded-lg font-semibold uppercase text-[10px] transition-colors ${
                paymentFilter === p ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Orders Grid */}
      {filteredOrders.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-200 py-20 text-center">
          <ClipboardList className="w-12 h-12 mx-auto text-slate-300 mb-2" />
          <h4 className="text-base font-bold text-slate-900">No orders found</h4>
          <p className="text-xs text-slate-400 mt-1">There are no orders matching your current filter.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredOrders.map((order) => {
            const config = statusConfig[order.status] || statusConfig.pending;
            const Icon = config.icon;
            const isDelivery = order.order_type === 'delivery';

            return (
              <div
                key={order.id}
                onClick={() => setSelectedOrder(order)}
                className={`bg-white rounded-3xl border ${config.bg} p-5 hover:shadow-lg transition-all cursor-pointer flex flex-col justify-between group`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="min-w-0">
                      <div className="font-bold text-sm text-slate-900 truncate">
                        {order.customer_name || 'Guest'}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5 font-mono">
                        {order.order_number || `#SV-${order.id.slice(0, 8)}`}
                      </div>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${config.bg} ${config.color}`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {config.label}
                    </span>
                  </div>

                  {/* Channel & Meta */}
                  <div className="flex items-center gap-2 text-xs text-slate-500 mb-3 pb-3 border-b border-slate-100">
                    <span className="flex items-center gap-1 font-semibold text-slate-700 capitalize">
                      {isDelivery ? (
                        <>
                          <Truck className="w-3.5 h-3.5 text-orange-500" /> Delivery
                        </>
                      ) : order.order_type === 'dine_in' ? (
                        <>
                          <Utensils className="w-3.5 h-3.5 text-sky-500" /> Table #{order.table_number || 'N/A'}
                        </>
                      ) : (
                        <>
                          <Store className="w-3.5 h-3.5 text-amber-500" /> Pickup
                        </>
                      )}
                    </span>
                    <span>•</span>
                    <span>
                      {new Date(order.created_at).toLocaleTimeString('en-US', {
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </span>
                    <span>•</span>
                    <span
                      className={`font-bold uppercase text-[10px] ${
                        order.payment_status === 'paid' ? 'text-emerald-600' : 'text-amber-600'
                      }`}
                    >
                      {order.payment_status || 'unpaid'}
                    </span>
                  </div>

                  {/* Items summary */}
                  <div className="space-y-1 mb-4 text-xs">
                    {order.items.slice(0, 3).map((item) => (
                      <div key={item.id} className="flex justify-between text-slate-600">
                        <span className="truncate">
                          {item.quantity}× {item.menu_item_name}
                        </span>
                        <span className="text-slate-400 shrink-0 font-medium">
                          ${(item.quantity * Number(item.unit_price)).toFixed(2)}
                        </span>
                      </div>
                    ))}
                    {order.items.length > 3 && (
                      <div className="text-[11px] text-slate-400 italic">
                        +{order.items.length - 3} more items...
                      </div>
                    )}
                  </div>
                </div>

                {/* Card footer */}
                <div className="flex items-center justify-between pt-3 border-t border-slate-100 mt-2">
                  <div>
                    <span className="text-base font-black text-slate-900 block">
                      ${Number(order.total).toFixed(2)}
                    </span>
                    <span className="text-[10px] text-slate-400 uppercase font-semibold">
                      via {order.payment_method || 'cash'}
                    </span>
                  </div>

                  {order.status !== 'completed' && order.status !== 'cancelled' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        advanceStatus(order);
                      }}
                      className="px-3.5 py-1.5 bg-slate-900 hover:bg-orange-500 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 shadow-xs"
                    >
                      <span>Next Stage</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Order Detail Drawer */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={() => setSelectedOrder(null)} />
          <div className="relative w-full max-w-lg bg-white shadow-2xl overflow-y-auto flex flex-col h-full animate-slide-in-right z-10">
            {/* Drawer Header */}
            <div className="px-6 py-4 border-b border-slate-100 sticky top-0 bg-white z-10 flex items-center justify-between">
              <div>
                <h3 className="text-base font-extrabold text-slate-900">
                  {selectedOrder.order_number || `#SV-${selectedOrder.id.slice(0, 8)}`}
                </h3>
                <p className="text-xs text-slate-400 font-mono">ID: {selectedOrder.id}</p>
              </div>
              <button
                onClick={() => setSelectedOrder(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6 flex-1">
              {/* Order Status Action Buttons */}
              <div>
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 block">
                  Update Order Pipeline Status
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'completed', 'cancelled'] as OrderStatus[]).map((status) => {
                    const active = selectedOrder.status === status;
                    const config = statusConfig[status];
                    return (
                      <button
                        key={status}
                        onClick={() => handleStatusChange(selectedOrder.id, status)}
                        className={`py-2 px-2 rounded-xl text-xs font-bold border transition-all text-center ${
                          active
                            ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        {config.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Payment Status Quick Action */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Payment Status
                  </span>
                  <span
                    className={`text-xs font-black uppercase px-2 py-0.5 rounded-md ${
                      selectedOrder.payment_status === 'paid'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {selectedOrder.payment_status || 'unpaid'}
                  </span>
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => handlePaymentChange(selectedOrder.id, 'paid')}
                    className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors"
                  >
                    Mark as Paid
                  </button>
                  <button
                    onClick={() => handlePaymentChange(selectedOrder.id, 'refunded')}
                    className="px-3 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl text-xs font-bold transition-colors"
                  >
                    Refund
                  </button>
                </div>
              </div>

              {/* Customer Info */}
              <div className="space-y-3 bg-white border border-slate-200 rounded-2xl p-4 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 font-semibold">Customer</span>
                  <span className="font-bold text-slate-900 text-sm">{selectedOrder.customer_name || 'Guest'}</span>
                </div>
                {selectedOrder.phone && (
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 font-semibold flex items-center gap-1">
                      <Phone className="w-3.5 h-3.5" /> Phone
                    </span>
                    <a
                      href={`tel:${selectedOrder.phone}`}
                      className="font-bold text-orange-600 hover:underline"
                    >
                      {selectedOrder.phone}
                    </a>
                  </div>
                )}
                {selectedOrder.address && (
                  <div className="flex justify-between items-start gap-4">
                    <span className="text-slate-400 font-semibold flex items-center gap-1 shrink-0">
                      <MapPin className="w-3.5 h-3.5" /> Address
                    </span>
                    <span className="font-semibold text-slate-800 text-right">{selectedOrder.address}</span>
                  </div>
                )}
                {selectedOrder.customer_lat && selectedOrder.customer_lng && (
                  <div className="pt-1">
                    <a
                      href={`https://www.google.com/maps?q=${selectedOrder.customer_lat},${selectedOrder.customer_lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-50 text-sky-700 font-bold text-xs border border-sky-200 hover:bg-sky-100"
                    >
                      <Navigation className="w-3.5 h-3.5" /> Open Customer GPS on Google Maps
                    </a>
                  </div>
                )}
                {selectedOrder.table_number && (
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 font-semibold">Dine-In Table</span>
                    <span className="font-bold text-slate-900">Table #{selectedOrder.table_number}</span>
                  </div>
                )}
                {selectedOrder.notes && (
                  <div className="pt-2 border-t border-slate-100">
                    <span className="text-slate-400 font-semibold block mb-1">Customer / Kitchen Notes:</span>
                    <span className="p-2.5 rounded-xl bg-amber-50 text-amber-900 block font-medium">
                      {selectedOrder.notes}
                    </span>
                  </div>
                )}
              </div>

              {/* Items Breakdown */}
              <div>
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 block">
                  Ordered Items ({selectedOrder.items.length})
                </label>
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden">
                  {selectedOrder.items.map((item) => (
                    <div key={item.id} className="p-3.5 flex justify-between gap-4 text-xs">
                      <div>
                        <div className="font-bold text-slate-900">
                          {item.quantity}× {item.menu_item_name}
                        </div>
                        {item.notes && (
                          <div className="text-[11px] text-amber-600 mt-0.5">Note: {item.notes}</div>
                        )}
                        <div className="text-slate-400 mt-0.5">${Number(item.unit_price).toFixed(2)} each</div>
                      </div>
                      <span className="font-black text-slate-900">
                        ${(item.quantity * Number(item.unit_price)).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Total Calculation */}
              <div className="border-t border-slate-200 pt-4 space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-500">
                  <span>Subtotal</span>
                  <span>${Number(selectedOrder.subtotal ?? selectedOrder.total).toFixed(2)}</span>
                </div>
                {selectedOrder.delivery_fee != null && selectedOrder.delivery_fee > 0 && (
                  <div className="flex justify-between text-slate-500">
                    <span>Delivery Fee</span>
                    <span>${Number(selectedOrder.delivery_fee).toFixed(2)}</span>
                  </div>
                )}
                {selectedOrder.discount != null && selectedOrder.discount > 0 && (
                  <div className="flex justify-between text-emerald-600 font-bold">
                    <span>Discount {selectedOrder.coupon_code ? `(${selectedOrder.coupon_code})` : ''}</span>
                    <span>-${Number(selectedOrder.discount).toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center text-sm pt-2 border-t border-slate-200 font-black text-slate-900">
                  <span>Total Amount</span>
                  <span className="text-xl text-orange-600">${Number(selectedOrder.total).toFixed(2)}</span>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-slate-200">
                  <button
                    onClick={() => setReceiptModalOrder(selectedOrder)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200 rounded-xl text-xs font-bold transition shadow-sm"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>View / Print Receipt &amp; Telegram</span>
                  </button>
                  <button
                    onClick={() => setSelectedOrder(null)}
                    className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {receiptModalOrder && (
        <OrderReceiptModal
          order={receiptModalOrder}
          isOpen={Boolean(receiptModalOrder)}
          onClose={() => setReceiptModalOrder(null)}
        />
      )}
    </div>
  );
}
