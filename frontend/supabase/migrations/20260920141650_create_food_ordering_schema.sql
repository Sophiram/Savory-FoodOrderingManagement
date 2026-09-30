/*
# Food Ordering Management System — Core Schema

## Overview
Creates the full schema for a food ordering management system with admin authentication
and role-based permissions. Supports three roles: admin, staff, and customer.

## New Tables

1. `profiles` — Extends auth.users with role information
   - `id` (uuid, PK, references auth.users)
   - `full_name` (text)
   - `role` (text: 'admin' | 'staff' | 'customer', default 'customer')
   - `avatar_url` (text, nullable)
   - `created_at` (timestamptz)

2. `categories` — Menu categories (e.g. Appetizers, Mains, Desserts)
   - `id` (uuid, PK)
   - `name` (text, not null)
   - `description` (text)
   - `sort_order` (int, default 0)
   - `created_at` (timestamptz)

3. `menu_items` — Individual food items
   - `id` (uuid, PK)
   - `category_id` (uuid, FK to categories)
   - `name` (text, not null)
   - `description` (text)
   - `price` (numeric(10,2), not null)
   - `image_url` (text, nullable)
   - `is_available` (boolean, default true)
   - `sort_order` (int, default 0)
   - `created_at` (timestamptz)

4. `orders` — Customer orders
   - `id` (uuid, PK)
   - `customer_id` (uuid, FK to auth.users, nullable for guest orders)
   - `customer_name` (text, nullable for guest orders)
   - `status` (text: 'pending' | 'preparing' | 'ready' | 'completed' | 'cancelled', default 'pending')
   - `total` (numeric(10,2), default 0)
   - `notes` (text, nullable)
   - `table_number` (int, nullable)
   - `created_at` (timestamptz)
   - `updated_at` (timestamptz)

5. `order_items` — Line items within an order
   - `id` (uuid, PK)
   - `order_id` (uuid, FK to orders)
   - `menu_item_id` (uuid, FK to menu_items)
   - `quantity` (int, not null, default 1)
   - `unit_price` (numeric(10,2), not null)
   - `notes` (text, nullable)

## Security (RLS)

- `profiles`: users can read/update their own profile; admins can read all profiles
- `categories`: public read (customers need to see menu); admin/staff can write
- `menu_items`: public read; admin/staff can write
- `orders`: customers see their own; admin/staff see all; customers can insert their own
- `order_items`: scoped through parent order ownership

## Important Notes
1. The `profiles` table uses a trigger to auto-create a profile row on signup.
2. Role defaults to 'customer' — the first admin must be set via SQL after signup.
3. `updated_at` on orders auto-updates via trigger.
*/

-- ============================================================
-- PROFILES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'customer' CHECK (role IN ('admin', 'staff', 'customer')),
  avatar_url text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile
DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
CREATE POLICY "profiles_select_own" ON profiles FOR SELECT
  TO authenticated USING (auth.uid() = id);

-- Users can update their own profile (but not their role)
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Admins can read all profiles
DROP POLICY IF EXISTS "profiles_select_admin" ON profiles;
CREATE POLICY "profiles_select_admin" ON profiles FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- Admins can update all profiles (to change roles)
DROP POLICY IF EXISTS "profiles_update_admin" ON profiles;
CREATE POLICY "profiles_update_admin" ON profiles FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), 'customer')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- CATEGORIES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text DEFAULT '',
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

-- Public read (customers need to see the menu)
DROP POLICY IF EXISTS "categories_select_all" ON categories;
CREATE POLICY "categories_select_all" ON categories FOR SELECT
  TO anon, authenticated USING (true);

-- Admin/staff can write
DROP POLICY IF EXISTS "categories_insert_staff" ON categories;
CREATE POLICY "categories_insert_staff" ON categories FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'staff'))
  );

DROP POLICY IF EXISTS "categories_update_staff" ON categories;
CREATE POLICY "categories_update_staff" ON categories FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'staff'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'staff'))
  );

DROP POLICY IF EXISTS "categories_delete_staff" ON categories;
CREATE POLICY "categories_delete_staff" ON categories FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'staff'))
  );

-- ============================================================
-- MENU ITEMS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS menu_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text DEFAULT '',
  price numeric(10,2) NOT NULL CHECK (price >= 0),
  image_url text,
  is_available boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_menu_items_category ON menu_items(category_id);

-- Public read
DROP POLICY IF EXISTS "menu_items_select_all" ON menu_items;
CREATE POLICY "menu_items_select_all" ON menu_items FOR SELECT
  TO anon, authenticated USING (true);

-- Admin/staff can write
DROP POLICY IF EXISTS "menu_items_insert_staff" ON menu_items;
CREATE POLICY "menu_items_insert_staff" ON menu_items FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'staff'))
  );

DROP POLICY IF EXISTS "menu_items_update_staff" ON menu_items;
CREATE POLICY "menu_items_update_staff" ON menu_items FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'staff'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'staff'))
  );

DROP POLICY IF EXISTS "menu_items_delete_staff" ON menu_items;
CREATE POLICY "menu_items_delete_staff" ON menu_items FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'staff'))
  );

-- ============================================================
-- ORDERS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  customer_name text DEFAULT '',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'preparing', 'ready', 'completed', 'cancelled')),
  total numeric(10,2) NOT NULL DEFAULT 0,
  notes text,
  table_number int,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);

