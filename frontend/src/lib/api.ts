import {
  supabase,
  type Order,
  type OrderStatus,
  type PaymentStatus,
  type PaymentMethod,
  type RestaurantSettings,
  type Coupon,
  type Category,
  type MenuItem,
  type RestaurantTable,
} from './supabase';

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/$/, '');

export interface SubmitOrderPayload {
  customer_id?: string | null;
  customer_name: string;
  phone: string;
  address?: string | null;
  order_type: 'delivery' | 'pickup' | 'dine_in';
  table_number?: number | null;
  notes?: string | null;
  coupon_code?: string | null;
  payment_method: PaymentMethod;
  items: {
    menu_item_id: string;
    quantity: number;
    unit_price: number;
    notes?: string;
    name?: string;
  }[];
  customer_lat?: number | null;
  customer_lng?: number | null;
  telegram_user_id?: string | null;
  telegram_chat_id?: string | null;
}

export interface OrderResult {
  success: boolean;
  order_id: string;
  order_number: string;
  subtotal: number;
  delivery_fee: number;
  discount: number;
  total: number;
  status: OrderStatus;
  payment_status: PaymentStatus;
  payment_method: PaymentMethod;
  qr_string?: string | null;
  deeplink?: string | null;
  md5?: string | null;
  qr_data?: string | null;
  error?: string;
}

export const DEFAULT_SETTINGS: RestaurantSettings = {
  id: 'default',
  name: 'Savory',
  tagline: 'Fresh food, made to order',
  phone: '+1 (555) 234-5678',
  email: 'hello@savoryrestaurant.com',
  address: '123 Gourmet Blvd, Suite 100',
  opening_time: '08:00',
  closing_time: '22:00',
  delivery_fee: 2.50,
  min_delivery_order: 10.00,
  tax_rate: 0.00,
  currency: 'USD',
  currency_symbol: '$',
  default_prep_time: 20,
  is_order_acceptance_open: true,
  is_pickup_enabled: true,
  is_delivery_enabled: true,
  telegram_bot_token: '',
  telegram_chat_id: '',
  telegram_bot_username: '@savoryfood_bot',
  telegram_notifications_enabled: true,
  notify_on_new_order: true,
  notify_on_payment: true,
  notify_on_status_change: true,
  notify_on_low_stock: true,
  updated_at: new Date().toISOString(),
};

// ============================================================
// SETTINGS
// ============================================================

