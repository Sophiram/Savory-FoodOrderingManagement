import { useEffect, useState, useCallback } from 'react';
import { supabase, type Category, type MenuItem, type CartItem, type OrderType, type PaymentMethod } from '@/lib/supabase';
import { submitOrder, validateCoupon, fetchCategories, fetchMenuItems } from '@/lib/api';
import SavoryLogo from '@/components/SavoryLogo';
import CustomerOrderTracking from '@/components/CustomerOrderTracking';
import FoodDetailModal from '@/components/FoodDetailModal';
import {
  ShoppingBag,
  Plus,
  Minus,
  X,
  Search,
  Utensils,
  ArrowRight,
  Clock,
  Truck,
  Store,
  MapPin,
  Phone,
  User,
  NotebookPen,
  QrCode,
  Tag,
  CreditCard,
  Banknote,
  Navigation,
  Loader2,
  CheckCircle2,
  Sparkles,
  AlertCircle,
  LogIn,
} from 'lucide-react';

export default function PublicOrderPage() {
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

  // Completed order for live tracking
  const [placedOrderId, setPlacedOrderId] = useState<string | null>(null);

  // Form
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [orderType, setOrderType] = useState<OrderType>('delivery');
  const [tableNumber, setTableNumber] = useState<string>('');
  const [orderNotes, setOrderNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');

  // Coupon
  const [couponCodeInput, setCouponCodeInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; discount: number } | null>(null);
  const [couponChecking, setCouponChecking] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);

  // GPS Location
  const [customerLat, setCustomerLat] = useState<number | null>(null);
  const [customerLng, setCustomerLng] = useState<number | null>(null);
  const [locationStatus, setLocationStatus] = useState<'idle' | 'loading' | 'granted' | 'denied'>('idle');

  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [cats, menuItems] = await Promise.all([
        fetchCategories(),
        fetchMenuItems(),
      ]);
      setCategories(cats);
      setItems((menuItems ?? []).filter((m: MenuItem) => m.is_available));
    } catch (err) {
      console.error('Menu load error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 4000); // Live dynamic auto-refresh
    const urlParams = new URLSearchParams(window.location.search);
    const tableParam = urlParams.get('table');
    if (tableParam) {
      setOrderType('dine_in');
      setTableNumber(tableParam);
    }
    return () => clearInterval(interval);
  }, [loadData]);

  const requestLocation = () => {
    if (!navigator.geolocation) {
      setLocationStatus('denied');
      return;
    }
    setLocationStatus('loading');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCustomerLat(pos.coords.latitude);
        setCustomerLng(pos.coords.longitude);
        setLocationStatus('granted');
      },
      () => setLocationStatus('denied'),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const filteredItems = items.filter((item) => {
    const matchesCat = activeCat === 'all' || item.category_id === activeCat;
    const matchesSearch =
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      (item.description && item.description.toLowerCase().includes(search.toLowerCase()));
    return matchesCat && matchesSearch;
  });

  const addToCart = (item: MenuItem, qty = 1, notes?: string) => {
    setCart((prev) => {
      const existingIdx = prev.findIndex((c) => c.menu_item.id === item.id && c.notes === notes);
      if (existingIdx >= 0) {
        const updated = [...prev];
        updated[existingIdx].quantity += qty;
        return updated;
      }
      return [...prev, { menu_item: item, quantity: qty, notes }];
    });
  };

  const updateCartQty = (index: number, delta: number) => {
    setCart((prev) =>
      prev
        .map((c, i) => (i === index ? { ...c, quantity: c.quantity + delta } : c))
        .filter((c) => c.quantity > 0)
    );
  };

  const removeCartItem = (index: number) => {
    setCart((prev) => prev.filter((_, i) => i !== index));
  };

  const cartSubtotal = cart.reduce((sum, c) => sum + c.menu_item.price * c.quantity, 0);
  const cartCount = cart.reduce((sum, c) => sum + c.quantity, 0);
  const deliveryFee = orderType === 'delivery' ? 2.50 : 0;
  const discountAmount = appliedCoupon ? appliedCoupon.discount : 0;
  const finalCartTotal = Math.max(0, cartSubtotal + deliveryFee - discountAmount);

  const handleApplyCoupon = async () => {
    if (!couponCodeInput.trim()) return;
    setCouponChecking(true);
    setCouponError(null);
    const res = await validateCoupon(couponCodeInput.trim(), cartSubtotal);
    if (res.error) {
      setCouponError(res.error);
      setAppliedCoupon(null);
    } else {
      setAppliedCoupon({ code: couponCodeInput.trim().toUpperCase(), discount: res.discount });
      setCouponError(null);
    }
    setCouponChecking(false);
  };

  const removeCoupon = () => {
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
    setCheckoutLoading(true);
    setCheckoutError(null);

    const result = await submitOrder({
      customer_name: customerName,
      phone,
      address: orderType === 'delivery' ? address : null,
      order_type: orderType,
      table_number: orderType === 'dine_in' ? parseInt(tableNumber) : null,
      notes: orderNotes || null,
      coupon_code: appliedCoupon?.code || null,
      payment_method: paymentMethod,
      items: cart.map((c) => ({
        menu_item_id: c.menu_item.id,
        quantity: c.quantity,
        unit_price: c.menu_item.price,
        notes: c.notes,
        name: c.menu_item.name,
      })),
      customer_lat: customerLat,
      customer_lng: customerLng,
    });

    setCheckoutLoading(false);

    if (!result.success || !result.order_id) {
      setCheckoutError(result.error || 'Could not place order. Please try again.');
      return;
    }

    setCart([]);
    setCartOpen(false);
    setPlacedOrderId(result.order_id);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50">
        <SavoryLogo size="lg" className="mb-4 animate-bounce" />
        <p className="text-sm font-semibold text-slate-500">Preparing fresh menu...</p>
      </div>
    );
  }

  // If order was placed, display live tracker
  if (placedOrderId) {
    return (
      <div className="min-h-screen bg-slate-50 py-8">
        <CustomerOrderTracking
          orderId={placedOrderId}
          onBack={() => setPlacedOrderId(null)}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <FoodDetailModal
        item={inspectingItem}
        onClose={() => setInspectingItem(null)}
        onAddToCart={addToCart}
      />

      {/* Public Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-18 flex items-center justify-between">
          <SavoryLogo size="md" theme="light" />

          <div className="flex items-center gap-3">
            <a
              href="/"
              className="px-4 py-2 border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5"
            >
              <LogIn className="w-3.5 h-3.5" /> Sign In / Account
            </a>

            <button
              onClick={() => setCartOpen(true)}
              className="relative p-2.5 rounded-xl bg-orange-50 text-orange-600 hover:bg-orange-100 transition-colors border border-orange-200"
              title="View Cart"
            >
              <ShoppingBag className="w-5 h-5" />
              {cartCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-orange-500 text-white text-[11px] font-black rounded-full flex items-center justify-center shadow-md">
                  {cartCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Hero Banner */}
      <div className="relative bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 overflow-hidden text-white border-b border-white/10">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-32 -right-32 w-96 h-96 bg-orange-500/15 rounded-full blur-3xl" />
          <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-14 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="max-w-xl space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-500/20 text-orange-400 text-xs font-bold uppercase tracking-wider border border-orange-500/30">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" /> Guest &amp; Online Ordering
            </div>
            <h1 className="text-3xl sm:text-5xl font-black tracking-tight leading-tight">
              Order directly to your door or table.
            </h1>
            <p className="text-slate-400 text-sm sm:text-base leading-relaxed">
              Explore our chef's specialties, pay securely via Cash or Bakong KHQR, and track your kitchen status in real-time.
            </p>
            {tableNumber && (
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-400/20 text-amber-300 text-xs font-bold">
                <QrCode className="w-4 h-4" /> Dine-In Order: Table #{tableNumber}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Menu Content */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-4 pb-24 w-full">
        {/* Search */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="relative w-full sm:max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search dishes, drinks, desserts..."
              className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-2xl text-sm focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 shadow-xs"
            />
          </div>
          <div className="text-xs font-semibold text-slate-500">
            {filteredItems.length} dishes available
          </div>
        </div>

        {/* Categories */}
        <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-hide">
          <button
            onClick={() => setActiveCat('all')}
            className={`px-4 py-2.5 rounded-2xl text-xs font-extrabold whitespace-nowrap transition-all shadow-xs ${
              activeCat === 'all'
                ? 'bg-slate-900 text-white'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            All Items ({items.length})
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCat(cat.id)}
              className={`px-4 py-2.5 rounded-2xl text-xs font-extrabold whitespace-nowrap transition-all shadow-xs ${
                activeCat === cat.id
                  ? 'bg-orange-500 text-white shadow-orange-500/20'
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 pt-2">
          {filteredItems.map((item) => (
            <div
              key={item.id}
              onClick={() => setInspectingItem(item)}
              className="bg-white rounded-3xl border border-slate-200/90 overflow-hidden hover:shadow-xl hover:shadow-orange-500/5 transition-all duration-300 flex flex-col group cursor-pointer"
            >
              <div className="relative h-44 bg-slate-100 overflow-hidden">
                {item.image_url ? (
                  <img
                    src={item.image_url}
                    alt={item.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-300">
                    <Utensils className="w-10 h-10" />
                  </div>
                )}
                {item.is_popular && (
                  <span className="absolute top-3 left-3 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500 text-white shadow-md">
                    Popular
                  </span>
                )}
              </div>

              <div className="p-5 flex-1 flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-extrabold text-base text-slate-900 group-hover:text-orange-600 transition-colors">
                      {item.name}
                    </h3>
                    <span className="text-base font-black text-slate-900 shrink-0">
                      ${Number(item.price).toFixed(2)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1.5 line-clamp-2 leading-relaxed">
                    {item.description || 'Deliciously cooked with chef ingredients.'}
                  </p>
                </div>

                <div className="pt-4 flex items-center justify-between gap-3 border-t border-slate-100 mt-4">
                  <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-1">
                    <Clock className="w-3 h-3 text-orange-500" /> {item.preparation_time || 15}m
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      addToCart(item, 1);
                    }}
                    className="px-3.5 py-2 bg-slate-900 text-white group-hover:bg-gradient-to-r group-hover:from-amber-400 group-hover:to-orange-500 group-hover:text-slate-950 font-bold rounded-xl text-xs transition-all flex items-center gap-1.5 shadow-xs"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* Floating Cart Pill */}
      {cartCount > 0 && !cartOpen && (
        <button
          onClick={() => setCartOpen(true)}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-slate-950 text-white px-6 py-3.5 rounded-full shadow-2xl shadow-orange-500/20 flex items-center gap-4 hover:scale-105 transition-all border border-white/10"
        >
          <div className="relative">
            <ShoppingBag className="w-5 h-5 text-orange-400" />
            <span className="absolute -top-2 -right-2 w-5 h-5 bg-orange-500 text-white text-[10px] font-black rounded-full flex items-center justify-center">
              {cartCount}
            </span>
          </div>
          <span className="text-xs font-bold uppercase tracking-wider text-slate-200">View Cart</span>
          <span className="text-sm font-black text-amber-400">${finalCartTotal.toFixed(2)}</span>
          <ArrowRight className="w-4 h-4 text-orange-400" />
        </button>
      )}

      {/* Cart Drawer */}
      {cartOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={() => setCartOpen(false)} />
          <div className="relative w-full max-w-lg bg-white shadow-2xl flex flex-col h-full animate-slide-in-right z-10">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <ShoppingBag className="w-5 h-5 text-orange-500" />
                <h3 className="text-base font-extrabold text-slate-900">Your Cart</h3>
                <span className="text-xs bg-orange-100 text-orange-800 font-bold px-2 py-0.5 rounded-full">
                  {cartCount} items
                </span>
              </div>
              <button
                onClick={() => setCartOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {cart.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                <ShoppingBag className="w-12 h-12 text-slate-300 mb-2" />
                <p className="text-sm text-slate-400 font-medium">Your cart is empty</p>
              </div>
            ) : (
              <>
                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
                  {cart.map((c, idx) => (
                    <div
                      key={`${c.menu_item.id}-${idx}`}
                      className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3.5 flex items-center gap-3"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-sm text-slate-900 truncate">{c.menu_item.name}</div>
                        {c.notes && (
                          <div className="text-[11px] text-amber-600 truncate mt-0.5">Note: {c.notes}</div>
                        )}
                        <div className="text-xs text-slate-400 mt-0.5">${Number(c.menu_item.price).toFixed(2)} each</div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 bg-white border border-slate-200 rounded-xl p-1">
                        <button
                          onClick={() => updateCartQty(idx, -1)}
                          className="w-6 h-6 rounded-lg flex items-center justify-center text-slate-600 hover:bg-slate-100"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="w-5 text-center text-xs font-bold text-slate-900">{c.quantity}</span>
                        <button
                          onClick={() => updateCartQty(idx, 1)}
                          className="w-6 h-6 rounded-lg flex items-center justify-center text-slate-600 hover:bg-slate-100"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="font-bold text-sm text-slate-900">
                          ${(c.menu_item.price * c.quantity).toFixed(2)}
                        </div>
                        <button
                          onClick={() => removeCartItem(idx)}
                          className="text-[10px] text-rose-500 hover:underline mt-0.5 block"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="border-t border-slate-200 bg-white px-6 py-4 space-y-4 max-h-[55vh] overflow-y-auto">
                  {/* Order Type */}
                  <div>
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 block">
                      Order Fulfillment
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => setOrderType('delivery')}
                        className={`py-2 px-2.5 rounded-xl text-xs font-bold border flex flex-col items-center gap-1 transition-all ${
                          orderType === 'delivery'
                            ? 'bg-orange-50 border-orange-500 text-orange-700 shadow-xs'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <Truck className="w-4 h-4" />
                        <span>Delivery</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setOrderType('pickup')}
                        className={`py-2 px-2.5 rounded-xl text-xs font-bold border flex flex-col items-center gap-1 transition-all ${
                          orderType === 'pickup'
                            ? 'bg-orange-50 border-orange-500 text-orange-700 shadow-xs'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <Store className="w-4 h-4" />
                        <span>Pickup</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setOrderType('dine_in')}
                        className={`py-2 px-2.5 rounded-xl text-xs font-bold border flex flex-col items-center gap-1 transition-all ${
                          orderType === 'dine_in'
                            ? 'bg-orange-50 border-orange-500 text-orange-700 shadow-xs'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <Utensils className="w-4 h-4" />
                        <span>Dine-In</span>
                      </button>
                    </div>
                  </div>

                  {/* Customer details */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-1 block">
                        Your Name *
                      </label>
                      <input
                        type="text"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        placeholder="John Doe"
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-orange-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-1 block">
                        Phone Number *
                      </label>
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="+1 (555) 000-0000"
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-orange-500"
                      />
                    </div>
                  </div>

                  {orderType === 'delivery' && (
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                        Delivery Address *
                      </label>
                      <input
                        type="text"
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        placeholder="Street, Building, Apartment"
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-orange-500"
                      />
                      <button
                        type="button"
                        onClick={requestLocation}
                        className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-bold border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600"
                      >
                        <Navigation className="w-3.5 h-3.5 text-orange-500" />
                        {locationStatus === 'granted' ? 'GPS Location Attached' : 'Share GPS Location for Driver'}
                      </button>
                    </div>
                  )}

                  {orderType === 'dine_in' && (
                    <div>
                      <label className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-1 block">
                        Table Number *
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={tableNumber}
                        onChange={(e) => setTableNumber(e.target.value)}
                        placeholder="e.g. 3"
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-orange-500"
                      />
                    </div>
                  )}

                  {/* Payment */}
                  <div>
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 block">
                      Payment Method
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => setPaymentMethod('cash')}
                        className={`py-2 px-2 rounded-xl text-xs font-bold border flex flex-col items-center gap-1 ${
                          paymentMethod === 'cash' ? 'bg-orange-50 border-orange-500 text-orange-700' : 'bg-white border-slate-200 text-slate-600'
                        }`}
                      >
                        <Banknote className="w-4 h-4" />
                        <span>Cash</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setPaymentMethod('khqr')}
                        className={`py-2 px-2 rounded-xl text-xs font-bold border flex flex-col items-center gap-1 ${
                          paymentMethod === 'khqr' ? 'bg-orange-50 border-orange-500 text-orange-700' : 'bg-white border-slate-200 text-slate-600'
                        }`}
                      >
                        <QrCode className="w-4 h-4" />
                        <span>KHQR</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setPaymentMethod('card')}
                        className={`py-2 px-2 rounded-xl text-xs font-bold border flex flex-col items-center gap-1 ${
                          paymentMethod === 'card' ? 'bg-orange-50 border-orange-500 text-orange-700' : 'bg-white border-slate-200 text-slate-600'
                        }`}
                      >
                        <CreditCard className="w-4 h-4" />
                        <span>Card</span>
                      </button>
                    </div>
                  </div>

                  {/* Coupon */}
                  <div>
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-1 block">
                      Coupon Code
                    </label>
                    {appliedCoupon ? (
                      <div className="flex items-center justify-between p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs">
                        <span className="font-bold">Code: {appliedCoupon.code} (-${appliedCoupon.discount.toFixed(2)})</span>
                        <button type="button" onClick={removeCoupon} className="text-rose-600 font-bold">Remove</button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={couponCodeInput}
                          onChange={(e) => setCouponCodeInput(e.target.value.toUpperCase())}
                          placeholder="SAVORY10"
                          className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs uppercase"
                        />
                        <button
                          type="button"
                          onClick={handleApplyCoupon}
                          disabled={couponChecking || !couponCodeInput.trim()}
                          className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold"
                        >
                          {couponChecking ? '...' : 'Apply'}
                        </button>
                      </div>
                    )}
                    {couponError && <p className="text-[11px] text-rose-500 mt-1">{couponError}</p>}
                  </div>

                  {/* Notes */}
                  <div>
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-1 block">
                      Kitchen Notes
                    </label>
                    <input
                      type="text"
                      value={orderNotes}
                      onChange={(e) => setOrderNotes(e.target.value)}
                      placeholder="Special requests or instructions"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                    />
                  </div>

                  {/* Summary */}
                  <div className="border-t border-slate-100 pt-3 space-y-1.5 text-xs">
                    <div className="flex justify-between text-slate-500">
                      <span>Subtotal</span>
                      <span>${cartSubtotal.toFixed(2)}</span>
                    </div>
                    {deliveryFee > 0 && (
                      <div className="flex justify-between text-slate-500">
                        <span>Delivery Fee</span>
                        <span>${deliveryFee.toFixed(2)}</span>
                      </div>
                    )}
                    {discountAmount > 0 && (
                      <div className="flex justify-between text-emerald-600 font-bold">
                        <span>Discount</span>
                        <span>-${discountAmount.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between items-center text-sm pt-2 border-t border-slate-200 font-black text-slate-900">
                      <span>Total Amount</span>
                      <span className="text-xl text-orange-600">${finalCartTotal.toFixed(2)}</span>
                    </div>
                  </div>

                  {checkoutError && (
                    <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{checkoutError}</span>
                    </div>
                  )}

                  <button
                    onClick={handleCheckout}
                    disabled={!canCheckout || checkoutLoading}
                    className="w-full py-3.5 bg-gradient-to-r from-amber-400 via-orange-500 to-orange-600 text-slate-950 font-black rounded-2xl hover:shadow-lg hover:shadow-orange-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {checkoutLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Placing Your Order...</span>
                      </>
                    ) : (
                      <>
                        <span>Place Order · ${finalCartTotal.toFixed(2)}</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
