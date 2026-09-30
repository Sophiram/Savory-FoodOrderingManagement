import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  type Category,
  type MenuItem,
  type CartItem,
  type OrderType,
  type PaymentMethod
} from '@/lib/supabase';
import {
  submitOrder,
  validateCoupon,
  fetchCategories,
  fetchMenuItems,
} from '@/lib/api';
import {
  isTelegramWebApp,
  getTelegramUser,
  initTelegramWebApp,
  tgHaptic,
  closeTelegramMiniApp,
  type TelegramUser,
} from '@/lib/telegram';
import SavoryLogo from '@/components/SavoryLogo';
import CustomerOrderTracking from '@/components/CustomerOrderTracking';
import FoodDetailModal from '@/components/FoodDetailModal';
import OrderReceiptModal from '@/components/OrderReceiptModal';
import {
  ShoppingBag,
  Plus,
  Minus,
  X,
  Search,
  Utensils,
  Clock,
  Truck,
  Store,
  MapPin,
  Phone,
  User,
  QrCode,
  Tag,
  CreditCard,
  Banknote,
  Loader2,
  CheckCircle2,
  Sparkles,
  Send,
  ExternalLink,
  ChevronRight,
  FileText
} from 'lucide-react';

export default function TelegramMiniAppPage() {
  const [tgUser, setTgUser] = useState<TelegramUser | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCat, setActiveCat] = useState<string>('all');
  const [search, setSearch] = useState('');

  // Cart
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [inspectingItem, setInspectingItem] = useState<MenuItem | null>(null);

  // Completed order tracking
  const [placedOrderId, setPlacedOrderId] = useState<string | null>(null);
  const [trackingKHQRMeta, setTrackingKHQRMeta] = useState<{
    qrString?: string | null;
    deeplink?: string | null;
    md5?: string | null;
  }>({});

  // Checkout Form
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [orderType, setOrderType] = useState<OrderType>('delivery');
  const [tableNumber, setTableNumber] = useState<string>('');
  const [orderNotes, setOrderNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('khqr');

  // Coupon
  const [couponCodeInput, setCouponCodeInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; discount: number } | null>(null);
  const [couponChecking, setCouponChecking] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  // Initialize Telegram
  useEffect(() => {
    initTelegramWebApp();
    const user = getTelegramUser();
    if (user) {
      setTgUser(user);
      const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ');
      setCustomerName(fullName || user.username || 'Telegram User');
    }

    // Check URL parameters for table or direct tracking
    const urlParams = new URLSearchParams(window.location.search);
    const tableParam = urlParams.get('table');
    if (tableParam) {
      setOrderType('dine_in');
      setTableNumber(tableParam);
    }
    const orderParam = urlParams.get('order');
    if (orderParam) {
      setPlacedOrderId(orderParam);
    }
  }, []);

  const loadData = useCallback(async () => {
    try {
      const [cats, menuItems] = await Promise.all([
        fetchCategories(),
        fetchMenuItems(),
      ]);
      setCategories(cats);
      setItems((menuItems ?? []).filter((m: MenuItem) => m.is_available));
    } catch (err) {
      console.error('Telegram Mini App Menu load error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, [loadData]);

  // Cart operations
  const addToCart = (item: MenuItem, qty = 1, notes?: string) => {
    tgHaptic.impact('light');
    setCart((prev) => {
      const idx = prev.findIndex((c) => c.menu_item.id === item.id && c.notes === notes);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx].quantity += qty;
        return updated;
      }
      return [...prev, { menu_item: item, quantity: qty, notes }];
    });
  };

  const updateCartQty = (index: number, delta: number) => {
    tgHaptic.selection();
    setCart((prev) =>
      prev
        .map((c, i) => (i === index ? { ...c, quantity: c.quantity + delta } : c))
        .filter((c) => c.quantity > 0)
    );
  };

  const removeCartItem = (index: number) => {
    tgHaptic.impact('medium');
    setCart((prev) => prev.filter((_, i) => i !== index));
  };

  const cartSubtotal = cart.reduce((sum, c) => sum + c.menu_item.price * c.quantity, 0);
  const cartCount = cart.reduce((sum, c) => sum + c.quantity, 0);
  const deliveryFee = orderType === 'delivery' ? 2.50 : 0;
  const discountAmount = appliedCoupon ? appliedCoupon.discount : 0;
  const finalCartTotal = Math.max(0, cartSubtotal + deliveryFee - discountAmount);

  // Apply Coupon
  const handleApplyCoupon = async () => {
    if (!couponCodeInput.trim()) return;
    setCouponChecking(true);
    setCouponError(null);
    const res = await validateCoupon(couponCodeInput.trim(), cartSubtotal);
    if (res.error) {
      tgHaptic.error();
      setCouponError(res.error);
      setAppliedCoupon(null);
    } else {
      tgHaptic.success();
      setAppliedCoupon({ code: couponCodeInput.trim().toUpperCase(), discount: res.discount });
      setCouponError(null);
    }
    setCouponChecking(false);
  };

  const removeCoupon = () => {
    tgHaptic.selection();
    setAppliedCoupon(null);
    setCouponCodeInput('');
    setCouponError(null);
  };

  const canCheckout =
    cart.length > 0 &&
    customerName.trim().length > 0 &&
    phone.trim().length > 0 &&
    (orderType !== 'delivery' || address.trim().length > 0) &&
    (orderType !== 'dine_in' || tableNumber.trim().length > 0);

  const handleCheckout = async () => {
    if (!canCheckout) return;
    tgHaptic.impact('heavy');
    setCheckoutLoading(true);
    setCheckoutError(null);

    const result = await submitOrder({
      customer_id: null,
      customer_name: customerName.trim(),
      phone: phone.trim(),
      address: orderType === 'delivery' ? address.trim() : null,
      order_type: orderType,
      table_number: orderType === 'dine_in' ? parseInt(tableNumber) : null,
      notes: orderNotes.trim() || null,
      coupon_code: appliedCoupon?.code || null,
      payment_method: paymentMethod,
      items: cart.map((c) => ({
        menu_item_id: c.menu_item.id,
        quantity: c.quantity,
        unit_price: c.menu_item.price,
        notes: c.notes,
        name: c.menu_item.name,
      })),
      telegram_user_id: tgUser ? String(tgUser.id) : null,
      telegram_chat_id: tgUser ? String(tgUser.id) : null,
    });

    setCheckoutLoading(false);

    if (!result.success || !result.order_id) {
      tgHaptic.error();
      setCheckoutError(result.error || 'Could not process order. Please try again.');
      return;
    }

    tgHaptic.success();
    setCart([]);
    setCartOpen(false);
    setAppliedCoupon(null);
    setPlacedOrderId(result.order_id);
    setTrackingKHQRMeta({
      qrString: result.qr_string || (result as any).qr_data || null,
      deeplink: result.deeplink || null,
      md5: result.md5 || null,
    });
  };

  // Filtered Items
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchCat = activeCat === 'all' || item.category_id === activeCat;
      const matchSearch =
        search === '' ||
        item.name.toLowerCase().includes(search.toLowerCase()) ||
        (item.description && item.description.toLowerCase().includes(search.toLowerCase()));
      return matchCat && matchSearch;
    });
  }, [items, activeCat, search]);

  // If viewing an active placed order
  if (placedOrderId) {
    return (
      <div className="min-h-screen bg-slate-50 p-3 sm:p-6 pb-20">
        <CustomerOrderTracking
          orderId={placedOrderId}
          qrString={trackingKHQRMeta.qrString}
          deeplink={trackingKHQRMeta.deeplink}
          md5={trackingKHQRMeta.md5}
          onBack={() => setPlacedOrderId(null)}
          onReorder={() => setPlacedOrderId(null)}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans pb-28">
      {/* ── Telegram Mini App Header ── */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-100 shadow-sm px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <SavoryLogo size="sm" variant="icon" />
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-base text-slate-900 tracking-tight">Savory</span>
                <span className="text-[10px] bg-blue-100 text-blue-800 font-extrabold px-1.5 py-0.5 rounded-md flex items-center gap-0.5">
                  <Send className="w-2.5 h-2.5" /> Mini App
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium">Fresh food, made to order</p>
            </div>
          </div>

          {/* User profile pill */}
          <div className="flex items-center gap-2">
            {tgUser ? (
              <div className="flex items-center gap-1.5 bg-slate-100 px-2.5 py-1 rounded-full border border-slate-200">
                <div className="w-5 h-5 rounded-full bg-blue-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {tgUser.first_name[0]}
                </div>
                <span className="text-xs font-semibold text-slate-700 max-w-[90px] truncate">
                  {tgUser.first_name}
                </span>
              </div>
            ) : (
              <span className="text-xs font-medium text-slate-500">Guest</span>
            )}

            {/* Cart Icon Button */}
            <button
              onClick={() => {
                tgHaptic.impact('light');
                setCartOpen(true);
              }}
              className="relative p-2 bg-orange-50 hover:bg-orange-100 text-orange-600 rounded-xl transition"
            >
              <ShoppingBag className="w-5 h-5" />
              {cartCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-orange-600 text-white text-[11px] font-black rounded-full flex items-center justify-center shadow-md animate-in zoom-in">
                  {cartCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="mt-3 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search savory dishes, drinks, pizzas..."
            className="w-full pl-9 pr-4 py-2 bg-slate-100 border border-slate-200/80 rounded-xl text-xs placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-orange-500 transition"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Categories Bar */}
        <div className="flex gap-2 overflow-x-auto pt-2.5 pb-1 scrollbar-hide -mx-4 px-4">
          <button
            onClick={() => {
              tgHaptic.selection();
              setActiveCat('all');
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
              activeCat === 'all'
                ? 'bg-orange-500 text-white shadow-sm shadow-orange-500/30'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All Items
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => {
                tgHaptic.selection();
                setActiveCat(cat.id);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                activeCat === cat.id
                  ? 'bg-orange-500 text-white shadow-sm shadow-orange-500/30'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </header>

      {/* ── Food Catalog ── */}
      <main className="flex-1 p-4 max-w-2xl mx-auto w-full">
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
            <p className="text-xs text-slate-400 font-medium">Loading delicious menu...</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="py-20 text-center">
            <div className="w-12 h-12 rounded-2xl bg-orange-50 text-orange-500 flex items-center justify-center mx-auto mb-3">
              <Utensils className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-slate-800 text-sm">No dishes found</h3>
            <p className="text-xs text-slate-400 mt-1">Try another category or search term.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {filteredItems.map((item) => (
              <div
                key={item.id}
                onClick={() => setInspectingItem(item)}
                className="bg-white rounded-2xl border border-slate-200/80 p-3 flex gap-3 shadow-sm hover:shadow-md transition cursor-pointer active:scale-[0.99]"
              >
                {/* Image */}
                <div className="w-24 h-24 rounded-xl bg-slate-100 overflow-hidden shrink-0 relative">
                  {item.image_url ? (
                    <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-300">
                      <Utensils className="w-6 h-6" />
                    </div>
                  )}
                  {item.is_popular && (
                    <span className="absolute top-1 left-1 bg-amber-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-md shadow-sm">
                      POPULAR
                    </span>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 flex flex-col justify-between min-w-0">
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm truncate">{item.name}</h4>
                    <p className="text-[11px] text-slate-500 line-clamp-2 mt-0.5 leading-snug">
                      {item.description || 'Crafted fresh with finest ingredients.'}
                    </p>
                  </div>

                  <div className="flex items-center justify-between mt-2 pt-1">
                    <span className="font-black text-slate-900 text-sm">
                      ${Number(item.price).toFixed(2)}
                    </span>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        addToCart(item);
                      }}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-bold shadow-sm transition active:scale-95"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* ── Sticky Telegram Bottom Order Bar ── */}
      {cartCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 p-3 bg-white/95 backdrop-blur-md border-t border-slate-200/90 shadow-2xl">
          <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
            <div>
              <span className="text-[11px] uppercase font-bold text-slate-400 block tracking-wider">
                {cartCount} {cartCount === 1 ? 'item' : 'items'}
              </span>
              <span className="text-xl font-black text-slate-900 leading-none">
                ${finalCartTotal.toFixed(2)} USD
              </span>
            </div>

            <button
              onClick={() => {
                tgHaptic.impact('medium');
                setCartOpen(true);
              }}
              className="flex-1 max-w-xs py-3 px-5 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white rounded-2xl font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-orange-500/30 transition active:scale-98"
            >
              <ShoppingBag className="w-4 h-4" />
              <span>View Cart &amp; Checkout</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── Food Detail Modal ── */}
      {inspectingItem && (
        <FoodDetailModal
          item={inspectingItem}
          isOpen={Boolean(inspectingItem)}
          onClose={() => setInspectingItem(null)}
          onAddToCart={addToCart}
        />
      )}

      {/* ── Cart Drawer / Checkout Sheet ── */}
      {cartOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
            {/* Drawer Header */}
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-orange-600" />
                <h3 className="font-extrabold text-base text-slate-900">Your Cart</h3>
                <span className="text-xs bg-orange-100 text-orange-800 font-bold px-2 py-0.5 rounded-full">
                  {cartCount}
                </span>
              </div>
              <button
                onClick={() => setCartOpen(false)}
                className="p-1.5 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded-xl"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Cart Items */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {cart.map((c, idx) => (
                <div key={idx} className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <h5 className="font-bold text-slate-900 text-xs truncate">{c.menu_item.name}</h5>
                    {c.notes && <p className="text-[10px] text-amber-700 italic">[{c.notes}]</p>}
                    <span className="text-xs font-semibold text-slate-500">
                      ${Number(c.menu_item.price).toFixed(2)} each
                    </span>
                  </div>

                  {/* Quantity controls */}
                  <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-0.5">
                    <button
                      onClick={() => updateCartQty(idx, -1)}
                      className="w-6 h-6 flex items-center justify-center text-slate-600 hover:bg-slate-100 rounded-lg"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="w-5 text-center text-xs font-bold text-slate-900">{c.quantity}</span>
                    <button
                      onClick={() => updateCartQty(idx, 1)}
                      className="w-6 h-6 flex items-center justify-center text-slate-600 hover:bg-slate-100 rounded-lg"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="font-bold text-sm text-slate-900 block">
                      ${(c.quantity * Number(c.menu_item.price)).toFixed(2)}
                    </span>
                    <button
                      onClick={() => removeCartItem(idx)}
                      className="text-[10px] text-rose-500 hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}

              {/* Fulfillment Option */}
              <div className="pt-2">
                <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1.5">
                  Order Type
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['delivery', 'pickup', 'dine_in'] as OrderType[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => {
                        tgHaptic.selection();
                        setOrderType(t);
                      }}
                      className={`py-2 px-1 text-center rounded-xl text-xs font-bold border transition ${
                        orderType === t
                          ? 'bg-orange-50 border-orange-500 text-orange-700'
                          : 'bg-slate-50 border-slate-200 text-slate-600'
                      }`}
                    >
                      {t === 'delivery' && '🛵 Delivery'}
                      {t === 'pickup' && '🛍️ Pickup'}
                      {t === 'dine_in' && '🍽️ Dine-In'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Customer Inputs */}
              <div className="space-y-2 pt-1">
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">Your Name *</label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Full name"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-orange-500"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">Phone Number *</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="e.g. 097 123 4567"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-orange-500"
                  />
                </div>

                {orderType === 'delivery' && (
                  <div>
                    <label className="text-[11px] font-bold text-slate-700 block mb-1">Delivery Address *</label>
                    <input
                      type="text"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="Street, Building, Apartment, City"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-orange-500"
                    />
                  </div>
                )}

                {orderType === 'dine_in' && (
                  <div>
                    <label className="text-[11px] font-bold text-slate-700 block mb-1">Table Number *</label>
                    <input
                      type="number"
                      value={tableNumber}
                      onChange={(e) => setTableNumber(e.target.value)}
                      placeholder="e.g. 3"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-orange-500"
                    />
                  </div>
                )}

                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">Special Notes</label>
                  <input
                    type="text"
                    value={orderNotes}
                    onChange={(e) => setOrderNotes(e.target.value)}
                    placeholder="Allergies, extra sauce, etc."
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-orange-500"
                  />
                </div>
              </div>

              {/* Coupon Code */}
              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">Promo Coupon</label>
                {appliedCoupon ? (
                  <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
                    <div className="flex items-center gap-1.5 text-xs text-emerald-800 font-bold">
                      <Tag className="w-3.5 h-3.5" />
                      <span>{appliedCoupon.code} (-${appliedCoupon.discount.toFixed(2)})</span>
                    </div>
                    <button onClick={removeCoupon} className="text-xs text-rose-500 font-bold hover:underline">
                      Remove
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={couponCodeInput}
                      onChange={(e) => setCouponCodeInput(e.target.value.toUpperCase())}
                      placeholder="e.g. SAVORY10"
                      className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs uppercase"
                    />
                    <button
                      type="button"
                      onClick={handleApplyCoupon}
                      disabled={couponChecking || !couponCodeInput.trim()}
                      className="px-3 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold disabled:opacity-50"
                    >
                      {couponChecking ? '...' : 'Apply'}
                    </button>
                  </div>
                )}
                {couponError && <p className="text-[11px] text-rose-500 mt-1">{couponError}</p>}
              </div>

              {/* Payment Method Selector */}
              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1.5">Payment Method</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      tgHaptic.selection();
                      setPaymentMethod('khqr');
                    }}
                    className={`py-2 px-2 text-center rounded-xl text-xs font-bold border flex items-center justify-center gap-1.5 transition ${
                      paymentMethod === 'khqr'
                        ? 'bg-orange-50 border-orange-500 text-orange-700'
                        : 'bg-slate-50 border-slate-200 text-slate-600'
                    }`}
                  >
                    <QrCode className="w-4 h-4 text-orange-600" />
                    <span>Bakong KHQR</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      tgHaptic.selection();
                      setPaymentMethod('cash');
                    }}
                    className={`py-2 px-2 text-center rounded-xl text-xs font-bold border flex items-center justify-center gap-1.5 transition ${
                      paymentMethod === 'cash'
                        ? 'bg-orange-50 border-orange-500 text-orange-700'
                        : 'bg-slate-50 border-slate-200 text-slate-600'
                    }`}
                  >
                    <Banknote className="w-4 h-4 text-emerald-600" />
                    <span>Cash</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Checkout Pricing Footer */}
            <div className="border-t border-slate-200 p-4 bg-slate-50 space-y-2">
              <div className="space-y-1 text-xs text-slate-600">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span>${cartSubtotal.toFixed(2)}</span>
                </div>
                {deliveryFee > 0 && (
                  <div className="flex justify-between">
                    <span>Delivery Fee:</span>
                    <span>${deliveryFee.toFixed(2)}</span>
                  </div>
                )}
                {discountAmount > 0 && (
                  <div className="flex justify-between text-emerald-600 font-bold">
                    <span>Discount:</span>
                    <span>-${discountAmount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between font-black text-slate-900 text-base pt-1 border-t border-slate-200">
                  <span>Total:</span>
                  <span>${finalCartTotal.toFixed(2)} USD</span>
                </div>
              </div>

              {checkoutError && (
                <p className="text-xs text-rose-500 font-semibold text-center">{checkoutError}</p>
              )}

              <button
                type="button"
                onClick={handleCheckout}
                disabled={checkoutLoading || !canCheckout}
                className="w-full py-3 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white rounded-2xl font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-orange-500/25 transition disabled:opacity-50"
              >
                {checkoutLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                <span>
                  {checkoutLoading
                    ? 'Processing Order...'
                    : `Confirm & Pay $${finalCartTotal.toFixed(2)}`}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