export async function fetchRestaurantSettings(): Promise<RestaurantSettings> {
  // Try FastAPI
  try {
    const res = await fetch(`${API_BASE}/api/settings`, { signal: AbortSignal.timeout(2000) });
    if (res.ok) {
      return await res.json();
    }
  } catch {
    // fallback
  }

  // Fallback to Supabase
  try {
    const { data, error } = await supabase
      .from('restaurant_settings')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (error || !data) return DEFAULT_SETTINGS;
    return data as RestaurantSettings;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function updateRestaurantSettings(payload: Partial<RestaurantSettings>): Promise<{ success: boolean; data?: RestaurantSettings; error?: string }> {
  // Try FastAPI
  try {
    const res = await fetch(`${API_BASE}/api/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const data = await res.json();
      return { success: true, data };
    }
  } catch {
    // fallback
  }

  // Fallback to Supabase
  try {
    const { data, error } = await supabase
      .from('restaurant_settings')
      .update(payload)
      .neq('id', '')
      .select()
      .maybeSingle();

    if (error) return { success: false, error: error.message };
    return { success: true, data: data as RestaurantSettings };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to update settings' };
  }
}

export async function testTelegramNotification(
  botToken?: string,
  chatId?: string
): Promise<{ success: boolean; message: string; bot_username?: string }> {
  try {
    const res = await fetch(`${API_BASE}/api/settings/test-telegram`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bot_token: botToken || undefined,
        chat_id: chatId || undefined,
      }),
    });
    if (res.ok) {
      return await res.json();
    }
    const err = await res.json().catch(() => ({}));
    return {
      success: false,
      message: err.detail || 'Failed to send test message to Telegram',
    };
  } catch (e) {
    return {
      success: false,
      message: e instanceof Error ? e.message : 'Network error connecting to FastAPI backend',
    };
  }
}

// ============================================================
// CATEGORIES
// ============================================================

export async function fetchCategories(): Promise<Category[]> {
  try {
    const res = await fetch(`${API_BASE}/api/menu/categories`, { signal: AbortSignal.timeout(2000) });
    if (res.ok) return await res.json();
  } catch {}

  const { data } = await supabase.from('categories').select('*').order('sort_order');
  return (data as Category[]) ?? [];
}

export async function createCategory(cat: { name: string; description?: string; sort_order?: number }): Promise<{ success: boolean; data?: Category; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/api/menu/categories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cat),
    });
    if (res.ok) {
      const data = await res.json();
      return { success: true, data };
    }
  } catch {}

  const { data, error } = await supabase.from('categories').insert(cat).select().single();
  if (error) return { success: false, error: error.message };
  return { success: true, data: data as Category };
}

export async function updateCategory(id: string, cat: { name?: string; description?: string; sort_order?: number }): Promise<{ success: boolean; data?: Category; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/api/menu/categories/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cat),
    });
    if (res.ok) {
      const data = await res.json();
      return { success: true, data };
    }
  } catch {}

  const { data, error } = await supabase.from('categories').update(cat).eq('id', id).select().single();
  if (error) return { success: false, error: error.message };
  return { success: true, data: data as Category };
}

export async function deleteCategory(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/api/menu/categories/${id}`, { method: 'DELETE' });
    if (res.ok) return { success: true };
  } catch {}

  const { error } = await supabase.from('categories').delete().eq('id', id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ============================================================
// MENU ITEMS
// ============================================================

export async function fetchMenuItems(categoryId?: string): Promise<MenuItem[]> {
  try {
    const url = categoryId
      ? `${API_BASE}/api/menu/items?category_id=${encodeURIComponent(categoryId)}`
      : `${API_BASE}/api/menu/items`;
    const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
    if (res.ok) return await res.json();
  } catch {}

  let q = supabase.from('menu_items').select('*').order('sort_order');
  if (categoryId) q = q.eq('category_id', categoryId);
  const { data } = await q;
  return (data as MenuItem[]) ?? [];
}

export async function createMenuItem(item: Partial<MenuItem>): Promise<{ success: boolean; data?: MenuItem; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/api/menu/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item),
    });
    if (res.ok) {
      const data = await res.json();
      return { success: true, data };
    }
  } catch {}

  let { data, error } = await supabase.from('menu_items').insert(item).select().single();
  if (error && (error.message.includes('is_featured') || error.message.includes('schema cache') || error.message.includes('PGRST204') || error.message.includes('preparation_time'))) {
    const { is_featured, is_popular, preparation_time, ...baseItem }: any = item;
    ({ data, error } = await supabase.from('menu_items').insert(baseItem).select().single());
  }
  if (error) return { success: false, error: error.message };
  return { success: true, data: data as MenuItem };
}

export async function updateMenuItem(id: string, item: Partial<MenuItem>): Promise<{ success: boolean; data?: MenuItem; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/api/menu/items/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item),
    });
    if (res.ok) {
      const data = await res.json();
      return { success: true, data };
    }
  } catch {}

  let { data, error } = await supabase.from('menu_items').update(item).eq('id', id).select().single();
  if (error && (error.message.includes('is_featured') || error.message.includes('schema cache') || error.message.includes('PGRST204') || error.message.includes('preparation_time'))) {
    const { is_featured, is_popular, preparation_time, ...baseItem }: any = item;
    ({ data, error } = await supabase.from('menu_items').update(baseItem).eq('id', id).select().single());
  }
  if (error) return { success: false, error: error.message };
  return { success: true, data: data as MenuItem };
}

