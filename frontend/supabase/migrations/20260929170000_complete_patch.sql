-- ============================================================
-- SAVORY COMPLETE PATCH — Run this in Supabase SQL Editor
-- Fixes ALL admin update failures and adds all missing features
-- Safe to run multiple times (uses IF NOT EXISTS / OR REPLACE)
-- ============================================================

-- ============================================================
-- 1. EXTEND HELPER FUNCTIONS to include 'manager' role
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_admin()
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
-- 2. FIX profiles CHECK — add 'manager' role
-- ============================================================

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'manager', 'staff', 'customer'));

-- Add missing profile columns
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone   text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- ============================================================
-- 3. ADD MISSING menu_items COLUMNS
--    (this is why Edit was failing — columns didn't exist)
-- ============================================================

ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS preparation_time integer DEFAULT 20;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS is_featured       boolean NOT NULL DEFAULT false;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS is_popular        boolean NOT NULL DEFAULT false;

-- ============================================================
-- 4. FIX orders TABLE — constraints + missing columns
-- ============================================================

-- Drop old restrictive constraints
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_order_type_check;
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_status_check;

-- Add correct constraints
ALTER TABLE orders
  ADD CONSTRAINT orders_order_type_check
  CHECK (order_type IN ('delivery', 'pickup', 'dine_in'));

ALTER TABLE orders
  ADD CONSTRAINT orders_status_check
  CHECK (status IN (
    'pending', 'confirmed', 'preparing', 'ready',
    'out_for_delivery', 'delivered', 'completed', 'cancelled'
  ));

ALTER TABLE orders
  ADD CONSTRAINT orders_payment_status_check
  CHECK (payment_status IN (
    'unpaid', 'pending', 'paid', 'failed', 'refunded', 'cancelled'
  ));

-- Add all missing columns to orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_number            text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_name           text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS phone                   text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS address                 text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_type              text DEFAULT 'delivery';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS subtotal                numeric(10,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_fee            numeric(10,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tax                     numeric(10,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount                numeric(10,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status          text DEFAULT 'unpaid';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method          text DEFAULT 'cash';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_id               uuid;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_code             text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS estimated_prep_time     integer DEFAULT 20;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS estimated_delivery_time integer;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_lat            numeric;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_lng            numeric;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS updated_at              timestamptz DEFAULT now();

-- Allow admin/customer to update their own orders (cancel)
DROP POLICY IF EXISTS "orders_select_guest" ON orders;
CREATE POLICY "orders_select_guest" ON orders FOR SELECT
  TO anon USING (true);

DROP POLICY IF EXISTS "orders_update_own_customer" ON orders;
CREATE POLICY "orders_update_own_customer" ON orders FOR UPDATE
  TO authenticated
  USING (customer_id = auth.uid())
  WITH CHECK (customer_id = auth.uid());

-- ============================================================
-- 5. RESTAURANT SETTINGS (singleton config table)
-- ============================================================

CREATE TABLE IF NOT EXISTS restaurant_settings (
  id                      uuid PRIMARY KEY DEFAULT '00000000-0000-0000-0000-000000000001',
  name                    text NOT NULL DEFAULT 'Savory',
  tagline                 text,
  phone                   text,
  email                   text,
  address                 text,
  opening_time            text DEFAULT '08:00',
  closing_time            text DEFAULT '22:00',
  delivery_fee            numeric(10,2) DEFAULT 2.50,
  min_delivery_order      numeric(10,2),
  tax_rate                numeric(5,4) DEFAULT 0.00,
  currency                text DEFAULT 'USD',
  currency_symbol         text DEFAULT '$',
  default_prep_time       integer DEFAULT 20,
  is_order_acceptance_open boolean DEFAULT true,
  is_pickup_enabled       boolean DEFAULT true,
  is_delivery_enabled     boolean DEFAULT true,
  updated_at              timestamptz DEFAULT now()
);

ALTER TABLE restaurant_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "settings_select_all" ON restaurant_settings;
CREATE POLICY "settings_select_all" ON restaurant_settings FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "settings_write_admin" ON restaurant_settings;
CREATE POLICY "settings_write_admin" ON restaurant_settings FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Seed default settings row
INSERT INTO restaurant_settings (id, name, tagline)
VALUES ('00000000-0000-0000-0000-000000000001', 'Savory', 'Fresh food, made to order')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 6. RESTAURANT TABLES (QR dine-in tables)
-- ============================================================

CREATE TABLE IF NOT EXISTS restaurant_tables (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_number integer UNIQUE NOT NULL,
  name         text,
  capacity     integer DEFAULT 4,
  is_active    boolean DEFAULT true,
  created_at   timestamptz DEFAULT now()
);

ALTER TABLE restaurant_tables ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tables_select_all" ON restaurant_tables;
CREATE POLICY "tables_select_all" ON restaurant_tables FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "tables_write_admin" ON restaurant_tables;
CREATE POLICY "tables_write_admin" ON restaurant_tables FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Seed 5 default tables
INSERT INTO restaurant_tables (table_number, name, capacity) VALUES
  (1, 'Table 1', 2), (2, 'Table 2', 4), (3, 'Table 3', 4),
  (4, 'Table 4', 6), (5, 'Table 5', 8)
ON CONFLICT (table_number) DO NOTHING;

-- ============================================================
-- 7. COUPONS / PROMOTIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS coupons (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code            text UNIQUE NOT NULL,
  description     text DEFAULT '',
  discount_type   text NOT NULL DEFAULT 'percentage' CHECK (discount_type IN ('percentage', 'fixed')),
  discount_value  numeric(10,2) NOT NULL CHECK (discount_value > 0),
  min_order_amount numeric(10,2) DEFAULT 0,
  max_usage       integer,
  current_usage   integer DEFAULT 0,
  start_date      timestamptz,
  end_date        timestamptz,
  is_active       boolean DEFAULT true,
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "coupons_select_all" ON coupons;
CREATE POLICY "coupons_select_all" ON coupons FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "coupons_write_admin" ON coupons;
CREATE POLICY "coupons_write_admin" ON coupons FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Seed sample coupons
INSERT INTO coupons (code, description, discount_type, discount_value, min_order_amount, is_active)
VALUES
  ('SAVORY10', '10% off your order', 'percentage', 10, 5.00, true),
  ('WELCOME5', '$5 off orders over $20', 'fixed', 5, 20.00, true)
ON CONFLICT (code) DO NOTHING;

-- Helper function to increment coupon usage atomically
CREATE OR REPLACE FUNCTION public.increment_coupon_usage(c_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE coupons SET current_usage = current_usage + 1 WHERE id = c_id;
END;
$$;

-- ============================================================
-- 8. PAYMENTS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS payments (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id               uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  user_id                uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  payment_method         text NOT NULL DEFAULT 'cash',
  amount                 numeric(10,2) NOT NULL DEFAULT 0,
  currency               text DEFAULT 'USD',
  status                 text NOT NULL DEFAULT 'unpaid',
  transaction_reference  text,
  provider               text DEFAULT 'cash_counter',
  provider_transaction_id text,
  qr_data                text,
  paid_at                timestamptz,
  failed_at              timestamptz,
  refunded_at            timestamptz,
  created_at             timestamptz DEFAULT now(),
  updated_at             timestamptz DEFAULT now()
);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payments_select_own_or_staff" ON payments;
CREATE POLICY "payments_select_own_or_staff" ON payments FOR SELECT
  TO authenticated USING (user_id = auth.uid() OR public.is_staff_or_admin());

DROP POLICY IF EXISTS "payments_insert_all" ON payments;
CREATE POLICY "payments_insert_all" ON payments FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "payments_update_staff" ON payments;
CREATE POLICY "payments_update_staff" ON payments FOR UPDATE
  TO authenticated USING (public.is_staff_or_admin()) WITH CHECK (public.is_staff_or_admin());

-- ============================================================
-- 9. ORDER STATUS HISTORY
-- ============================================================

CREATE TABLE IF NOT EXISTS order_status_history (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id   uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status     text NOT NULL,
  notes      text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE order_status_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "history_select_staff" ON order_status_history;
CREATE POLICY "history_select_staff" ON order_status_history FOR SELECT
  TO authenticated USING (public.is_staff_or_admin());

DROP POLICY IF EXISTS "history_insert_all" ON order_status_history;
CREATE POLICY "history_insert_all" ON order_status_history FOR INSERT TO authenticated WITH CHECK (true);

-- ============================================================
-- 10. AUTO order_number TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION public.generate_order_number()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  date_str text;
  seq_num  int;
BEGIN
  IF NEW.order_number IS NULL OR NEW.order_number = '' THEN
    date_str := to_char(now(), 'YYYYMMDD');
    SELECT COALESCE(MAX(
      CASE WHEN order_number ~ ('^SV-' || date_str || '-\d+$')
           THEN (split_part(order_number, '-', 3))::int
           ELSE 0
      END
    ), 0) + 1
    INTO seq_num
    FROM orders
    WHERE order_number LIKE 'SV-' || date_str || '-%';
    NEW.order_number := 'SV-' || date_str || '-' || lpad(seq_num::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_order_number ON orders;
CREATE TRIGGER set_order_number
  BEFORE INSERT ON orders
  FOR EACH ROW EXECUTE FUNCTION public.generate_order_number();

-- ============================================================
-- VERIFY — check the results
-- ============================================================

SELECT 'profiles columns' AS check, column_name FROM information_schema.columns
  WHERE table_name = 'profiles' AND column_name IN ('phone','address','updated_at')
UNION ALL
SELECT 'menu_items columns', column_name FROM information_schema.columns
  WHERE table_name = 'menu_items' AND column_name IN ('preparation_time','is_featured','is_popular')
UNION ALL
SELECT 'orders constraints', constraint_name FROM information_schema.table_constraints
  WHERE table_name = 'orders' AND constraint_name IN ('orders_order_type_check','orders_status_check')
UNION ALL
SELECT 'new tables', table_name FROM information_schema.tables
  WHERE table_name IN ('restaurant_settings','restaurant_tables','coupons','payments','order_status_history');
