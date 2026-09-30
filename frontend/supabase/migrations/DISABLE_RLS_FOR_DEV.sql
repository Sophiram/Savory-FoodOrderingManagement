-- ============================================================
-- SAVORY: FIX ALL PERMISSION / RLS & MISSING COLUMN ERRORS
-- Run this in Supabase Dashboard -> SQL Editor -> Run
-- ============================================================

-- 1. Ensure all missing columns exist in profiles
ALTER TABLE IF EXISTS profiles ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE IF EXISTS profiles ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE IF EXISTS profiles ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- 2. Ensure all missing columns exist in menu_items
ALTER TABLE IF EXISTS menu_items ADD COLUMN IF NOT EXISTS preparation_time integer DEFAULT 20;
ALTER TABLE IF EXISTS menu_items ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false;
ALTER TABLE IF EXISTS menu_items ADD COLUMN IF NOT EXISTS is_popular boolean NOT NULL DEFAULT false;

-- 3. Ensure orders table has all columns
ALTER TABLE IF EXISTS orders ADD COLUMN IF NOT EXISTS customer_name text;
ALTER TABLE IF EXISTS orders ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE IF EXISTS orders ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE IF EXISTS orders ADD COLUMN IF NOT EXISTS order_type text DEFAULT 'delivery';
ALTER TABLE IF EXISTS orders ADD COLUMN IF NOT EXISTS subtotal numeric(10,2) DEFAULT 0;
ALTER TABLE IF EXISTS orders ADD COLUMN IF NOT EXISTS delivery_fee numeric(10,2) DEFAULT 0;
ALTER TABLE IF EXISTS orders ADD COLUMN IF NOT EXISTS discount numeric(10,2) DEFAULT 0;
ALTER TABLE IF EXISTS orders ADD COLUMN IF NOT EXISTS coupon_code text;
ALTER TABLE IF EXISTS orders ADD COLUMN IF NOT EXISTS customer_lat numeric;
ALTER TABLE IF EXISTS orders ADD COLUMN IF NOT EXISTS customer_lng numeric;
ALTER TABLE IF EXISTS orders ADD COLUMN IF NOT EXISTS qr_string text;
ALTER TABLE IF EXISTS orders ADD COLUMN IF NOT EXISTS deeplink text;
ALTER TABLE IF EXISTS orders ADD COLUMN IF NOT EXISTS md5 text;

-- 4. Disable RLS for development so nothing gets blocked
ALTER TABLE IF EXISTS categories DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS menu_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS restaurant_tables DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS coupons DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS restaurant_settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS order_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS payments DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS profiles DISABLE ROW LEVEL SECURITY;

-- 5. Grant full permissions to all roles
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
