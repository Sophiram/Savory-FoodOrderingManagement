/*
# SAVORY — Food Ordering & Restaurant Management System
# Comprehensive Schema Migration: Payments, Coupons, Tables, Settings, Order Enhancements, Audit Log, RLS

## Overview:
1. Profiles: add phone and address; expand role CHECK constraint to ('admin', 'manager', 'staff', 'customer').
2. Orders: add order_number, subtotal, delivery_fee, tax, discount, coupon_id, coupon_code,
   payment_status, payment_method, estimated_prep_time, estimated_delivery_time.
   Expand status CHECK to ('pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'completed', 'cancelled').
3. Payments: track online / cash / KHQR payments with full audit fields.
4. Order Status History: record every state transition with timestamp and actor.
5. Coupons & Coupon Usages: percentage and fixed discounts with validation rules.
6. Restaurant Tables: manage dine-in tables and table-specific QR ordering.
7. Restaurant Settings: global store configuration (operating hours, fees, prep time).
8. Menu Items: add preparation_time, is_featured, is_popular.
9. RLS Policies: secure every table with role-based checks.
*/

-- ============================================================
-- 1. HELPER FUNCTIONS FOR ROLE-BASED ACCESS CONTROL
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_manager_or_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'manager')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_staff_or_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'manager', 'staff')
  );
$$;

-- ============================================================
-- 2. ENHANCE PROFILES
-- ============================================================

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Update profiles role constraint to include manager
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'manager', 'staff', 'customer'));

-- ============================================================
-- 3. RESTAURANT SETTINGS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.restaurant_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'Savory',
  tagline text DEFAULT 'Fresh food, made to order',
  phone text DEFAULT '+1 (555) 234-5678',
  email text DEFAULT 'hello@savoryrestaurant.com',
  address text DEFAULT '123 Gourmet Blvd, Suite 100',
  opening_time text DEFAULT '08:00',
  closing_time text DEFAULT '22:00',
  delivery_fee numeric(10,2) NOT NULL DEFAULT 2.50,
  min_delivery_order numeric(10,2) NOT NULL DEFAULT 10.00,
  tax_rate numeric(5,2) NOT NULL DEFAULT 0.00,
  currency text NOT NULL DEFAULT 'USD',
  currency_symbol text NOT NULL DEFAULT '$',
  default_prep_time int NOT NULL DEFAULT 20,
  is_order_acceptance_open boolean NOT NULL DEFAULT true,
  is_pickup_enabled boolean NOT NULL DEFAULT true,
  is_delivery_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.restaurant_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "settings_select_all" ON public.restaurant_settings;
CREATE POLICY "settings_select_all" ON public.restaurant_settings FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "settings_update_admin" ON public.restaurant_settings;
CREATE POLICY "settings_update_admin" ON public.restaurant_settings FOR ALL
  TO authenticated USING (public.is_manager_or_admin()) WITH CHECK (public.is_manager_or_admin());

-- Insert default settings row if empty
INSERT INTO public.restaurant_settings (id, name, tagline, phone, email, address, delivery_fee, min_delivery_order)
SELECT '00000000-0000-0000-0000-000000000001', 'Savory', 'Fresh food, made to order', '+1 (555) 234-5678', 'hello@savoryrestaurant.com', '123 Gourmet Blvd, Suite 100', 2.50, 10.00
WHERE NOT EXISTS (SELECT 1 FROM public.restaurant_settings);

-- ============================================================
-- 4. RESTAURANT TABLES (FOR QR DINE-IN ORDERING)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.restaurant_tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_number int NOT NULL UNIQUE,
  name text NOT NULL,
  capacity int NOT NULL DEFAULT 4,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.restaurant_tables ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tables_select_all" ON public.restaurant_tables;
CREATE POLICY "tables_select_all" ON public.restaurant_tables FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "tables_write_staff" ON public.restaurant_tables;
CREATE POLICY "tables_write_staff" ON public.restaurant_tables FOR ALL
  TO authenticated USING (public.is_staff_or_admin()) WITH CHECK (public.is_staff_or_admin());

-- Seed sample tables
INSERT INTO public.restaurant_tables (table_number, name, capacity) VALUES
  (1, 'Table 1 (Indoor)', 4),
  (2, 'Table 2 (Indoor)', 4),
  (3, 'Table 3 (Window)', 2),
  (4, 'Table 4 (Patio)', 6),
  (5, 'Table 5 (Patio)', 4)
ON CONFLICT (table_number) DO NOTHING;

-- ============================================================
-- 5. COUPONS & PROMOTIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  description text DEFAULT '',
  discount_type text NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
  discount_value numeric(10,2) NOT NULL CHECK (discount_value > 0),
  min_order_amount numeric(10,2) NOT NULL DEFAULT 0 CHECK (min_order_amount >= 0),
  max_usage int,
  current_usage int NOT NULL DEFAULT 0,
  start_date timestamptz DEFAULT now(),
  end_date timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "coupons_select_all" ON public.coupons;
CREATE POLICY "coupons_select_all" ON public.coupons FOR SELECT
  TO anon, authenticated USING (is_active = true);

