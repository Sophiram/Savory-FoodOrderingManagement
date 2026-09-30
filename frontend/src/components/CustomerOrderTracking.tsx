import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase, type Order, type OrderItem, type OrderStatus } from '@/lib/supabase';
import { updateOrderStatus, checkKHQRPayment, fetchOrderById, createKHQRPayment } from '@/lib/api';
import SavoryLogo from './SavoryLogo';
import OrderReceiptModal from './OrderReceiptModal';
import QRCode from 'qrcode';
import {
  CheckCircle2, Clock, Utensils, Truck, Store, XCircle,
  MapPin, Phone, ArrowLeft, QrCode, ShieldCheck, AlertTriangle,
  RotateCcw, ExternalLink, RefreshCw, Loader2, Banknote, FileText,
} from 'lucide-react';

interface Props {
  orderId: string;
  /** Raw EMV QR string from Edge Function (if KHQR payment) */
  qrString?: string | null;
  /** Bakong short deeplink for mobile banking apps */
  deeplink?: string | null;
  /** MD5 hash for polling Bakong check_transaction_by_md5 */
  md5?: string | null;
  onBack: () => void;
  onReorder?: (items: { menuItemId: string; quantity: number }[]) => void;
}

const statusSteps: { key: OrderStatus; label: string; icon: typeof Clock }[] = [
  { key: 'pending',          label: 'Order Placed',     icon: Clock         },
  { key: 'confirmed',        label: 'Confirmed',        icon: CheckCircle2  },
  { key: 'preparing',        label: 'Preparing',        icon: Utensils      },
  { key: 'ready',            label: 'Ready',            icon: CheckCircle2  },
  { key: 'out_for_delivery', label: 'Out for Delivery', icon: Truck         },
  { key: 'delivered',        label: 'Delivered',        icon: CheckCircle2  },
];

function getStatusMessage(status: OrderStatus, orderType: string | null, prepTime?: number | null): string {
  const prep = prepTime ?? 20;
  switch (status) {
    case 'pending':          return 'Your order has been received and is awaiting restaurant confirmation.';
    case 'confirmed':        return `Your order has been confirmed! Estimated preparation time: ${prep} minutes.`;
    case 'preparing':        return 'Our chefs are preparing your meal fresh right now.';
    case 'ready':            return orderType === 'delivery'
                               ? 'Your order is packaged and waiting for the courier.'
                               : 'Your order is ready! Please pick it up at the counter.';
    case 'out_for_delivery': return 'Your food is on the way! Estimated delivery: 15–25 minutes.';
    case 'delivered':        return 'Your order has been delivered. Enjoy your meal! 🎉';
    case 'completed':        return 'Order complete. Thank you for choosing Savory!';
    case 'cancelled':        return 'This order has been cancelled.';
    default:                 return 'Processing your order...';
  }
}

function getActiveStepIndex(status: OrderStatus): number {
  if (status === 'cancelled') return -1;
  if (status === 'completed') return 5;
  const idx = statusSteps.findIndex((s) => s.key === status);
  return idx >= 0 ? idx : 0;
}