export async function deleteMenuItem(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/api/menu/items/${id}`, { method: 'DELETE' });
    if (res.ok) return { success: true };
  } catch {}

  const { error } = await supabase.from('menu_items').delete().eq('id', id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function toggleMenuItemAvailability(id: string, isAvailable: boolean): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/api/menu/items/${id}/availability?is_available=${isAvailable}`, { method: 'PATCH' });
    if (res.ok) return { success: true };
  } catch {}

  const { error } = await supabase.from('menu_items').update({ is_available: isAvailable }).eq('id', id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ============================================================
// TABLES
// ============================================================

export async function fetchTables(): Promise<RestaurantTable[]> {
  try {
    const res = await fetch(`${API_BASE}/api/tables`, { signal: AbortSignal.timeout(2000) });
    if (res.ok) return await res.json();
  } catch {}

  const { data } = await supabase.from('restaurant_tables').select('*').order('table_number');
  return (data as RestaurantTable[]) ?? [];
}

export async function createTable(t: { table_number: number; name?: string; capacity?: number; is_active?: boolean }): Promise<{ success: boolean; data?: RestaurantTable; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/api/tables`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(t),
    });
    if (res.ok) {
      const data = await res.json();
      return { success: true, data };
    } else {
      const err = await res.json();
      return { success: false, error: err.detail || 'Failed to create table' };
    }
  } catch {}

  const { data, error } = await supabase.from('restaurant_tables').insert(t).select().single();
  if (error) return { success: false, error: error.message };
  return { success: true, data: data as RestaurantTable };
}

export async function updateTable(id: string, t: Partial<RestaurantTable>): Promise<{ success: boolean; data?: RestaurantTable; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/api/tables/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(t),
    });
    if (res.ok) {
      const data = await res.json();
      return { success: true, data };
    }
  } catch {}

  const { data, error } = await supabase.from('restaurant_tables').update(t).eq('id', id).select().single();
  if (error) return { success: false, error: error.message };
  return { success: true, data: data as RestaurantTable };
}

export async function deleteTable(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/api/tables/${id}`, { method: 'DELETE' });
    if (res.ok) return { success: true };
  } catch {}

  const { error } = await supabase.from('restaurant_tables').delete().eq('id', id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ============================================================
// COUPONS
// ============================================================

export async function fetchCoupons(): Promise<Coupon[]> {
  try {
    const res = await fetch(`${API_BASE}/api/coupons`, { signal: AbortSignal.timeout(2000) });
    if (res.ok) return await res.json();
  } catch {}

  const { data } = await supabase.from('coupons').select('*').order('created_at', { ascending: false });
  return (data as Coupon[]) ?? [];
}

export async function createCoupon(c: Partial<Coupon>): Promise<{ success: boolean; data?: Coupon; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/api/coupons`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(c),
    });
    if (res.ok) {
      const data = await res.json();
      return { success: true, data };
    } else {
      const err = await res.json();
      return { success: false, error: err.detail || 'Failed to create coupon' };
    }
  } catch {}

  const { data, error } = await supabase.from('coupons').insert(c).select().single();
  if (error) return { success: false, error: error.message };
  return { success: true, data: data as Coupon };
}

export async function updateCoupon(id: string, c: Partial<Coupon>): Promise<{ success: boolean; data?: Coupon; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/api/coupons/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(c),
    });
    if (res.ok) {
      const data = await res.json();
      return { success: true, data };
    }
  } catch {}

  const { data, error } = await supabase.from('coupons').update(c).eq('id', id).select().single();
  if (error) return { success: false, error: error.message };
  return { success: true, data: data as Coupon };
}

export async function deleteCoupon(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/api/coupons/${id}`, { method: 'DELETE' });
    if (res.ok) return { success: true };
  } catch {}

  const { error } = await supabase.from('coupons').delete().eq('id', id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function validateCoupon(
  code: string,
  subtotal: number
): Promise<{ coupon: Coupon | null; discount: number; error: string | null }> {
  // Try FastAPI
  try {
    const res = await fetch(`${API_BASE}/api/coupons/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: code.trim(), subtotal }),
    });
    if (res.ok) {
      const data = await res.json();
      if (!data.valid) {
        return { coupon: null, discount: 0, error: data.error || 'Invalid coupon' };
      }
      return { coupon: data.coupon, discount: data.discount, error: null };
    }
  } catch {}

  // Fallback to Supabase
  try {
    const { data, error } = await supabase
      .from('coupons')
      .select('*')
      .ilike('code', code.trim())
      .eq('is_active', true)
      .maybeSingle();

    if (error || !data) {
      return { coupon: null, discount: 0, error: 'Invalid or expired coupon code.' };
    }

    const coupon = data as Coupon;
    const now = new Date();
    if (coupon.start_date && now < new Date(coupon.start_date)) {
      return { coupon: null, discount: 0, error: 'Coupon is not yet active.' };
    }
    if (coupon.end_date && now > new Date(coupon.end_date)) {
      return { coupon: null, discount: 0, error: 'Coupon has expired.' };
    }
    if (subtotal < Number(coupon.min_order_amount || 0)) {
      return {
        coupon: null,
        discount: 0,
        error: `Minimum order amount of $${Number(coupon.min_order_amount).toFixed(2)} required.`,
      };
    }
    if (coupon.max_usage && coupon.current_usage >= coupon.max_usage) {
      return { coupon: null, discount: 0, error: 'Coupon usage limit has been reached.' };
    }

    let discount = 0;
    if (coupon.discount_type === 'percentage') {
      discount = (subtotal * Number(coupon.discount_value)) / 100;
    } else {
      discount = Number(coupon.discount_value);
    }
    discount = Math.min(discount, subtotal);
    discount = Math.round(discount * 100) / 100;

    return { coupon, discount, error: null };
  } catch {
    return { coupon: null, discount: 0, error: 'Failed to validate coupon.' };
  }
}

// ============================================================
// ORDERS
// ============================================================

export async function fetchOrders(status?: string, customerId?: string): Promise<any[]> {
  try {
    let url = `${API_BASE}/api/orders`;
    const params = new URLSearchParams();
    if (status && status !== 'all') params.append('status', status);
    if (customerId) params.append('customer_id', customerId);
    if (params.toString()) url += `?${params.toString()}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(2500) });
    if (res.ok) return await res.json();
  } catch {}

  const [{ data: rawOrders }, { data: items }, { data: menuItems }] = await Promise.all([
    supabase.from('orders').select('*').order('created_at', { ascending: false }),
    supabase.from('order_items').select('*'),
    supabase.from('menu_items').select('id, name'),
  ]);
  const menuMap = new Map((menuItems ?? []).map((m: any) => [m.id, m.name]));
  return (rawOrders ?? []).map((order: any) => ({
    ...order,
    items: (items ?? [])
      .filter((oi: any) => oi.order_id === order.id)
      .map((oi: any) => ({
        ...oi,
        menu_item_name: menuMap.get(oi.menu_item_id) ?? 'Item',
      })),
  }));
}