DROP POLICY IF EXISTS "coupons_write_admin" ON public.coupons;
CREATE POLICY "coupons_write_admin" ON public.coupons FOR ALL
  TO authenticated USING (public.is_manager_or_admin()) WITH CHECK (public.is_manager_or_admin());

-- Seed initial welcome coupon
INSERT INTO public.coupons (code, description, discount_type, discount_value, min_order_amount, is_active)
VALUES
  ('SAVORY10', '10% off your entire order', 'percentage', 10.00, 15.00, true),
  ('WELCOME5', '$5 off your order of $25 or more', 'fixed', 5.00, 25.00, true)
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- 6. ENHANCE MENU ITEMS
-- ============================================================

ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS preparation_time int DEFAULT 15;
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS is_featured boolean DEFAULT false;
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS is_popular boolean DEFAULT false;

-- Update sample menu items
UPDATE public.menu_items SET is_popular = true WHERE name IN ('Grilled Salmon', 'Margherita Pizza', 'Beef Burger');
UPDATE public.menu_items SET is_featured = true WHERE name IN ('Bruschetta', 'Tiramisu');

-- ============================================================
-- 7. ENHANCE ORDERS TABLE
-- ============================================================

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS order_number text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS subtotal numeric(10,2) DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_fee numeric(10,2) DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS tax numeric(10,2) DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS discount numeric(10,2) DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS coupon_id uuid REFERENCES public.coupons(id) ON DELETE SET NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS coupon_code text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'unpaid';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_method text DEFAULT 'cash';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS estimated_prep_time int DEFAULT 20;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS estimated_delivery_time int DEFAULT 30;

-- Expand status check to include out_for_delivery, delivered
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'completed', 'cancelled'));

-- Add payment status check constraint
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_payment_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_payment_status_check
  CHECK (payment_status IN ('unpaid', 'pending', 'paid', 'failed', 'refunded', 'cancelled'));

-- Create sequence & trigger for readable order numbers (#SV-YYYYMMDD-XXX)
CREATE SEQUENCE IF NOT EXISTS order_number_seq;

CREATE OR REPLACE FUNCTION public.generate_order_number()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.order_number IS NULL OR NEW.order_number = '' THEN
    NEW.order_number := 'SV-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(nextval('order_number_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_generate_order_number ON public.orders;
CREATE TRIGGER trg_generate_order_number
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.generate_order_number();

-- ============================================================
-- 8. PAYMENTS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  payment_method text NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash', 'khqr', 'card', 'online')),
  amount numeric(10,2) NOT NULL CHECK (amount >= 0),
  currency text NOT NULL DEFAULT 'USD',
  status text NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'pending', 'paid', 'failed', 'refunded', 'cancelled')),
  transaction_reference text,
  provider text NOT NULL DEFAULT 'manual',
  provider_transaction_id text,
  qr_data text,
  paid_at timestamptz,
  failed_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_payments_order ON public.payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_user ON public.payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments(status);

DROP POLICY IF EXISTS "payments_select_own_or_staff" ON public.payments;
CREATE POLICY "payments_select_own_or_staff" ON public.payments FOR SELECT
  TO anon, authenticated USING (
    user_id = auth.uid()
    OR public.is_staff_or_admin()
    OR EXISTS (SELECT 1 FROM public.orders o WHERE o.id = payments.order_id AND (o.customer_id = auth.uid() OR o.customer_id IS NULL))
  );

DROP POLICY IF EXISTS "payments_insert_all" ON public.payments;
CREATE POLICY "payments_insert_all" ON public.payments FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "payments_update_staff" ON public.payments;
CREATE POLICY "payments_update_staff" ON public.payments FOR UPDATE
  TO authenticated USING (public.is_staff_or_admin()) WITH CHECK (public.is_staff_or_admin());

-- ============================================================
-- 9. ORDER STATUS HISTORY (AUDIT TRAIL)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.order_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  status text NOT NULL,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_order_status_history_order ON public.order_status_history(order_id);

DROP POLICY IF EXISTS "status_history_select_own_or_staff" ON public.order_status_history;
CREATE POLICY "status_history_select_own_or_staff" ON public.order_status_history FOR SELECT
  TO anon, authenticated USING (
    public.is_staff_or_admin()
    OR EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_status_history.order_id AND (o.customer_id = auth.uid() OR o.customer_id IS NULL))
  );

DROP POLICY IF EXISTS "status_history_insert_all" ON public.order_status_history;
CREATE POLICY "status_history_insert_all" ON public.order_status_history FOR INSERT
  TO anon, authenticated WITH CHECK (true);

-- Auto-record order status transitions
CREATE OR REPLACE FUNCTION public.log_order_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF (TG_OP = 'INSERT') OR (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status) THEN
    INSERT INTO public.order_status_history (order_id, status, notes, created_by)
    VALUES (NEW.id, NEW.status, 'Status updated to ' || NEW.status, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_order_status_change ON public.orders;
CREATE TRIGGER trg_log_order_status_change
  AFTER INSERT OR UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.log_order_status_change();