export default function CustomerOrderTracking({
  orderId,
  qrString: initialQrString,
  deeplink: initialDeeplink,
  md5: initialMd5,
  onBack,
  onReorder,
}: Props) {
  const [order, setOrder]           = useState<Order | null>(null);
  const [items, setItems]           = useState<(OrderItem & { menu_item_name?: string })[]>([]);
  const [loading, setLoading]       = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [khqrImg, setKhqrImg]       = useState<string | null>(null);
  const [payPollMsg, setPayPollMsg] = useState<string>('');
  const [payConfirmed, setPayConfirmed] = useState(false);
  const [confirmingPay, setConfirmingPay] = useState(false);

  // Dynamic KHQR reactive state
  const [currentQrString, setCurrentQrString] = useState<string | null>(initialQrString ?? null);
  const [currentDeeplink, setCurrentDeeplink] = useState<string | null>(initialDeeplink ?? null);
  const [currentMd5, setCurrentMd5]           = useState<string | null>(initialMd5 ?? null);
  const [generatingQR, setGeneratingQR]       = useState(false);
  const [showKHQRSection, setShowKHQRSection] = useState(false);
  const [showReceipt, setShowReceipt]         = useState(false);

  // Synchronize when initial props change
  useEffect(() => {
    if (initialQrString) setCurrentQrString(initialQrString);
    if (initialDeeplink) setCurrentDeeplink(initialDeeplink);
    if (initialMd5) setCurrentMd5(initialMd5);
  }, [initialQrString, initialDeeplink, initialMd5]);

  // ── Fetch order + items ───────────────────────────────────────────────────
  const fetchOrder = useCallback(async () => {
    try {
      const orderData = await fetchOrderById(orderId);

      if (!orderData) {
        setLoading(false);
        return;
      }
      setOrder(orderData as Order);
      setItems((orderData.items as (OrderItem & { menu_item_name?: string })[]) || []);

      if (orderData.payment_status === 'paid') {
        setPayConfirmed(true);
      }

      if (orderData.qr_string) setCurrentQrString(orderData.qr_string);
      if (orderData.md5) setCurrentMd5(orderData.md5);
      if (orderData.deeplink) setCurrentDeeplink(orderData.deeplink);

      // If KHQR and we don't yet have the QR string, fetch it from payments table
      if ((orderData as Order).payment_method === 'khqr' && !orderData.qr_string && !currentQrString) {
        try {
          const { data: payment } = await supabase
            .from('payments')
            .select('qr_data, provider_transaction_id')
            .eq('order_id', orderId)
            .maybeSingle();
          if (payment?.qr_data) setCurrentQrString(payment.qr_data);
          if (payment?.provider_transaction_id) setCurrentMd5(payment.provider_transaction_id);
        } catch {}
      }

      setLoading(false);
    } catch (err) {
      console.error('fetchOrder error:', err);
      setLoading(false);
    }
  }, [orderId, currentQrString]);

  // ── Generate KHQR on-demand ───────────────────────────────────────────────
  const handleGenerateKHQR = useCallback(async () => {
    if (!order) return;
    setGeneratingQR(true);
    setShowKHQRSection(true);
    try {
      const res = await createKHQRPayment(order.id, Number(order.total) || 0, 'USD');
      if (res && res.qr_string) {
        setCurrentQrString(res.qr_string);
        setCurrentMd5(res.md5);
        if (res.deeplink) setCurrentDeeplink(res.deeplink);
        setOrder((prev) => prev ? { ...prev, payment_method: 'khqr' } : prev);
      }
    } catch (err) {
      console.error('handleGenerateKHQR error:', err);
    } finally {
      setGeneratingQR(false);
    }
  }, [order]);

  // ── Auto-generate KHQR if order is KHQR and missing QR string ─────────────
  useEffect(() => {
    if (
      order &&
      order.payment_method === 'khqr' &&
      order.payment_status !== 'paid' &&
      !payConfirmed &&
      !currentQrString &&
      !generatingQR
    ) {
      handleGenerateKHQR();
    }
  }, [order, payConfirmed, currentQrString, generatingQR, handleGenerateKHQR]);

  // ── Render QR image whenever currentQrString is available ──────────────────
  useEffect(() => {
    if (!currentQrString) {
      setKhqrImg(null);
      return;
    }
    QRCode.toDataURL(currentQrString, {
      width: 320,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#0f172a', light: '#ffffff' },
    })
      .then(setKhqrImg)
      .catch((err) => {
        console.error('QRCode conversion failed:', err);
        setKhqrImg(null);
      });
  }, [currentQrString]);

  // ── Supabase Realtime: live order status ──────────────────────────────────
  useEffect(() => {
    fetchOrder();

    const channel = supabase
      .channel(`order-track-${orderId}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}`,
      }, (payload) => {
        setOrder((prev) => prev ? { ...prev, ...(payload.new as Order) } : (payload.new as Order));
        if ((payload.new as Order).payment_status === 'paid') setPayConfirmed(true);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [orderId, fetchOrder]);

  // ── KHQR Payment polling (every 5 s while unpaid) ─────────────────────────
  useEffect(() => {
    const isKHQR = order?.payment_method === 'khqr' || showKHQRSection || !!currentQrString;
    if (!order || !isKHQR) return;
    if (order.payment_status === 'paid' || payConfirmed) return;

    const poll = async () => {
      setPayPollMsg('Checking payment...');
      const result = await checkKHQRPayment(orderId, currentMd5);
      if (result.paid) {
        setPayConfirmed(true);
        setPayPollMsg('✅ Payment confirmed!');
        setOrder((prev) => prev ? { ...prev, payment_status: 'paid', status: 'confirmed' } : prev);
      } else {
        setPayPollMsg('');
      }
    };

    poll(); // first check immediately
    const interval = setInterval(poll, 5000); // then every 5 seconds
    return () => clearInterval(interval);
  }, [order, orderId, payConfirmed, showKHQRSection, currentQrString, currentMd5]);

  // ── Manual Payment Confirm ────────────────────────────────────────────────
  const handleManualPaymentConfirm = async () => {
    setConfirmingPay(true);
    setPayPollMsg('Confirming payment...');
    const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:8000';

    try {
      // Step 1: Try Bakong API check first
      try {
        const bakongRes = await checkKHQRPayment(orderId, currentMd5);
        if (bakongRes.paid) {
          setPayConfirmed(true);
          setPayPollMsg('✅ Payment confirmed via Bakong!');
          setOrder((prev) => prev ? { ...prev, payment_status: 'paid', status: 'confirmed' } : prev);
          return;
        }
      } catch {
        // Bakong API unavailable — continue to manual confirm
      }

      // Step 2: Always call the force-confirm endpoint (manual override)
      const confirmRes = await fetch(`${apiBase}/api/payments/confirm/${orderId}`, {
        method: 'POST',
      });

      if (confirmRes.ok) {
        const data = await confirmRes.json();
        setPayConfirmed(true);
        setPayPollMsg('✅ Payment confirmed!');
        setOrder((prev) =>
          prev ? { ...prev, payment_status: 'paid', status: data.order_status || 'confirmed' } : prev
        );
      } else {
        const errData = await confirmRes.json().catch(() => ({}));
        setPayPollMsg(errData.detail || 'Could not confirm payment. Please contact staff.');
      }
    } catch (err) {
      console.error('Payment confirmation error:', err);
      setPayPollMsg('Network error. Please try again.');
    } finally {
      setConfirmingPay(false);
    }
  };

  // ── Cancel order ──────────────────────────────────────────────────────────
  const handleCancelOrder = async () => {
    if (!order || order.status !== 'pending') return;
    if (!confirm('Are you sure you want to cancel this order?')) return;
    setCancelling(true);
    await updateOrderStatus(order.id, 'cancelled', 'Cancelled by customer');
    await fetchOrder();
    setCancelling(false);
  };

  // ─────────────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center py-16 gap-3">
        <div className="w-10 h-10 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-slate-500 font-medium">Loading live order status...</p>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="max-w-xl mx-auto py-16 px-4 text-center">
        <div className="w-16 h-16 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="w-8 h-8 text-rose-500" />
        </div>
        <h3 className="text-xl font-bold text-slate-900 mb-2">Order Not Found</h3>
        <p className="text-slate-500 text-sm mb-6">We couldn't retrieve the details for this order.</p>
        <button onClick={onBack} className="px-6 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-semibold hover:bg-slate-800 transition-colors">
          Return to Menu
        </button>
      </div>
    );
  }

  const activeIndex = getActiveStepIndex(order.status);
  const isDelivery  = order.order_type === 'delivery';
  const isPaid      = order.payment_status === 'paid' || payConfirmed;
  const isKHQR      = order.payment_method === 'khqr' || showKHQRSection || !!currentQrString;
  const showQR      = isKHQR && !isPaid;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      {/* Nav */}
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Menu
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowReceipt(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200 rounded-xl text-xs font-bold transition shadow-sm"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>View Receipt</span>
          </button>
          <span className="text-xs font-mono uppercase bg-slate-100 text-slate-700 px-3 py-1.5 rounded-xl font-bold border border-slate-200">
            {order.order_number || `#${order.id.slice(0, 8)}`}
          </span>
        </div>
      </div>

      {/* Main card */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xl shadow-slate-100 overflow-hidden">

        {/* Banner */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 p-6 sm:p-8 text-white relative overflow-hidden">
          <div className="absolute right-0 top-0 w-64 h-64 bg-orange-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5">
                <SavoryLogo size="sm" variant="icon" />
                <span className="text-xs uppercase tracking-wider font-bold text-orange-400">Live Order Tracker</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-white mt-2">
                {order.order_number || `#${order.id.slice(0, 8)}`}
              </h2>
              <p className="text-sm text-slate-300 mt-2 max-w-lg leading-relaxed">
                {getStatusMessage(order.status, order.order_type, order.estimated_prep_time)}
              </p>
            </div>
            <div className="shrink-0 bg-white/10 backdrop-blur-md border border-white/10 rounded-2xl p-4 text-center min-w-[120px]">
              <span className="text-xs uppercase tracking-wider text-slate-400 block font-semibold">Est. Time</span>
              <span className="text-2xl font-black text-orange-400 mt-1 block">
                {order.status === 'out_for_delivery' ? '15–25 min'
                  : order.status === 'ready' ? 'Ready ✓'
                  : `${order.estimated_prep_time ?? 20} min`}
              </span>
            </div>
          </div>
        </div>

        {/* Stepper */}
        {order.status !== 'cancelled' ? (
          <div className="p-6 sm:p-8 border-b border-slate-100 bg-slate-50/50">
            <div className="relative">
              <div className="hidden md:block absolute top-5 left-4 right-4 h-1 bg-slate-200 -z-0" />
              <div
                className="hidden md:block absolute top-5 left-4 h-1 bg-gradient-to-r from-orange-400 to-orange-600 transition-all duration-700 -z-0"
                style={{ width: `${Math.min(100, Math.max(0, (activeIndex / (statusSteps.length - 1)) * 92))}%` }}
              />
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4 relative z-10">
                {statusSteps.map((step, idx) => {
                  const Icon = step.icon;
                  const isDone    = idx <= activeIndex;
                  const isCurrent = idx === activeIndex;
                  return (
                    <div key={step.key} className="flex flex-col items-center text-center">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 font-bold ${
                        isDone
                          ? 'bg-gradient-to-br from-orange-400 to-orange-600 text-white shadow-md shadow-orange-500/30'
                          : 'bg-white border-2 border-slate-200 text-slate-300'
                      } ${isCurrent ? 'ring-4 ring-orange-500/20 scale-110' : ''}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <span className={`text-xs font-semibold mt-2.5 ${isDone ? 'text-slate-900' : 'text-slate-400'}`}>
                        {step.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="p-6 bg-rose-50 border-b border-rose-200 flex items-center gap-3">
            <XCircle className="w-6 h-6 text-rose-600 shrink-0" />
            <div>
              <h4 className="text-sm font-bold text-rose-900">Order Was Cancelled</h4>
              <p className="text-xs text-rose-700 mt-0.5">This order was cancelled and will not be prepared.</p>
            </div>
          </div>
        )}

        {/* ── Cash Payment Notice with instant KHQR pay-now option ── */}
        {order.payment_method === 'cash' && !isPaid && !showKHQRSection && !currentQrString && (
          <div className="p-5 sm:p-6 bg-gradient-to-r from-amber-50 to-orange-50 border-b border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start sm:items-center gap-3.5">
              <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0 border border-amber-200">
                <Banknote className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <span>Cash Payment Selected</span>
                  <span className="text-[10px] uppercase font-bold bg-amber-200/80 text-amber-900 px-2 py-0.5 rounded-full">
                    Unpaid
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Pay cash upon delivery or pickup, or switch to Bakong KHQR anytime to pay immediately.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleGenerateKHQR}
              disabled={generatingQR}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-bold transition shadow-sm shrink-0 disabled:opacity-50"
            >
              {generatingQR ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <QrCode className="w-4 h-4" />
              )}
              <span>{generatingQR ? 'Generating QR...' : 'Pay with Bakong KHQR'}</span>
            </button>
          </div>
        )}

        {/* ── KHQR Payment Section ── */}
        {isKHQR && !isPaid && (
          <div className="p-6 sm:p-8 bg-gradient-to-br from-amber-50 to-orange-50 border-b border-orange-200">
            <div className="flex flex-col sm:flex-row items-center gap-6">

              {/* QR Code */}
              <div className="shrink-0">
                {khqrImg ? (
                  <div className="bg-white p-4 rounded-2xl shadow-lg border-2 border-orange-200 flex flex-col items-center">
                    <img src={khqrImg} alt="KHQR Bakong QR" className="w-52 h-52 rounded-lg" />
                    <div className="text-center mt-2.5">
                      <span className="text-[10px] font-extrabold text-slate-600 uppercase tracking-widest bg-slate-100 px-3 py-1 rounded-full border border-slate-200">
                        BAKONG KHQR
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="w-60 h-60 bg-white rounded-2xl border-2 border-orange-200 flex flex-col items-center justify-center gap-3 p-4">
                    <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
                    <span className="text-xs font-semibold text-slate-600 text-center">
                      Generating Bakong QR code...
                    </span>
                  </div>
                )}
              </div>

              {/* Instructions */}
              <div className="flex-1 space-y-3 text-center sm:text-left">
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-orange-200/60 text-orange-900 text-xs font-bold uppercase tracking-wider">
                  <QrCode className="w-3.5 h-3.5" /> Scan to Pay with KHQR
                </div>

                <div>
                  <div className="text-3xl font-black text-slate-900">
                    ${Number(order.total).toFixed(2)} USD
                  </div>
                  <div className="text-xs text-slate-600 font-mono mt-0.5">
                    Merchant: <span className="font-bold text-slate-800">SOPHIRAM SORN</span> (Savory)
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono">
                    Bakong Account: sorn_sophiram@bkrt
                  </div>
                </div>

                <p className="text-sm text-slate-600 leading-relaxed">
                  Open <strong>Bakong</strong>, <strong>ABA</strong>, <strong>Wing</strong>, or any
                  Cambodian banking app — tap <em>Scan QR</em> and point at the code above.
                </p>

                {/* Action buttons */}
                <div className="flex flex-wrap items-center gap-2.5 pt-1 justify-center sm:justify-start">
                  {currentDeeplink && (
                    <a
                      href={currentDeeplink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2.5 bg-orange-500 text-white rounded-xl text-sm font-semibold hover:bg-orange-600 transition-colors shadow-sm"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Open in Banking App
                    </a>
                  )}

                  <button
                    type="button"
                    onClick={handleManualPaymentConfirm}
                    disabled={confirmingPay}
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 transition-colors shadow-sm disabled:opacity-50"
                  >
                    {confirmingPay ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4" />
                    )}
                    {confirmingPay ? 'Verifying...' : 'I Have Paid / Confirm Payment'}
                  </button>
                </div>

                <div className="flex items-center gap-2 text-xs text-slate-500 justify-center sm:justify-start pt-1">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>Verified NBC KHQR Merchant — Savory Restaurant</span>
                </div>

                {/* Polling indicator */}
                <div className="flex items-center gap-2 text-xs text-slate-400 justify-center sm:justify-start">
                  {payPollMsg ? (
                    <><RefreshCw className="w-3 h-3 animate-spin text-orange-500" /> <span className="text-slate-600 font-medium">{payPollMsg}</span></>
                  ) : (
                    <><RefreshCw className="w-3 h-3 animate-spin opacity-40" /> Waiting for payment…</>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Payment confirmed banner */}
        {isKHQR && isPaid && (
          <div className="p-4 bg-emerald-50 border-b border-emerald-200 flex items-center gap-3">
            <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
            <div>
              <h4 className="text-sm font-bold text-emerald-900">Payment Confirmed via Bakong KHQR ✅</h4>
              <p className="text-xs text-emerald-700 mt-0.5">Your order has been confirmed and the kitchen is being notified.</p>
            </div>
          </div>
        )}

        {/* Order Details */}
        <div className="p-6 sm:p-8 space-y-6">

          {/* Customer + delivery */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 rounded-2xl p-4 border border-slate-100">
            <div className="space-y-1 text-sm">
              <span className="text-xs uppercase tracking-wider font-bold text-slate-400 block">Customer</span>
              <div className="font-semibold text-slate-900">{order.customer_name}</div>
              {order.phone && (
                <div className="flex items-center gap-1.5 text-slate-600 text-xs">
                  <Phone className="w-3.5 h-3.5 text-slate-400" /> {order.phone}
                </div>
              )}
            </div>
            <div className="space-y-1 text-sm">
              <span className="text-xs uppercase tracking-wider font-bold text-slate-400 block">
                {isDelivery ? 'Delivery Location' : 'Order Type'}
              </span>
              <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                {isDelivery ? (
                  <><Truck className="w-4 h-4 text-orange-500" /> Delivery</>
                ) : order.order_type === 'dine_in' ? (
                  <><Utensils className="w-4 h-4 text-orange-500" /> Dine-in (Table #{order.table_number ?? 'N/A'})</>
                ) : (
                  <><Store className="w-4 h-4 text-orange-500" /> Pickup at Counter</>
                )}
              </div>
              {isDelivery && order.address && (
                <div className="flex items-start gap-1.5 text-slate-600 text-xs">
                  <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                  <span>{order.address}</span>
                </div>
              )}
            </div>
          </div>

          {/* Items */}
          <div>
            <h4 className="text-xs uppercase tracking-wider font-bold text-slate-400 mb-3">
              Order Items ({items.length})
            </h4>
            <div className="divide-y divide-slate-100 border border-slate-100 rounded-2xl overflow-hidden">
              {items.map((item) => (
                <div key={item.id} className="p-4 flex items-center justify-between gap-4 bg-white hover:bg-slate-50 transition-colors">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-sm text-slate-900 truncate">
                      {item.quantity}× {item.menu_item_name}
                    </div>
                    {item.notes && (
                      <div className="text-xs text-orange-600 mt-0.5">Note: {item.notes}</div>
                    )}
                    <div className="text-xs text-slate-400 mt-0.5">${Number(item.unit_price).toFixed(2)} each</div>
                  </div>
                  <div className="text-sm font-bold text-slate-900 shrink-0">
                    ${(item.quantity * Number(item.unit_price)).toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Pricing breakdown */}
          <div className="border-t border-slate-100 pt-4 space-y-2 text-sm">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal</span>
              <span>${Number(order.subtotal ?? order.total).toFixed(2)}</span>
            </div>
            {Number(order.delivery_fee) > 0 && (
              <div className="flex justify-between text-slate-600">
                <span>Delivery Fee</span>
                <span>${Number(order.delivery_fee).toFixed(2)}</span>
              </div>
            )}
            {Number(order.discount) > 0 && (
              <div className="flex justify-between text-emerald-600 font-medium">
                <span>Discount {order.coupon_code ? `(${order.coupon_code})` : ''}</span>
                <span>-${Number(order.discount).toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between items-center pt-2 border-t border-slate-200">
              <div>
                <span className="text-base font-extrabold text-slate-900 block">Total</span>
                <span className={`text-xs uppercase font-semibold ${isPaid ? 'text-emerald-600' : 'text-slate-400'}`}>
                  {order.payment_method?.toUpperCase()} —{' '}
                  {isPaid ? '✅ PAID' : (order.payment_status ?? 'UNPAID').toUpperCase()}
                </span>
              </div>
              <span className="text-2xl font-black text-slate-900">${Number(order.total).toFixed(2)}</span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setShowReceipt(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition shadow-sm"
            >
              <FileText className="w-3.5 h-3.5 text-orange-600" />
              <span>View Official Receipt</span>
            </button>

            {order.status === 'pending' && (
              <button
                onClick={handleCancelOrder}
                disabled={cancelling}
                className="px-4 py-2 text-xs font-semibold text-rose-600 border border-rose-200 rounded-xl hover:bg-rose-50 transition-colors disabled:opacity-50"
              >
                {cancelling ? 'Cancelling...' : 'Cancel Order'}
              </button>
            )}
            {onReorder && items.length > 0 && (
              <button
                onClick={() => onReorder(items.map((i) => ({ menuItemId: i.menu_item_id, quantity: i.quantity })))}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-colors ml-auto shadow-sm"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Reorder this meal
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Official Printable / Digital Receipt Modal */}
      <OrderReceiptModal
        order={{ ...order, items }}
        isOpen={showReceipt}
        onClose={() => setShowReceipt(false)}
      />
    </div>
  );
}
