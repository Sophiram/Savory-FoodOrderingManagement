import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'implicit',
  },
});

export type UserRole = 'admin' | 'manager' | 'staff' | 'customer';

export type Profile = {
  id: string;
  full_name: string;
  role: UserRole;
  avatar_url: string | null;
  phone?: string | null;
  address?: string | null;
  created_at: string;
  updated_at?: string;
};

export type Category = {
  id: string;
  name: string;
  description: string;
  sort_order: number;
  created_at: string;
};

export type MenuItem = {
  id: string;
  category_id: string;
  name: string;
  description: string;
  price: number;
  image_url: string | null;
  is_available: boolean;
  sort_order: number;
  preparation_time?: number;
  is_featured?: boolean;
  is_popular?: boolean;
  created_at: string;
};

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'preparing'
  | 'ready'
  | 'out_for_delivery'
  | 'delivered'
  | 'completed'
  | 'cancelled';

export type PaymentStatus =
  | 'unpaid'
  | 'pending'
  | 'paid'
  | 'failed'
  | 'refunded'
  | 'cancelled';

export type PaymentMethod = 'cash' | 'khqr' | 'card' | 'online';

export type OrderType = 'delivery' | 'pickup' | 'dine_in';

export type Order = {
  id: string;
  order_number?: string;
  customer_id: string | null;
  customer_name: string;
  status: OrderStatus;
  subtotal?: number;
  delivery_fee?: number;
  tax?: number;
  discount?: number;
  total: number;
  notes: string | null;
  table_number: number | null;
  phone: string | null;
  address: string | null;
  order_type: OrderType | null;
  customer_lat: number | null;
  customer_lng: number | null;
  coupon_id?: string | null;
  coupon_code?: string | null;
  payment_status?: PaymentStatus;
  payment_method?: PaymentMethod;
  estimated_prep_time?: number;
  estimated_delivery_time?: number;
  created_at: string;
  updated_at: string;
};

export type OrderItem = {
  id: string;
  order_id: string;
  menu_item_id: string;
  quantity: number;
  unit_price: number;
  notes: string | null;
};

export type CartItem = {
  menu_item: MenuItem;
  quantity: number;
  notes?: string;
};

export type Payment = {
  id: string;
  order_id: string;
  user_id: string | null;
  payment_method: PaymentMethod;
  amount: number;
  currency: string;
  status: PaymentStatus;
  transaction_reference?: string | null;
  provider: string;
  provider_transaction_id?: string | null;
  qr_data?: string | null;
  paid_at?: string | null;
  failed_at?: string | null;
  refunded_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type OrderStatusHistory = {
  id: string;
  order_id: string;
  status: OrderStatus;
  notes?: string | null;
  created_by?: string | null;
  created_at: string;
};

export type Coupon = {
  id: string;
  code: string;
  description: string;
  discount_type: 'percentage' | 'fixed';
  discount_value: number;
  min_order_amount: number;
  max_usage?: number | null;
  current_usage: number;
  start_date?: string | null;
  end_date?: string | null;
  is_active: boolean;
  created_at: string;
};

export type RestaurantTable = {
  id: string;
  table_number: number;
  name: string;
  capacity: number;
  is_active: boolean;
  created_at: string;
};

export type RestaurantSettings = {
  id: string;
  name: string;
  tagline: string;
  phone: string;
  email: string;
  address: string;
  opening_time: string;
  closing_time: string;
  delivery_fee: number;
  min_delivery_order: number;
  tax_rate: number;
  currency: string;
  currency_symbol: string;
  default_prep_time: number;
  is_order_acceptance_open: boolean;
  is_pickup_enabled: boolean;
  is_delivery_enabled: boolean;
  telegram_bot_token?: string;
  telegram_chat_id?: string;
  telegram_bot_username?: string;
  telegram_notifications_enabled?: boolean;
  notify_on_new_order?: boolean;
  notify_on_payment?: boolean;
  notify_on_status_change?: boolean;
  notify_on_low_stock?: boolean;
  updated_at: string;
};
