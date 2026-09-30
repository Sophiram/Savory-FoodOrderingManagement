import React, { useState } from 'react';
import { type Order, type OrderItem } from '@/lib/supabase';
import { sendTelegramReceipt } from '@/lib/api';
import SavoryLogo from '@/components/SavoryLogo';
import QRCode from 'qrcode';
import {
  Printer,
  Send,
  Copy,
  Check,
  X,
  Share2,
  CheckCircle2,
  Clock,
  Store,
  Truck,
  Utensils,
  Loader2,
  FileText
} from 'lucide-react';

interface Props {
  order: Order & { items?: (OrderItem & { menu_item_name?: string })[] };
  isOpen: boolean;
  onClose: () => void;
}

export default function OrderReceiptModal({ order, isOpen, onClose }: Props) {
  const [sendingTelegram, setSendingTelegram] = useState(false);
  const [telegramStatus, setTelegramStatus] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');

  React.useEffect(() => {
    if (order?.order_number) {
      QRCode.toDataURL(order.order_number, { width: 120, margin: 1 })
        .then(setQrCodeUrl)
        .catch(() => {});
    }
  }, [order?.order_number]);

  if (!isOpen || !order) return null;

  const items = order.items || [];
  const isPaid = order.payment_status === 'paid';
  const subtotal = Number(order.subtotal ?? order.total);
  const deliveryFee = Number(order.delivery_fee ?? 0);
  const discount = Number(order.discount ?? 0);
  const total = Number(order.total);

  const formattedDate = order.created_at
    ? new Date(order.created_at).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      })
    : new Date().toLocaleString();

  const handlePrint = () => {
    window.print();
  };

  const handleSendTelegram = async () => {
    setSendingTelegram(true);
    setTelegramStatus(null);
    try {
      const res = await sendTelegramReceipt(order.id);
      if (res.success) {
        setTelegramStatus('✅ Receipt sent to Telegram!');
        setTimeout(() => setTelegramStatus(null), 4000);
      } else {
        setTelegramStatus(`⚠️ ${res.message}`);
        setTimeout(() => setTelegramStatus(null), 5000);
      }
    } catch {
      setTelegramStatus('⚠️ Could not connect to Telegram bot.');
      setTimeout(() => setTelegramStatus(null), 4000);
    } finally {
      setSendingTelegram(false);
    }
  };

  const handleCopy = () => {
    const lines = [
      '==============================',
      '     SAVORY RESTAURANT        ',
      '     OFFICIAL RECEIPT         ',
      '==============================',
      `Receipt: REC-${order.order_number || order.id.slice(0, 8)}`,
      `Date: ${formattedDate}`,
      `Customer: ${order.customer_name} (${order.phone || 'N/A'})`,
      `Type: ${order.order_type?.toUpperCase() || 'DELIVERY'}${order.table_number ? ` - Table #${order.table_number}` : ''}`,
      '------------------------------',
      ...items.map(
        (i) =>
          `${i.quantity}x ${i.menu_item_name || 'Dish'} @ $${Number(i.unit_price).toFixed(2)} = $${(
            i.quantity * Number(i.unit_price)
          ).toFixed(2)}`
      ),
      '------------------------------',
      `Subtotal:      $${subtotal.toFixed(2)}`,
      deliveryFee > 0 ? `Delivery Fee:  $${deliveryFee.toFixed(2)}` : null,
      discount > 0 ? `Discount:     -$${discount.toFixed(2)}` : null,
      `TOTAL:         $${total.toFixed(2)} USD`,
      '------------------------------',
      `Payment: ${order.payment_method?.toUpperCase()} (${isPaid ? 'PAID' : 'UNPAID'})`,
      '==============================',
      ' Thank you for choosing Savory! ',
      '==============================',
    ]
      .filter(Boolean)
      .join('\n');

    navigator.clipboard.writeText(lines);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm overflow-y-auto">
      {/* Print-specific style */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #printable-receipt, #printable-receipt * {
            visibility: visible;
          }
          #printable-receipt {
            position: absolute;
            left: 0;
            top: 0;
            width: 80mm !important;
            max-width: 80mm !important;
            margin: 0 auto;
            padding: 10px !important;
            box-shadow: none !important;
            border: none !important;
            background: #ffffff !important;
            color: #000000 !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      <div className="relative w-full max-w-md my-8">
        {/* Action Bar Header (Floating above receipt) */}
        <div className="flex items-center justify-between gap-2 mb-3 bg-slate-900/90 text-white p-3 rounded-2xl shadow-xl no-print backdrop-blur-md">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-orange-400" />
            <span className="text-xs font-bold uppercase tracking-wider">Official Receipt</span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={handlePrint}
              title="Print Thermal Receipt"
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-semibold transition"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print</span>
            </button>

            <button
              onClick={handleSendTelegram}
              disabled={sendingTelegram}
              title="Send Receipt to Telegram Bot"
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold transition disabled:opacity-50"
            >
              {sendingTelegram ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              <span>Telegram</span>
            </button>

            <button
              onClick={handleCopy}
              title="Copy Receipt Text"
              className="p-1.5 bg-white/10 hover:bg-white/20 text-white rounded-xl transition"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            </button>

            <button
              onClick={onClose}
              title="Close Receipt"
              className="p-1.5 hover:bg-white/20 text-slate-400 hover:text-white rounded-xl transition ml-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Telegram feedback message toast */}
        {telegramStatus && (
          <div className="mb-3 px-4 py-2 bg-slate-900 border border-slate-700 text-white text-xs font-semibold rounded-xl text-center shadow-lg animate-in fade-in slide-in-from-top-2 no-print">
            {telegramStatus}
          </div>
        )}

        {/* ── THE PRINTABLE THERMAL RECEIPT ── */}
        <div
          id="printable-receipt"
          className="bg-white rounded-3xl shadow-2xl p-6 sm:p-7 text-slate-800 font-mono text-xs border border-slate-200/90 relative overflow-hidden"
        >
          {/* Top Receipt Jagged Decor */}
          <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-orange-500 via-amber-500 to-orange-600" />

          {/* Restaurant Header */}
          <div className="text-center pb-4 border-b border-dashed border-slate-300">
            <div className="flex justify-center mb-2">
              <SavoryLogo size="sm" variant="full" />
            </div>
            <p className="text-[11px] text-slate-500 uppercase tracking-wider font-sans font-bold">
              Artisan Cuisine &amp; Quick Service
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5 font-sans">
              123 Gourmet Blvd, Suite 100 • Phnom Penh, Cambodia
            </p>
            <p className="text-[10px] text-slate-400 font-sans">Tel: +855 (0) 97 39 18 206</p>
          </div>

          {/* Receipt Info */}
          <div className="py-3 border-b border-dashed border-slate-300 space-y-1">
            <div className="flex justify-between items-center text-slate-600">
              <span>Receipt No:</span>
              <span className="font-bold text-slate-900 font-mono">
                REC-{order.order_number || order.id.slice(0, 8)}
              </span>
            </div>
            <div className="flex justify-between items-center text-slate-600">
              <span>Date &amp; Time:</span>
              <span>{formattedDate}</span>
            </div>
            <div className="flex justify-between items-center text-slate-600">
              <span>Fulfillment:</span>
              <span className="font-bold text-slate-900 capitalize flex items-center gap-1">
                {order.order_type === 'dine_in' && <Utensils className="w-3 h-3 text-orange-500" />}
                {order.order_type === 'pickup' && <Store className="w-3 h-3 text-orange-500" />}
                {order.order_type === 'delivery' && <Truck className="w-3 h-3 text-orange-500" />}
                {order.order_type?.replace('_', ' ')}
                {order.table_number ? ` (Table #${order.table_number})` : ''}
              </span>
            </div>
          </div>

          {/* Customer Info */}
          <div className="py-2.5 border-b border-dashed border-slate-300 space-y-0.5 text-slate-600">
            <div className="flex justify-between">
              <span>Customer:</span>
              <span className="font-semibold text-slate-900">{order.customer_name}</span>
            </div>
            {order.phone && (
              <div className="flex justify-between">
                <span>Phone:</span>
                <span>{order.phone}</span>
              </div>
            )}
            {order.address && order.order_type === 'delivery' && (
              <div className="flex justify-between text-right">
                <span className="shrink-0 mr-2">Address:</span>
                <span className="text-[11px] text-slate-700 truncate max-w-[200px]">{order.address}</span>
              </div>
            )}
          </div>

          {/* Items Table */}
          <div className="py-3 border-b border-dashed border-slate-300">
            <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
              <span className="flex-1">Item Description</span>
              <span className="w-10 text-center">Qty</span>
              <span className="w-16 text-right">Amount</span>
            </div>

            <div className="space-y-1.5">
              {items.map((it) => (
                <div key={it.id} className="flex justify-between items-start text-xs">
                  <div className="flex-1 pr-2">
                    <div className="font-bold text-slate-800">{it.menu_item_name || 'Dish'}</div>
                    {it.notes && (
                      <div className="text-[10px] text-amber-700 italic">[{it.notes}]</div>
                    )}
                  </div>
                  <div className="w-10 text-center text-slate-600 font-semibold">{it.quantity}</div>
                  <div className="w-16 text-right font-bold text-slate-900">
                    ${(it.quantity * Number(it.unit_price)).toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Pricing Calculation */}
          <div className="py-3 border-b border-dashed border-slate-300 space-y-1 text-slate-600">
            <div className="flex justify-between">
              <span>Subtotal:</span>
              <span>${subtotal.toFixed(2)}</span>
            </div>
            {deliveryFee > 0 && (
              <div className="flex justify-between">
                <span>Delivery Fee:</span>
                <span>${deliveryFee.toFixed(2)}</span>
              </div>
            )}
            {discount > 0 && (
              <div className="flex justify-between text-emerald-600 font-bold">
                <span>Discount ({order.coupon_code || 'Promo'}):</span>
                <span>-${discount.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between items-center pt-2 text-sm border-t border-slate-200">
              <span className="font-black text-slate-900">TOTAL:</span>
              <span className="font-black text-base text-slate-900">
                ${total.toFixed(2)} USD
              </span>
            </div>
          </div>

          {/* Payment & Stamp */}
          <div className="py-3 border-b border-dashed border-slate-300">
            <div className="flex justify-between items-center">
              <div>
                <span className="text-slate-500 block text-[10px] uppercase">Payment Method</span>
                <span className="font-bold text-slate-800 uppercase">
                  {order.payment_method === 'khqr' ? '🇰🇭 Bakong KHQR' : order.payment_method}
                </span>
              </div>

              {/* Stamp */}
              <div
                className={`px-3 py-1 rounded-lg border-2 font-black uppercase tracking-wider text-[11px] rotate-[-2deg] ${
                  isPaid
                    ? 'border-emerald-600 text-emerald-700 bg-emerald-50/50'
                    : 'border-amber-500 text-amber-700 bg-amber-50/50'
                }`}
              >
                {isPaid ? 'PAID & VERIFIED' : 'UNPAID / PENDING'}
              </div>
            </div>

            {order.md5 && (
              <div className="mt-2 text-[9px] text-slate-400 font-mono truncate">
                TxRef: {order.md5}
              </div>
            )}
          </div>

          {/* QR Code Verification & Barcode */}
          <div className="pt-4 flex flex-col items-center text-center">
            {qrCodeUrl ? (
              <img src={qrCodeUrl} alt="Receipt QR" className="w-20 h-20 rounded-lg border border-slate-200" />
            ) : (
              <div className="w-20 h-20 bg-slate-100 rounded-lg flex items-center justify-center text-slate-400">
                <FileText className="w-8 h-8" />
              </div>
            )}
            <span className="text-[9px] text-slate-400 mt-1 font-mono tracking-widest uppercase">
              SCAN TO VERIFY ORDER
            </span>

            <p className="text-[11px] font-medium text-slate-500 mt-3 font-sans">
              Thank you for dining with Savory! 🙏
            </p>
            <p className="text-[9px] text-slate-400 font-sans mt-0.5">
              Please retain this receipt for warranty and pickup verification.
            </p>
          </div>
        </div>

        {/* Footer Close Button for Mobile */}
        <div className="mt-3 text-center no-print">
          <button
            onClick={onClose}
            className="w-full py-2.5 bg-slate-900 text-white rounded-2xl text-xs font-bold shadow-lg hover:bg-slate-800 transition"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
