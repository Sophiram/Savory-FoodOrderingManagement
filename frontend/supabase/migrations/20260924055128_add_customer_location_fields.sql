/*
# Add GPS Location Fields to Orders Table

## Overview
Adds optional GPS latitude/longitude columns to the `orders` table so that
customers who order from home can share their live location with the restaurant.
The admin can then click a Google Maps link to navigate to the customer.

## Changes to `orders` table
1. Add `customer_lat` (double precision, nullable) — customer GPS latitude
2. Add `customer_lng` (double precision, nullable) — customer GPS longitude

## Security
- No RLS policy changes needed — the edge function handles the insert with
  the service role key, and existing admin/staff SELECT policies cover the new columns.
*/

ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_lat double precision;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_lng double precision;
