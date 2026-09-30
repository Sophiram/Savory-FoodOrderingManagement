/*
# Add QR Order Fields to Orders Table

## Overview
Extends the existing `orders` table to support QR code home ordering with
customer contact info, delivery/pickup type, and an expanded status flow.

## Changes to `orders` table
1. Add `phone` (text, nullable) — customer phone number for delivery/pickup
2. Add `address` (text, nullable) — delivery address (required for delivery, optional for pickup)
3. Add `order_type` (text, nullable) — 'delivery' or 'pickup'
4. Add `confirmed` to the status CHECK constraint

## Status Flow Update
Old: pending → preparing → ready → completed (cancelled)
New: pending → confirmed → preparing → ready → completed (cancelled)

## Security
- No RLS policy changes needed — existing policies already allow anon INSERT
  and staff UPDATE on orders.
- The edge function will handle server-side price validation and order creation
  using the service role key, bypassing RLS for the insert.
*/

-- Add new columns (idempotent)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_type text CHECK (order_type IN ('delivery', 'pickup'));

-- Update status constraint to include 'confirmed'
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('pending', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled'));