export async function fetchOrderById(orderId: string): Promise<any | null> {
  // Try FastAPI
  try {
    const res = await fetch(`${API_BASE}/api/orders/${orderId}`, { signal: AbortSignal.timeout(2500) });
    if (res.ok) {
      return await res.json();
    }
  } catch {}

  // Fallback to Supabase
  try {
    const { data: orderData } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .maybeSingle();

    if (!orderData) return null;

    const [{ data: orderItems }, { data: menuItems }] = await Promise.all([
      supabase.from('order_items').select('*').eq('order_id', orderId),
      supabase.from('menu_items').select('id, name'),
    ]);

    const nameMap = new Map((menuItems ?? []).map((m: any) => [m.id, m.name]));
    const items = (orderItems ?? []).map((oi: any) => ({
      ...oi,
      menu_item_name: nameMap.get(oi.menu_item_id) || 'Item',
    }));

    return { ...orderData, items };
  } catch {
    return null;
  }
}

export async function submitOrder(payload: SubmitOrderPayload): Promise<OrderResult> {
  // First try FastAPI
  try {
    const res = await fetch(`${API_BASE}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const data = await res.json();
      return {
        success: true,
        order_id: data.id,
        order_number: data.order_number,
        subtotal: data.subtotal,
        delivery_fee: data.delivery_fee,
        discount: data.discount,
        total: data.total,
        status: data.status,
        payment_status: data.payment_status,
        payment_method: data.payment_method,
        qr_string: data.qr_string,
        deeplink: data.deeplink,
        md5: data.md5,
        qr_data: data.qr_string,
      };
    }
  } catch (err) {
    console.warn('FastAPI order endpoint unreachable, trying Supabase Edge Function / DB:', err);
  }

  // Edge Function / Direct Supabase fallback
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const edgeFunctionUrl = `${supabaseUrl}/functions/v1/create-order`;

  try {
    const response = await fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${anonKey}`,
        apikey: anonKey,
      },
      body: JSON.stringify({
        customer_id: payload.customer_id,
        customer_name: payload.customer_name,
        phone: payload.phone,
        address: payload.order_type === 'delivery' ? payload.address : null,
        order_type: payload.order_type,
        table_number: payload.table_number,
        notes: payload.notes,
        coupon_code: payload.coupon_code,
        payment_method: payload.payment_method,
        items: payload.items.map((i) => ({
          menu_item_id: i.menu_item_id,
          quantity: i.quantity,
          notes: i.notes,
        })),
        customer_lat: payload.customer_lat,
        customer_lng: payload.customer_lng,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      return {
        success: true,
        order_id: data.order_id,
        order_number: data.order_number || `SV-${Date.now().toString().slice(-6)}`,
        subtotal: data.subtotal,
        delivery_fee: data.delivery_fee,
        discount: data.discount,
        total: data.total,
        status: data.status || 'pending',
        payment_status: data.payment_status || 'unpaid',
        payment_method: data.payment_method || payload.payment_method,
        qr_string: data.qr_string ?? null,
        deeplink:  data.deeplink  ?? null,
        md5:       data.md5       ?? null,
        qr_data:   data.qr_string ?? data.qr_data ?? null,
      };
    }
  } catch (err) {
    console.warn('Edge Function fallback skipped:', err);
  }

  // Direct Supabase fallback
  try {
    const subtotal = payload.items.reduce((sum, i) => sum + i.unit_price * i.quantity, 0);
    const deliveryFee = payload.order_type === 'delivery' ? 2.50 : 0;

    let discount = 0;
    if (payload.coupon_code) {
      const res = await validateCoupon(payload.coupon_code, subtotal);
      if (!res.error) discount = res.discount;
    }

    const total = Math.max(0, Math.round((subtotal + deliveryFee - discount) * 100) / 100);
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const orderNumber = `SV-${dateStr}-${randomSuffix}`;
    const paymentStatus: PaymentStatus = payload.payment_method === 'cash' ? 'unpaid' : 'pending';

    const insertData: Record<string, any> = {
      customer_id: payload.customer_id || null,
      customer_name: payload.customer_name.trim(),
      phone: payload.phone.trim(),
      address: payload.order_type === 'delivery' ? payload.address?.trim() : null,
      order_type: payload.order_type,
      table_number: payload.table_number || null,
      notes: payload.notes?.trim() || null,
      total,
      status: 'pending',
      customer_lat: payload.customer_lat ?? null,
      customer_lng: payload.customer_lng ?? null,
    };

    let { data: order, error: orderError } = await supabase
      .from('orders')
      .insert(insertData)
      .select()
      .single();

    // Auto-fallback: if Supabase DB has an outdated constraint on order_type (e.g. only 'delivery','pickup')
    if (orderError && (orderError.message.includes('orders_order_type_check') || orderError.message.includes('order_type'))) {
      console.warn('Supabase orders_order_type_check constraint hit, retrying insert with order_type omitted...');
      const { order_type, ...fallbackData } = insertData;
      const retryResult = await supabase
        .from('orders')
        .insert(fallbackData)
        .select()
        .single();
      order = retryResult.data;
      orderError = retryResult.error;
    }

    if (orderError || !order) {
      throw new Error(orderError?.message || 'Could not insert order');
    }

    const orderItems = payload.items.map((i) => ({
      order_id: order.id,
      menu_item_id: i.menu_item_id,
      quantity: i.quantity,
      unit_price: i.unit_price,
      notes: i.notes || null,
    }));

    await supabase.from('order_items').insert(orderItems);

    function tlvKhqr(tag: string, value: string): string {
      const len = String(value.length).padStart(2, '0');
      return `${tag}${len}${value}`;
    }

    function crc16Khqr(data: string): string {
      let crc = 0xffff;
      for (let i = 0; i < data.length; i++) {
        crc ^= data.charCodeAt(i) << 8;
        for (let j = 0; j < 8; j++) {
          crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
        }
      }
      return crc.toString(16).toUpperCase().padStart(4, '0');
    }

    let qrData: string | null = null;
    if (payload.payment_method === 'khqr') {
      const ordRef = (order.order_number || orderNumber).slice(0, 25);
      const nowMs = Date.now();
      const expMs = nowMs + 30 * 60 * 1000;
      const parts = [
        tlvKhqr('00', '01'),
        tlvKhqr('01', '12'),
        tlvKhqr('29', tlvKhqr('00', 'sorn_sophiram@bkrt')),
        tlvKhqr('52', '5999'),
        tlvKhqr('53', '840'),
        tlvKhqr('54', total.toFixed(2)),
        tlvKhqr('58', 'KH'),
        tlvKhqr('59', 'SOPHIRAM SORN'),
        tlvKhqr('60', 'Phnom Penh'),
        tlvKhqr('62', tlvKhqr('01', ordRef) + tlvKhqr('03', 'Savory') + tlvKhqr('07', 'POS001')),
        tlvKhqr('99', tlvKhqr('00', String(nowMs)) + tlvKhqr('01', String(expMs))),
        '6304'
      ].join('');
      qrData = parts + crc16Khqr(parts);
    }

    return {
      success: true,
      order_id: order.id,
      order_number: order.order_number || orderNumber,
      subtotal,
      delivery_fee: deliveryFee,
      discount,
      total,
      status: 'pending',
      payment_status: paymentStatus,
      payment_method: payload.payment_method,
      qr_data: qrData,
    };
  } catch (fallbackErr) {
    return {
      success: false,
      order_id: '',
      order_number: '',
      subtotal: 0,
      delivery_fee: 0,
      discount: 0,
      total: 0,
      status: 'pending',
      payment_status: 'unpaid',
      payment_method: payload.payment_method,
      error: fallbackErr instanceof Error ? fallbackErr.message : 'Failed to place order',
    };
  }
}

export async function checkKHQRPayment(
  orderId: string,
  md5: string | null | undefined,
): Promise<{ paid: boolean; order_status: string; payment_status: string }> {
  // Try FastAPI
  try {
    const res = await fetch(`${API_BASE}/api/payments/check-khqr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_id: orderId, md5: md5 ?? null }),
    });
    if (res.ok) return await res.json();
  } catch {}

  // Fallback to Edge function
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey    = import.meta.env.VITE_SUPABASE_ANON_KEY;

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/check-payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${anonKey}`,
        apikey: anonKey,
      },
      body: JSON.stringify({ order_id: orderId, md5: md5 ?? null }),
    });

    if (!res.ok) return { paid: false, order_status: 'pending', payment_status: 'pending' };
    return await res.json();
  } catch {
    return { paid: false, order_status: 'pending', payment_status: 'pending' };
  }
}

