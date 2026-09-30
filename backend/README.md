# Savory FastAPI Backend (Python)

A high-performance REST API built with **FastAPI** for the Savory Food Ordering System.

## Features
- **Menu Management**: Full CRUD for categories and menu items, toggle availability, featured/popular tags.
- **Order Lifecycle**: Place orders, calculate subtotal/discount/delivery, update order status, update payment status.
- **Table Management**: Table numbers, capacity, active states, QR code endpoints.
- **Coupons & Promotions**: Percentage and fixed discounts, expiration dates, usage limits, validation endpoint.
- **Restaurant Settings**: Operational hours, delivery fee, min order, tax rate, toggles.
- **Staff & Profiles**: Role management (admin, manager, staff, customer).
- **KHQR Bakong Payments**: Cambodian EMV QR generation, MD5 transaction verification.
- **Dual-Mode Persistence**:
  - Connects to Supabase with `SUPABASE_SERVICE_ROLE_KEY` to **completely bypass Row-Level Security (RLS)**.
  - Built-in SQLite database (`savory.db`) for instant zero-configuration local development.

---

## Quick Start

### 1. Launch Backend
Run the batch file in the `backend/` folder:
```cmd
start.bat
```
Or with Python:
```bash
cd backend
.\venv\Scripts\python.exe run.py
```

The server runs on **`http://localhost:8000`**.
Interactive Swagger documentation is available at **`http://localhost:8000/docs`**.

---

## API Endpoints Overview

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/menu/categories` | List all categories |
| `POST` | `/api/menu/categories` | Create new category |
| `PUT` | `/api/menu/categories/{id}` | Update category |
| `DELETE` | `/api/menu/categories/{id}` | Delete category |
| `GET` | `/api/menu/items` | List menu items (filter by category, availability, search) |
| `POST` | `/api/menu/items` | Create new menu item |
| `PUT` | `/api/menu/items/{id}` | Update menu item details & pricing |
| `PATCH` | `/api/menu/items/{id}/availability` | Toggle item in/out of stock |
| `DELETE` | `/api/menu/items/{id}` | Delete menu item |
| `GET` | `/api/orders` | List orders with item details |
| `POST` | `/api/orders` | Place new order |
| `PATCH` | `/api/orders/{id}/status` | Update order progress (pending, preparing, ready, etc.) |
| `PATCH` | `/api/orders/{id}/payment-status` | Update payment status (paid, unpaid, pending) |
| `GET` | `/api/tables` | List restaurant dining tables |
| `POST` | `/api/tables` | Add new table |
| `PUT` | `/api/tables/{id}` | Edit table |
| `DELETE` | `/api/tables/{id}` | Delete table |
| `GET` | `/api/coupons` | List all promotional coupons |
| `POST` | `/api/coupons` | Create coupon |
| `POST` | `/api/coupons/validate` | Validate coupon code and calculate discount |
| `GET` | `/api/settings` | Get restaurant configuration |
| `PUT` | `/api/settings` | Update restaurant configuration |
| `POST` | `/api/payments/create-khqr` | Generate KHQR payment string & MD5 |
| `POST` | `/api/payments/check-khqr` | Check Bakong payment confirmation |

---

## Supabase RLS Fix (Optional)
If you also want direct write access from the browser without RLS restrictions, open your Supabase Dashboard -> **SQL Editor** and run:
`frontend/supabase/migrations/DISABLE_RLS_FOR_DEV.sql`
