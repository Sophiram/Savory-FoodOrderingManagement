/*
# Fix infinite recursion in profiles RLS policies

## Problem
The admin policies on `profiles` reference the `profiles` table in a subquery
to check the role, causing infinite recursion: to check if you can read profiles,
it reads profiles, which checks if you can read profiles, etc.

## Fix
1. Create SECURITY DEFINER functions `is_admin()` and `is_staff_or_admin()`
   that read the role with RLS bypassed.
2. Replace all subquery-based role checks in policies with these functions.

## Tables affected
- profiles, categories, menu_items, orders, order_items
*/

-- ============================================================
-- Helper functions (SECURITY DEFINER to bypass RLS)
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

CREATE OR REPLACE FUNCTION public.is_staff_or_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'staff')
  );
$$;

-- ============================================================
-- PROFILES
-- ============================================================

DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
CREATE POLICY "profiles_select_own" ON profiles FOR SELECT
  TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_select_admin" ON profiles;
CREATE POLICY "profiles_select_admin" ON profiles FOR SELECT
  TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "profiles_update_admin" ON profiles;
CREATE POLICY "profiles_update_admin" ON profiles FOR UPDATE
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ============================================================
-- CATEGORIES
-- ============================================================

DROP POLICY IF EXISTS "categories_select_all" ON categories;
CREATE POLICY "categories_select_all" ON categories FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "categories_insert_staff" ON categories;
CREATE POLICY "categories_insert_staff" ON categories FOR INSERT
  TO authenticated WITH CHECK (public.is_staff_or_admin());

DROP POLICY IF EXISTS "categories_update_staff" ON categories;
CREATE POLICY "categories_update_staff" ON categories FOR UPDATE
  TO authenticated USING (public.is_staff_or_admin()) WITH CHECK (public.is_staff_or_admin());

DROP POLICY IF EXISTS "categories_delete_staff" ON categories;
CREATE POLICY "categories_delete_staff" ON categories FOR DELETE
  TO authenticated USING (public.is_staff_or_admin());

-- ============================================================
-- MENU ITEMS
-- ============================================================

DROP POLICY IF EXISTS "menu_items_select_all" ON menu_items;
CREATE POLICY "menu_items_select_all" ON menu_items FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "menu_items_insert_staff" ON menu_items;
CREATE POLICY "menu_items_insert_staff" ON menu_items FOR INSERT
  TO authenticated WITH CHECK (public.is_staff_or_admin());

DROP POLICY IF EXISTS "menu_items_update_staff" ON menu_items;
CREATE POLICY "menu_items_update_staff" ON menu_items FOR UPDATE
  TO authenticated USING (public.is_staff_or_admin()) WITH CHECK (public.is_staff_or_admin());

DROP POLICY IF EXISTS "menu_items_delete_staff" ON menu_items;
CREATE POLICY "menu_items_delete_staff" ON menu_items FOR DELETE
  TO authenticated USING (public.is_staff_or_admin());

-- ============================================================
-- ORDERS
-- ============================================================

DROP POLICY IF EXISTS "orders_select_own_or_staff" ON orders;
CREATE POLICY "orders_select_own_or_staff" ON orders FOR SELECT
  TO authenticated USING (
    customer_id = auth.uid()
    OR public.is_staff_or_admin()
  );

DROP POLICY IF EXISTS "orders_insert_all" ON orders;
CREATE POLICY "orders_insert_all" ON orders FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "orders_update_staff" ON orders;
CREATE POLICY "orders_update_staff" ON orders FOR UPDATE
  TO authenticated USING (public.is_staff_or_admin()) WITH CHECK (public.is_staff_or_admin());

DROP POLICY IF EXISTS "orders_cancel_own" ON orders;
CREATE POLICY "orders_cancel_own" ON orders FOR UPDATE
  TO authenticated USING (
    customer_id = auth.uid() AND status = 'pending'
  ) WITH CHECK (
    customer_id = auth.uid() AND status = 'cancelled'
  );

DROP POLICY IF EXISTS "orders_delete_staff" ON orders;
CREATE POLICY "orders_delete_staff" ON orders FOR DELETE
  TO authenticated USING (public.is_staff_or_admin());

-- ============================================================
-- ORDER ITEMS
-- ============================================================

DROP POLICY IF EXISTS "order_items_select_own_or_staff" ON order_items;
CREATE POLICY "order_items_select_own_or_staff" ON order_items FOR SELECT
  TO anon, authenticated USING (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_items.order_id
      AND (o.customer_id = auth.uid()
           OR public.is_staff_or_admin()
           OR o.customer_id IS NULL)
    )
  );

DROP POLICY IF EXISTS "order_items_insert_all" ON order_items;
CREATE POLICY "order_items_insert_all" ON order_items FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "order_items_update_staff" ON order_items;
CREATE POLICY "order_items_update_staff" ON order_items FOR UPDATE
  TO authenticated USING (public.is_staff_or_admin()) WITH CHECK (public.is_staff_or_admin());

DROP POLICY IF EXISTS "order_items_delete_staff" ON order_items;
CREATE POLICY "order_items_delete_staff" ON order_items FOR DELETE
  TO authenticated USING (public.is_staff_or_admin());