export async function createKHQRPayment(
  orderId: string,
  amount: number,
  currency: 'USD' | 'KHR' = 'USD'
): Promise<{
  qr_string: string;
  md5: string;
  deeplink?: string | null;
  amount: number;
  currency: string;
} | null> {
  try {
    const res = await fetch(`${API_BASE}/api/payments/create-khqr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_id: orderId, amount, currency }),
    });
    if (res.ok) return await res.json();
  } catch (e) {
    console.error('Failed to create KHQR payment:', e);
  }
  return null;
}

export async function sendTelegramReceipt(
  orderId: string,
  chatId?: string
): Promise<{ success: boolean; message: string }> {
  try {
    const params = new URLSearchParams();
    if (chatId) params.append('chat_id', chatId);
    const url = `${API_BASE}/api/orders/${orderId}/send-receipt-telegram${params.toString() ? '?' + params.toString() : ''}`;
    const res = await fetch(url, { method: 'POST' });
    if (res.ok) {
      return await res.json();
    }
    const err = await res.json().catch(() => ({}));
    return { success: false, message: err.detail || 'Could not send receipt to Telegram.' };
  } catch (e: any) {
    return { success: false, message: e.message || 'Network error sending receipt.' };
  }
}

export async function updateOrderStatus(
  orderId: string,
  newStatus: OrderStatus,
  notes?: string
): Promise<{ success: boolean; error: string | null }> {
  // Try FastAPI
  try {
    const res = await fetch(`${API_BASE}/api/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus, notes }),
    });
    if (res.ok) return { success: true, error: null };
  } catch {}

  // Supabase fallback
  try {
    const { error } = await supabase
      .from('orders')
      .update({
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId);

    if (error) return { success: false, error: error.message };
    return { success: true, error: null };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Status update failed' };
  }
}

