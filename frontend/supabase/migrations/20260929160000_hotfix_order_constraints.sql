-- ============================================================
-- HOTFIX: Expand orders.order_type constraint to include dine_in
-- Also expands orders.status to include all required values
-- Run this in Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. Drop the old restrictive order_type CHECK constraint
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_order_type_check;

-- 2. Add the correct constraint with all three values
ALTER TABLE orders
  ADD CONSTRAINT orders_order_type_check
  CHECK (order_type IN ('delivery', 'pickup', 'dine_in'));

-- 3. Also fix the status constraint while we're here
--    (original only had 4 values, we need 8)
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;

ALTER TABLE orders
  ADD CONSTRAINT orders_status_check
  CHECK (status IN (
    'pending',
    'confirmed',
    'preparing',
    'ready',
    'out_for_delivery',
    'delivered',
    'completed',
    'cancelled'
  ));

-- 4. Fix payment_status constraint if needed
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_status_check;

ALTER TABLE orders
  ADD CONSTRAINT orders_payment_status_check
  CHECK (payment_status IN (
    'unpaid',
    'pending',
    'paid',
    'failed',
    'refunded',
    'cancelled'
  ));

-- 5. Add any missing columns that the app now expects
--    (safe with IF NOT EXISTS)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_number     text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS subtotal         numeric(10,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_fee     numeric(10,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tax              numeric(10,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount         numeric(10,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status   text DEFAULT 'unpaid';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method   text DEFAULT 'cash';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_id        uuid REFERENCES coupons(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_code      text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS estimated_prep_time     integer DEFAULT 20;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS estimated_delivery_time integer;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_lat     numeric;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_lng     numeric;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS updated_at       timestamptz DEFAULT now();

-- 6. Confirm success
SELECT
  constraint_name,
  check_clause
FROM information_schema.check_constraints
WHERE constraint_name IN (
  'orders_order_type_check',
  'orders_status_check',
  'orders_payment_status_check'
);