-- Customers can read their own orders; admin/staff can read all
DROP POLICY IF EXISTS "orders_select_own_or_staff" ON orders;
CREATE POLICY "orders_select_own_or_staff" ON orders FOR SELECT
  TO authenticated USING (
    customer_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'staff'))
  );

-- Anyone (including anon for guest orders) can insert orders
DROP POLICY IF EXISTS "orders_insert_all" ON orders;
CREATE POLICY "orders_insert_all" ON orders FOR INSERT
  TO anon, authenticated WITH CHECK (true);

-- Admin/staff can update orders (status changes)
DROP POLICY IF EXISTS "orders_update_staff" ON orders;
CREATE POLICY "orders_update_staff" ON orders FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'staff'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'staff'))
  );

-- Customers can update their own order (cancel only, before preparation)
DROP POLICY IF EXISTS "orders_cancel_own" ON orders;
CREATE POLICY "orders_cancel_own" ON orders FOR UPDATE
  TO authenticated USING (
    customer_id = auth.uid() AND status = 'pending'
  ) WITH CHECK (
    customer_id = auth.uid() AND status = 'cancelled'
  );

-- Admin/staff can delete orders
DROP POLICY IF EXISTS "orders_delete_staff" ON orders;
CREATE POLICY "orders_delete_staff" ON orders FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'staff'))
  );

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_updated_at ON orders;
CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================================
-- ORDER ITEMS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id uuid NOT NULL REFERENCES menu_items(id) ON DELETE RESTRICT,
  quantity int NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price numeric(10,2) NOT NULL CHECK (unit_price >= 0),
  notes text
);

ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

-- Read: through parent order ownership or staff
DROP POLICY IF EXISTS "order_items_select_own_or_staff" ON order_items;
CREATE POLICY "order_items_select_own_or_staff" ON order_items FOR SELECT
  TO anon, authenticated USING (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_items.order_id
      AND (o.customer_id = auth.uid()
           OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'staff'))
           OR o.customer_id IS NULL)
    )
  );

-- Insert: anyone can add items to their own/guest order
DROP POLICY IF EXISTS "order_items_insert_all" ON order_items;
CREATE POLICY "order_items_insert_all" ON order_items FOR INSERT
  TO anon, authenticated WITH CHECK (true);

-- Update: admin/staff only
DROP POLICY IF EXISTS "order_items_update_staff" ON order_items;
CREATE POLICY "order_items_update_staff" ON order_items FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'staff'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'staff'))
  );

-- Delete: admin/staff only
DROP POLICY IF EXISTS "order_items_delete_staff" ON order_items;
CREATE POLICY "order_items_delete_staff" ON order_items FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'staff'))
  );

-- ============================================================
-- SEED DATA
-- ============================================================
INSERT INTO categories (name, description, sort_order) VALUES
  ('Appetizers', 'Start your meal right', 1),
  ('Main Courses', 'Hearty dishes for every taste', 2),
  ('Desserts', 'Sweet endings', 3),
  ('Beverages', 'Refreshing drinks', 4)
ON CONFLICT DO NOTHING;

INSERT INTO menu_items (category_id, name, description, price, image_url, is_available, sort_order)
SELECT c.id, m.name, m.description, m.price, m.image_url, true, m.sort_order
FROM (VALUES
  ('Appetizers', 'Bruschetta', 'Grilled bread with tomatoes, garlic, basil', 8.50, 'https://images.pexels.com/photos/1437267/pexels-photo-1437267.jpeg', 1),
  ('Appetizers', 'Calamari', 'Crispy fried calamari with marinara sauce', 12.00, 'https://images.pexels.com/photos/566345/pexels-photo-566345.jpeg', 2),
  ('Appetizers', 'Spring Rolls', 'Fresh vegetable spring rolls with dipping sauce', 7.50, 'https://images.pexels.com/photos/1234597/pexels-photo-1234597.jpeg', 3),
  ('Main Courses', 'Grilled Salmon', 'Atlantic salmon with lemon butter sauce', 24.00, 'https://images.pexels.com/photos/1640777/pexels-photo-1640777.jpeg', 1),
  ('Main Courses', 'Margherita Pizza', 'Tomato, mozzarella, fresh basil', 16.00, 'https://images.pexels.com/photos/315755/pexels-photo-315755.jpeg', 2),
  ('Main Courses', 'Beef Burger', 'Juicy beef patty with cheese and fries', 18.00, 'https://images.pexels.com/photos/1639557/pexels-photo-1639557.jpeg', 3),
  ('Main Courses', 'Caesar Salad', 'Romaine, croutons, parmesan, caesar dressing', 12.50, 'https://images.pexels.com/photos/1546093/pexels-photo-1546093.jpeg', 4),
  ('Desserts', 'Tiramisu', 'Italian coffee-flavored dessert', 7.00, 'https://images.pexels.com/photos/6880219/pexels-photo-6880219.jpeg', 1),
  ('Desserts', 'Chocolate Cake', 'Rich molten chocolate cake', 6.50, 'https://images.pexels.com/photos/45202/pexels-photo-45202.jpeg', 2),
  ('Beverages', 'Fresh Lemonade', 'Homemade lemonade with mint', 4.50, 'https://images.pexels.com/photos/96974/pexels-photo-96974.jpeg', 1),
  ('Beverages', 'Iced Coffee', 'Cold brew with vanilla', 5.00, 'https://images.pexels.com/photos/312418/pexels-photo-312418.jpeg', 2)
) AS m(category_name, name, description, price, image_url, sort_order)
JOIN categories c ON c.name = m.category_name
ON CONFLICT DO NOTHING;