export async function updatePaymentStatus(
  orderId: string,
  newPaymentStatus: PaymentStatus
): Promise<{ success: boolean; error: string | null }> {
  // Try FastAPI
  try {
    const res = await fetch(`${API_BASE}/api/orders/${orderId}/payment-status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payment_status: newPaymentStatus }),
    });
    if (res.ok) return { success: true, error: null };
  } catch {}

  // Supabase fallback
  try {
    const orderUpdates: Partial<Order> = {
      payment_status: newPaymentStatus,
      updated_at: new Date().toISOString(),
    };
    if (newPaymentStatus === 'paid') {
      orderUpdates.status = 'confirmed';
    }

    const { error } = await supabase.from('orders').update(orderUpdates).eq('id', orderId);
    if (error) return { success: false, error: error.message };
    return { success: true, error: null };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Payment update failed' };
  }
}

// ============================================================
// INVENTORY
// ============================================================

export interface InventoryItem {
  id: string;
  name: string;
  description?: string;
  price: number;
  image_url?: string;
  category_name?: string;
  is_available: boolean;
  track_stock: boolean;
  stock_quantity: number;
  low_stock_threshold: number;
  stock_status: 'in_stock' | 'low_stock' | 'out_of_stock' | 'untracked';
}

export interface InventorySummary {
  total_items: number;
  tracked_items: number;
  out_of_stock: number;
  low_stock: number;
  in_stock: number;
}

export interface InventoryLog {
  id: string;
  change_type: string;
  quantity_changed: number;
  quantity_after: number;
  notes?: string;
  created_at: string;
  menu_item_name: string;
  image_url?: string;
}

export async function fetchInventorySummary(): Promise<InventorySummary> {
  try {
    const res = await fetch(`${API_BASE}/api/inventory/summary`, { signal: AbortSignal.timeout(3000) });
    if (res.ok) return await res.json();
  } catch {}
  return { total_items: 0, tracked_items: 0, out_of_stock: 0, low_stock: 0, in_stock: 0 };
}

export async function fetchInventoryItems(status?: string, search?: string): Promise<InventoryItem[]> {
  try {
    const params = new URLSearchParams();
    if (status && status !== 'all') params.append('status', status);
    if (search) params.append('search', search);
    const url = `${API_BASE}/api/inventory${params.toString() ? '?' + params.toString() : ''}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (res.ok) return await res.json();
  } catch {}
  return [];
}

export async function restockInventoryItem(
  menuItemId: string,
  quantity: number,
  notes?: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/api/inventory/restock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ menu_item_id: menuItemId, quantity, notes: notes || 'Restock' }),
    });
    if (res.ok) return await res.json();
    const err = await res.json();
    return { success: false, error: err.detail || 'Restock failed' };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Network error' };
  }
}

