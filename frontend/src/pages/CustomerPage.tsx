import { useEffect, useState, useCallback } from 'react';
import { supabase, type Category, type MenuItem, type CartItem, type OrderType, type PaymentMethod } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { submitOrder, validateCoupon, fetchCategories, fetchMenuItems } from '@/lib/api';
import SavoryLogo from '@/components/SavoryLogo';
import CustomerOrderTracking from '@/components/CustomerOrderTracking';
import CustomerOrderHistory from '@/components/CustomerOrderHistory';
import CustomerProfileView from '@/components/CustomerProfileView';
import FoodDetailModal from '@/components/FoodDetailModal';
import {
  ShoppingBag,
  Plus,
  Minus,
  X,
  Search,
  Utensils,
  ArrowRight,
  Shield,
  LogOut,
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
  ClipboardList,
  AlertCircle,
} from 'lucide-react';

interface Props {
  onGoToAdmin?: () => void;
  initialTable?: number | null;
}

export default function CustomerPage({ onGoToAdmin, initialTable }: Props) {
  const { profile, signOut, isStaff } = useAuth();

  // Navigation tab: 'menu' | 'tracking' | 'history' | 'profile'
  const [activeTab, setActiveTab] = useState<'menu' | 'tracking' | 'history' | 'profile'>('menu');
  const [activeTrackingOrderId, setActiveTrackingOrderId] = useState<string | null>(null);

  // Data
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCat, setActiveCat] = useState<string>('all');
  const [search, setSearch] = useState('');

  // Cart
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  // Selected item for detail modal
  const [inspectingItem, setInspectingItem] = useState<MenuItem | null>(null);

  // Checkout inputs
  const [customerName, setCustomerName] = useState(profile?.full_name || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [address, setAddress] = useState(profile?.address || '');
  const [orderType, setOrderType] = useState<OrderType>(initialTable ? 'dine_in' : 'delivery');
  const [tableNumber, setTableNumber] = useState<string>(initialTable ? String(initialTable) : '');
  const [orderNotes, setOrderNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('khqr');
  const [trackingKHQRMeta, setTrackingKHQRMeta] = useState<{
    qrString?: string | null;
    deeplink?: string | null;
    md5?: string | null;
  }>({});

  // Coupon state
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
    return () => clearInterval(interval);
  }, [loadData]);

  // Keep name & contact in sync if profile updates
  useEffect(() => {
    if (profile) {
      if (!customerName && profile.full_name) setCustomerName(profile.full_name);
      if (!phone && profile.phone) setPhone(profile.phone);
      if (!address && profile.address) setAddress(profile.address);
    }
  }, [profile, customerName, phone, address]);

  // Check URL table parameter on mount
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tableParam = urlParams.get('table');
    if (tableParam) {
      setOrderType('dine_in');
      setTableNumber(tableParam);
    }
  }, []);

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

  // Apply Coupon
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
      customer_id: profile?.id || null,
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
      setCheckoutError(result.error || 'Could not process order. Please try again.');
      return;
    }

    // Clear cart and switch to live tracking view
    setCart([]);
    setCartOpen(false);
    setAppliedCoupon(null);
    setActiveTrackingOrderId(result.order_id);
    setTrackingKHQRMeta({
      qrString: result.qr_string || result.qr_data || null,
      deeplink: result.deeplink || null,
      md5: result.md5 || null,
    });
    setActiveTab('tracking');
  };

  const handleReorder = (itemsToReorder: { menuItemId: string; quantity: number }[]) => {
    const newItems: CartItem[] = [];
    for (const r of itemsToReorder) {
      const match = items.find((m) => m.id === r.menuItemId);
      if (match && match.is_available) {
        newItems.push({ menu_item: match, quantity: r.quantity });
      }
    }
    if (newItems.length > 0) {
      setCart((prev) => [...prev, ...newItems]);
      setCartOpen(true);
      setActiveTab('menu');
    } else {
      alert('Selected items are currently out of stock.');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50">
        <SavoryLogo size="lg" className="mb-4 animate-bounce" />
        <p className="text-sm font-semibold text-slate-500">Preparing fresh menu...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Food Detail Modal */}
      <FoodDetailModal
        item={inspectingItem}
        onClose={() => setInspectingItem(null)}
        onAddToCart={addToCart}
      />

      {/* Main Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-18 flex items-center justify-between">
          <div
            onClick={() => setActiveTab('menu')}
            className="cursor-pointer transition-opacity hover:opacity-95"
          >
            <SavoryLogo size="md" theme="light" />
          </div>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center gap-1 bg-slate-100/80 p-1 rounded-2xl border border-slate-200/60">
            <button
              onClick={() => setActiveTab('menu')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'menu'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Menu
            </button>
            {activeTrackingOrderId && (
              <button
                onClick={() => setActiveTab('tracking')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                  activeTab === 'tracking'
                    ? 'bg-orange-500 text-white shadow-xs'
                    : 'text-orange-600 hover:bg-orange-50'
                }`}
              >
                <Clock className="w-3.5 h-3.5" /> Live Tracking
              </button>
            )}
            <button
              onClick={() => setActiveTab('history')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'history'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Order History
            </button>
            <button
              onClick={() => setActiveTab('profile')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'profile'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Profile
            </button>
          </nav>

          {/* Right Action buttons */}
          <div className="flex items-center gap-2">
            {isStaff && (
              <button
                onClick={onGoToAdmin}
                className="px-3.5 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-colors flex items-center gap-1.5 shadow-sm"
              >
                <Shield className="w-3.5 h-3.5 text-orange-400" />
                <span className="hidden sm:inline">Admin Dashboard</span>
              </button>
            )}

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

            {profile && (
              <button
                onClick={signOut}
                title="Sign Out"
                className="p-2.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors"
              >
                <LogOut className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {/* Mobile Subnavigation */}
        <div className="md:hidden flex border-t border-slate-100 overflow-x-auto px-4 py-2 gap-2 bg-white scrollbar-hide">
          <button
            onClick={() => setActiveTab('menu')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap ${
              activeTab === 'menu' ? 'bg-orange-500 text-white' : 'text-slate-600 bg-slate-100'
            }`}
          >
            Menu
          </button>
          {activeTrackingOrderId && (
            <button
              onClick={() => setActiveTab('tracking')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap flex items-center gap-1 ${
                activeTab === 'tracking' ? 'bg-orange-500 text-white' : 'text-orange-600 bg-orange-50'
              }`}
            >
              <Clock className="w-3 h-3" /> Live Tracking
            </button>
          )}
          <button
            onClick={() => setActiveTab('history')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap ${
              activeTab === 'history' ? 'bg-orange-500 text-white' : 'text-slate-600 bg-slate-100'
            }`}
          >
            Orders
          </button>
          <button
            onClick={() => setActiveTab('profile')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap ${
              activeTab === 'profile' ? 'bg-orange-500 text-white' : 'text-slate-600 bg-slate-100'
            }`}
          >
            Profile
          </button>
        </div>
      </header>

      {/* VIEW: ORDER TRACKING */}
      {activeTab === 'tracking' && activeTrackingOrderId && (
        <main className="flex-1">
          <CustomerOrderTracking
            orderId={activeTrackingOrderId}
            qrString={trackingKHQRMeta.qrString}
            deeplink={trackingKHQRMeta.deeplink}
            md5={trackingKHQRMeta.md5}
            onBack={() => setActiveTab('menu')}
            onReorder={handleReorder}
          />
        </main>
      )}

      {/* VIEW: ORDER HISTORY */}
      {activeTab === 'history' && (
        <main className="flex-1">
          <CustomerOrderHistory
            onSelectOrder={(id) => {
              setActiveTrackingOrderId(id);
              setActiveTab('tracking');
            }}
            onReorder={(orderId) => {
              supabase
                .from('order_items')
                .select('menu_item_id, quantity')
                .eq('order_id', orderId)
                .then(({ data }) => {
                  if (data) {
                    handleReorder(
                      data.map((d) => ({ menuItemId: d.menu_item_id, quantity: d.quantity }))
                    );
                  }
                });
            }}
          />
        </main>
      )}

      {/* VIEW: PROFILE */}
      {activeTab === 'profile' && (
        <main className="flex-1">
          <CustomerProfileView />
        </main>
      )}

      {/* VIEW: MENU & ORDERING */}
      {activeTab === 'menu' && (
        <main className="flex-1 pb-24">
          {/* Hero Banner */}
          <div className="relative bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 overflow-hidden text-white border-b border-white/10">
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute -top-32 -right-32 w-96 h-96 bg-orange-500/15 rounded-full blur-3xl" />
              <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl" />
            </div>

            <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-16 flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="max-w-xl space-y-3">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-500/20 text-orange-400 text-xs font-bold uppercase tracking-wider border border-orange-500/30">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" /> Authentic Restaurant Experience
                </div>
                <h1 className="text-3xl sm:text-5xl font-black tracking-tight leading-tight">
                  Handcrafted food, cooked to perfection.
                </h1>
                <p className="text-slate-400 text-sm sm:text-base leading-relaxed">
                  Browse our full menu of appetizers, gourmet mains, beverages, and desserts. Freshly made to order for delivery, pickup, or dine-in.
                </p>
                {initialTable && (
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-xl bg-amber-400/20 text-amber-300 text-xs font-semibold">
                    <QrCode className="w-3.5 h-3.5" /> Ordering at Table #{initialTable}
                  </div>
                )}
              </div>

              {/* Quick perks card */}
              <div className="grid grid-cols-2 gap-3 bg-white/5 border border-white/10 rounded-3xl p-5 backdrop-blur-md max-w-sm">
                <div>
                  <div className="text-xl font-black text-amber-400">15-25m</div>
                  <div className="text-xs text-slate-400">Fast Preparation</div>
                </div>
                <div>
                  <div className="text-xl font-black text-orange-400">KHQR / Cash</div>
                  <div className="text-xs text-slate-400">Flexible Payment</div>
                </div>
                <div>
                  <div className="text-xl font-black text-emerald-400">10% OFF</div>
                  <div className="text-xs text-slate-400">Code SAVORY10</div>
                </div>
                <div>
                  <div className="text-xl font-black text-sky-400">GPS Live</div>
                  <div className="text-xs text-slate-400">Doorstep Delivery</div>
                </div>
              </div>
            </div>
          </div>

          {/* Search & Categories Bar */}
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              {/* Search Box */}
              <div className="relative w-full sm:max-w-md">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search dishes, ingredients, drinks..."
                  className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-2xl text-sm focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 shadow-xs"
                />
              </div>

              <div className="text-xs font-semibold text-slate-500">
                Showing {filteredItems.length} dishes
              </div>
            </div>

            {/* Category Pills */}
            <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-hide">
              <button
                onClick={() => setActiveCat('all')}
                className={`px-4 py-2.5 rounded-2xl text-xs font-extrabold whitespace-nowrap transition-all shadow-xs ${
                  activeCat === 'all'
                    ? 'bg-slate-900 text-white'
                    : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                All Menu ({items.length})
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

            {/* Menu Items Grid */}
            {filteredItems.length === 0 ? (
              <div className="py-20 text-center bg-white rounded-3xl border border-slate-200/80">
                <Utensils className="w-12 h-12 mx-auto text-slate-300 mb-3" />
                <h4 className="text-base font-bold text-slate-900">No dishes found</h4>
                <p className="text-xs text-slate-400 mt-1">Try searching for something else or pick a different category.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 pt-2">
                {filteredItems.map((item) => {
                  const inCartQty = cart
                    .filter((c) => c.menu_item.id === item.id)
                    .reduce((sum, c) => sum + c.quantity, 0);

                  return (
                    <div
                      key={item.id}
                      onClick={() => setInspectingItem(item)}
                      className="bg-white rounded-3xl border border-slate-200/90 overflow-hidden hover:shadow-xl hover:shadow-orange-500/5 transition-all duration-300 flex flex-col group cursor-pointer"
                    >
                      {/* Dish Photo */}
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

                        {/* Badges */}
                        <div className="absolute top-3 left-3 flex flex-col gap-1">
                          {item.is_popular && (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500 text-white shadow-md">
                              Popular
                            </span>
                          )}
                          {item.is_featured && (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-orange-600 text-white shadow-md">
                              Chef Pick
                            </span>
                          )}
                        </div>

                        {inCartQty > 0 && (
                          <span className="absolute top-3 right-3 px-2.5 py-1 rounded-xl text-xs font-black bg-orange-500 text-white shadow-md">
                            {inCartQty} in cart
                          </span>
                        )}
                      </div>

                      {/* Info & Add */}
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
                            {item.description || 'Prepared fresh with savory seasonings and ingredients.'}
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
                            <Plus className="w-3.5 h-3.5" /> Add to Cart
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </main>
      )}

      {/* Floating View Cart Pill (when cart has items and drawer is closed) */}
      {cartCount > 0 && !cartOpen && (
        <button
          onClick={() => setCartOpen(true)}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 text-white px-6 py-3.5 rounded-full shadow-2xl shadow-orange-500/20 flex items-center gap-4 hover:scale-105 transition-all border border-white/10 animate-slide-up"
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

      {/* Full-featured Cart & Checkout Drawer */}
      {cartOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={() => setCartOpen(false)} />
          <div className="relative w-full max-w-lg bg-white shadow-2xl flex flex-col h-full animate-slide-in-right z-10">
            {/* Drawer Header */}
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
                <div className="w-16 h-16 rounded-2xl bg-orange-50 text-orange-500 flex items-center justify-center mb-3">
                  <ShoppingBag className="w-8 h-8" />
                </div>
                <h4 className="text-base font-bold text-slate-900">Your cart is empty</h4>
                <p className="text-xs text-slate-400 mt-1 max-w-xs">
                  Browse our savory dishes and add items to begin your order.
                </p>
              </div>
            ) : (
              <>
                {/* Cart Items List */}
                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
                  {cart.map((c, idx) => (
                    <div
                      key={`${c.menu_item.id}-${idx}`}
                      className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3.5 flex items-center gap-3"
                    >
                      <div className="w-12 h-12 rounded-xl bg-slate-200 overflow-hidden shrink-0">
                        {c.menu_item.image_url ? (
                          <img src={c.menu_item.image_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-400">
                            <Utensils className="w-5 h-5" />
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-sm text-slate-900 truncate">{c.menu_item.name}</div>
                        {c.notes && (
                          <div className="text-[11px] text-amber-600 truncate mt-0.5">Note: {c.notes}</div>
                        )}
                        <div className="text-xs text-slate-400 mt-0.5">
                          ${Number(c.menu_item.price).toFixed(2)} each
                        </div>
                      </div>

                      {/* Quantity controls */}
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

                {/* Checkout Configuration & Form */}
                <div className="border-t border-slate-200 bg-white px-6 py-4 space-y-4 max-h-[55vh] overflow-y-auto">
                  {/* Order Type Tabs */}
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
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
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
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
                      />
                    </div>
                  </div>

                  {/* Delivery Address & GPS */}
                  {orderType === 'delivery' && (
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                        Delivery Address *
                      </label>
                      <input
                        type="text"
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        placeholder="Apartment, Street address, City"
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
                      />
                      <button
                        type="button"
                        onClick={requestLocation}
                        disabled={locationStatus === 'loading'}
                        className={`w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-bold border transition-colors ${
                          locationStatus === 'granted'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                            : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {locationStatus === 'loading' ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : locationStatus === 'granted' ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <Navigation className="w-3.5 h-3.5 text-orange-500" />
                        )}
                        {locationStatus === 'loading'
                          ? 'Acquiring GPS...'
                          : locationStatus === 'granted'
                          ? 'GPS Location Attached'
                          : 'Share GPS Location for Driver'}
                      </button>
                    </div>
                  )}

                  {/* Table number for Dine-In */}
                  {orderType === 'dine_in' && (
                    <div>
                      <label className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-1 block">
                        Table Number *
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="99"
                        value={tableNumber}
                        onChange={(e) => setTableNumber(e.target.value)}
                        placeholder="e.g. 5"
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
                      />
                    </div>
                  )}

                  {/* Payment Method Selector */}
                  <div>
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 block">
                      Payment Method
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => setPaymentMethod('cash')}
                        className={`py-2 px-2 rounded-xl text-xs font-bold border flex flex-col items-center gap-1 transition-all ${
                          paymentMethod === 'cash'
                            ? 'bg-orange-50 border-orange-500 text-orange-700'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <Banknote className="w-4 h-4" />
                        <span>Cash</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setPaymentMethod('khqr')}
                        className={`py-2 px-2 rounded-xl text-xs font-bold border flex flex-col items-center gap-1 transition-all ${
                          paymentMethod === 'khqr'
                            ? 'bg-orange-50 border-orange-500 text-orange-700'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <QrCode className="w-4 h-4" />
                        <span>Bakong / KHQR</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setPaymentMethod('card')}
                        className={`py-2 px-2 rounded-xl text-xs font-bold border flex flex-col items-center gap-1 transition-all ${
                          paymentMethod === 'card'
                            ? 'bg-orange-50 border-orange-500 text-orange-700'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <CreditCard className="w-4 h-4" />
                        <span>Credit Card</span>
                      </button>
                    </div>
                  </div>

                  {/* Coupon Code Section */}
                  <div>
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-1 block">
                      Promotion / Coupon Code
                    </label>
                    {appliedCoupon ? (
                      <div className="flex items-center justify-between p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs">
                        <div className="flex items-center gap-1.5 font-bold">
                          <Tag className="w-3.5 h-3.5" />
                          <span>Code: {appliedCoupon.code} (-${appliedCoupon.discount.toFixed(2)})</span>
                        </div>
                        <button
                          type="button"
                          onClick={removeCoupon}
                          className="text-rose-600 hover:underline font-bold text-[11px]"
                        >
                          Remove
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={couponCodeInput}
                          onChange={(e) => setCouponCodeInput(e.target.value.toUpperCase())}
                          placeholder="Try SAVORY10"
                          className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs uppercase focus:outline-none focus:border-orange-500"
                        />
                        <button
                          type="button"
                          onClick={handleApplyCoupon}
                          disabled={couponChecking || !couponCodeInput.trim()}
                          className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 disabled:opacity-50"
                        >
                          {couponChecking ? 'Checking...' : 'Apply'}
                        </button>
                      </div>
                    )}
                    {couponError && <p className="text-[11px] text-rose-500 mt-1">{couponError}</p>}
                  </div>

                  {/* Order Notes */}
                  <div>
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-1 block">
                      Kitchen / Order Notes
                    </label>
                    <input
                      type="text"
                      value={orderNotes}
                      onChange={(e) => setOrderNotes(e.target.value)}
                      placeholder="e.g. Ring the bell, cutlery required"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-orange-500"
                    />
                  </div>

                  {/* Pricing Breakdown */}
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
                        <span>Discount ({appliedCoupon?.code})</span>
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

                  {/* Submit Order Button */}
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

                  {!canCheckout && (
                    <p className="text-[11px] text-center text-slate-400">
                      Please enter your name, phone number, and {orderType === 'delivery' ? 'delivery address' : orderType === 'dine_in' ? 'table number' : 'contact info'} to checkout.
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
