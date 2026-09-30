# Savory Food Ordering System

Savory is a restaurant ordering application that allows customers to browse the menu, place orders, and track order status, while staff and admins manage menu items, orders, and dashboard analytics.

## Project overview

This project is a modern full-stack web app built for food ordering and restaurant operations.

- Frontend: React + TypeScript + Vite
- Styling: Tailwind CSS
- Backend: Supabase
- Database: PostgreSQL (via Supabase)
- Authentication: Supabase Auth
- Server-side API: Supabase Edge Function (Deno)
- Real-time data access: Supabase client library

## What technologies are used?

### Frontend

- React 18
- TypeScript
- Vite
- Tailwind CSS
- Lucide React icons
- QR code generation library

The frontend is responsible for:

- customer menu browsing
- cart and checkout flow
- public ordering page
- admin dashboard
- staff management views
- login and account creation

### Backend

- Supabase for authentication and database
- PostgreSQL database managed by Supabase
- Row Level Security (RLS) for database protection
- Supabase Edge Function for order creation
- Deno runtime for serverless function logic

The backend handles:

- user sign-in/sign-up
- profile and role management
- menu and category data
- order creation and validation
- order item insertion
- server-side price calculation
- order status tracking

## Key app features

- public ordering page without login
- authenticated customer and staff experience
- admin dashboard with order statistics
- order status management
- menu browsing by categories
- search functionality
- cart and checkout flow
- QR-based ordering support
- customer delivery and pickup flow

## Architecture

The app uses a client-server style architecture with Supabase as the backend platform:

- React frontend calls the Supabase client SDK
- database tables store profiles, menu items, categories, orders, and order items
- authentication is handled by Supabase Auth
- the `create-order` Edge Function validates requests and inserts orders securely

## Project structure

```bash
src/
  App.tsx
  components/
  lib/
  pages/

supabase/
  functions/
    create-order/
      index.ts
  migrations/

public/
```

## Environment variables

Create a `.env` file in the project root with your Supabase credentials:

```bash
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

These values are used by the frontend client in `src/lib/supabase.ts`.

## Local development

Install dependencies:

```bash
npm install
```

Run the app:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

Type-check the app:

```bash
npm run typecheck
```

## Main technologies summary

Frontend:
- React
- TypeScript
- Vite
- Tailwind CSS
- Lucide

Backend:
- Supabase Auth
- Supabase Database (PostgreSQL)
- Supabase Edge Functions (Deno)
- SQL migrations

## Notes

This project is designed as a restaurant ordering and management system and uses Supabase as its main backend service rather than a traditional custom Node/Express API.

The public ordering flow and internal admin flow are separated, and the order creation API is implemented as an Edge Function so the server can validate menu data and calculate totals safely before saving to the database.