export async function updateInventoryItem(
  itemId: string,
  data: { track_stock?: boolean; stock_quantity?: number; low_stock_threshold?: number; is_available?: boolean }
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/api/inventory/update/${itemId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (res.ok) return await res.json();
    const err = await res.json();
    return { success: false, error: err.detail || 'Update failed' };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Network error' };
  }
}

export async function fetchInventoryLogs(limit = 50): Promise<InventoryLog[]> {
  try {
    const res = await fetch(`${API_BASE}/api/inventory/logs?limit=${limit}`, { signal: AbortSignal.timeout(3000) });
    if (res.ok) return await res.json();
  } catch {}
  return [];
}

// ============================================================
// REPORTS & ANALYTICS
// ============================================================

export interface ReportsSummary {
  range_type: string;
  start_date: string;
  end_date: string;
  kpis: {
    gross_revenue: number;
    net_revenue: number;
    total_orders: number;
    completed_orders: number;
    cancelled_orders: number;
    paid_orders: number;
    average_order_value: number;
    total_discount: number;
    total_delivery_fee: number;
  };
  payment_methods: {
    method: string;
    count: number;
    revenue: number;
    percentage: number;
  }[];
  order_types: {
    type: string;
    count: number;
    revenue: number;
    percentage: number;
  }[];
  daily_trends: {
    date: string;
    orders: number;
    revenue: number;
  }[];
  top_items: {
    menu_item_id: string;
    name: string;
    quantity_sold: number;
    revenue: number;
  }[];
}

export async function fetchReportsSummary(
  rangeType = '7days',
  startDate?: string,
  endDate?: string
): Promise<ReportsSummary | null> {
  try {
    const params = new URLSearchParams();
    params.append('range_type', rangeType);
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);
    const res = await fetch(`${API_BASE}/api/reports/summary?${params.toString()}`, { signal: AbortSignal.timeout(4000) });
    if (res.ok) return await res.json();
  } catch (e) {
    console.error('fetchReportsSummary error:', e);
  }
  return null;
}

export function getReportsExportCsvUrl(startDate?: string, endDate?: string): string {
  const params = new URLSearchParams();
  if (startDate) params.append('start_date', startDate);
  if (endDate) params.append('end_date', endDate);
  return `${API_BASE}/api/reports/export-csv${params.toString() ? '?' + params.toString() : ''}`;
}

