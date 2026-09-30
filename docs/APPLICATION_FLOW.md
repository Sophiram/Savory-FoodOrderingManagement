# Savory Food Ordering & Restaurant Management System
## Application Flow & System Architecture Proposal

---

## 1. Executive Summary & Architecture Overview

**Savory** is an enterprise-grade, omnichannel food ordering and restaurant management platform designed for quick-service restaurants, cafes, and multi-channel dining establishments. The platform operates simultaneously across three primary customer and operational interfaces:

1. **Responsive Customer Web Portal** (`/`, `/order`, `/menu`) — Mobile and desktop web ordering with live order tracking and interactive thermal receipts.
2. **Telegram Mini App (TMA)** (`/tg`, `/miniapp`) — Frictionless zero-login in-chat ordering utilizing native Telegram WebApp SDK, haptics, and automatic profile sync.
3. **Admin & Kitchen Operations Dashboard** (`/admin`) — Real-time live kitchen display system (KDS), menu manager, table floor plan, coupons, inventory control, and financial reporting.

### Core Technology Stack
- **Frontend Client**: React 18, TypeScript, Vite, Tailwind CSS, Lucide Icons, Telegram WebApp SDK (`@telegram-apps/sdk`).
- **Backend API**: Python 3.14, FastAPI (Asynchronous REST API, Uvicorn ASGI).
- **Database Engine**: **Hybrid Dual-Engine Architecture** — High-speed embedded SQLite (`backend/savory.db`) for sub-millisecond local POS latency + Cloud Supabase PostgreSQL for cloud synchronization.
- **Payment Gateway**: National Bank of Cambodia (NBC) **Bakong KHQR** (EMVCo dynamic QR specification, MD5 polling verification, mobile banking deep-linking) + Cash Counter payment.
- **Notification & Messaging Service**: Telegram Bot API (`@SavoryFoodAEU_bot`) for automated kitchen alerts, customer receipts, and interactive command polling.

---

## 2. High-Level System Architecture

```mermaid
flowchart TD
    subgraph Clients["Omnichannel Client Interfaces"]
        CW["📱 Customer Web App\n(Desktop / Mobile Browser)"]
        TMA["✈️ Telegram Mini App\n(Telegram iOS / Android / Desktop)"]
        ADM["👨‍🍳 Kitchen & Admin Dashboard\n(POS Display / Manager Portal)"]
        TB["🤖 Telegram Bot Chat\n(@SavoryFoodAEU_bot)"]
    end

    subgraph API["FastAPI Backend Gateway (Port 8000)"]
        ROUT["FastAPI Async Router"]
        AUTH["Auth & Role Guard\n(Admin / Manager / Staff)"]
        ORD_SVC["Order Orchestrator"]
        PAY_SVC["Payment & KHQR Engine"]
        INV_SVC["Inventory Auto-Deduct Engine"]
        TG_SVC["Telegram Bot & Notification Service"]
        POLL_SVC["Telegram Background Poller"]
    end

    subgraph Storage["Hybrid Dual Database Tier"]
        SQLITE[("⚡ Local SQLite DB\n(Primary Zero-Latency Engine)")]
        SUPA[("☁️ Supabase PostgreSQL\n(Cloud Sync & Multi-Branch Ready)")]
    end

    subgraph External["External Services & Financial Infrastructure"]
        BAKONG["🇰🇭 NBC Bakong Open API\n(KHQR / Interbank Settlement)"]
        TG_API["✈️ Telegram Bot API Server\n(api.telegram.org)"]
    end

    %% Client to API
    CW -->|REST / JSON| ROUT
    TMA -->|REST / Telegram WebApp SDK| ROUT
    ADM -->|REST / Live Status Updates| ROUT
    TB <-->|Long-polling Updates & Commands| POLL_SVC

    %% API Internal Routing
    ROUT --> AUTH
    ROUT --> ORD_SVC
    ROUT --> PAY_SVC
    ROUT --> INV_SVC
    ROUT --> TG_SVC

    %% API to Storage
    ORD_SVC --> SQLITE
    ORD_SVC --> SUPA
    PAY_SVC --> SQLITE
    PAY_SVC --> SUPA
    INV_SVC --> SQLITE
    INV_SVC --> SUPA

    %% API to External
    PAY_SVC <-->|KHQR String & MD5 Polling| BAKONG
    TG_SVC -->|HTML Notifications & Receipts| TG_API
    POLL_SVC <-->|getUpdates / answerCallbackQuery| TG_API
```

---

## 3. End-to-End User Journeys & Application Flows

### Flow 1: Customer Web Ordering & Dynamic KHQR Payment

```mermaid
sequenceDiagram
    autonumber
    actor Customer as 👤 Customer (Web)
    participant Front as 💻 Savory Web App
    participant API as ⚙️ FastAPI Backend
    participant DB as 💾 Database (SQLite/Supabase)
    participant Bakong as 🇰🇭 NBC Bakong API
    participant Bot as 🤖 Telegram Bot

    Customer->>Front: Browse Menu by Category, Search dishes
    Customer->>Front: Add Items to Cart, apply Coupon (e.g. SAVORY10)
    Customer->>Front: Choose Fulfillment (Delivery / Pickup / Dine-in Table)
    Customer->>Front: Select Payment Method: Bakong KHQR
    Customer->>Front: Click "Place Order"
    Front->>API: POST /api/orders (Order payload + Items)
    
    rect rgb(240, 248, 255)
        API->>Bakong: Generate dynamic EMV KHQR string & MD5 transaction hash
        Bakong-->>API: Return QR string, Deeplink, MD5
        API->>DB: INSERT into orders, order_items, payments (Status: pending, Payment: unpaid)
        API->>DB: Deduct inventory stock & create inventory_logs
        API->>Bot: Dispatch New Order Notification to Staff Group/Chat
    end

    API-->>Front: Order Confirmation (order_id, qr_string, deeplink, md5)
    Front->>Customer: Display Live Order Tracker with Bakong QR & Deeplink Button

    rect rgb(255, 250, 240)
        Customer->>Customer: Scan QR with ABA / Bakong / Mobile Banking App
        Customer->>Front: Click "I Have Paid / Confirm Payment"
        Front->>API: POST /api/payments/confirm/{order_id}
        API->>DB: UPDATE orders SET payment_status='paid', status='confirmed'
        API->>DB: UPDATE payments SET status='paid'
        API->>Bot: Send Payment Confirmed Alert to Telegram
    end

    Front->>Customer: ✅ Payment Verified! Order moved to Kitchen Preparation
    Customer->>Front: Click "View Receipt"
    Front->>Customer: Renders Printable Thermal Receipt (Print / Save / Send to Telegram)
```

---

### Flow 2: Telegram Mini App (TMA) Frictionless Flow

```mermaid
sequenceDiagram
    autonumber
    actor User as ✈️ Telegram User
    participant TMA as 📱 Savory Telegram Mini App
    participant TG_SDK as 🪟 Telegram WebApp SDK
    participant API as ⚙️ FastAPI Backend
    participant DB as 💾 Database
    participant Bot as 🤖 @SavoryFoodAEU_bot

    User->>Bot: Open @SavoryFoodAEU_bot & tap /start or /order
    Bot-->>User: Welcome Message with "🍽️ Open Savory Mini App & Order"
    User->>TMA: Opens Mini App inside Telegram
    TMA->>TG_SDK: WebApp.ready(), WebApp.expand(), setHeaderColor('#ea580c')
    TG_SDK-->>TMA: initDataUnsafe.user (first_name, username, id)
    TMA->>TMA: Auto-populate Customer Name & attach Telegram User ID
    
    User->>TMA: Tap "+ Add" on dishes (Triggers HapticFeedback 'light')
    User->>TMA: Tap "View Cart & Checkout" (Triggers HapticFeedback 'heavy')
    User->>TMA: Confirms Order (table number / address pre-filled)
    TMA->>API: POST /api/orders (includes telegram_user_id & telegram_chat_id)
    API->>DB: Save Order & Order Items
    
    par Async Dispatch
        API->>Bot: Send Staff Order Notification
    and Direct Customer Receipt
        API->>Bot: Send Official Digital Receipt directly to Customer's Chat ID!
    end

    API-->>TMA: Return Order Tracker + Bakong KHQR
    TMA->>User: Displays Live Tracker with "View Receipt" & "Pay with Bakong"
    Bot-->>User: 🔔 Telegram notification sound: "Receipt REC-SV-XXXX received!"
```

---

### Flow 3: Kitchen & Staff Order Fulfillment Lifecycle

```mermaid
stateDiagram-v2
    [*] --> pending: Customer Places Order (Web / Mini App)
    
    pending --> confirmed: Staff Accepts Order OR KHQR Paid
    pending --> cancelled: Customer Cancels (within grace period) OR Staff Voids
    
    confirmed --> preparing: Kitchen begins cooking (Chef starts ticket)
    note right of preparing: Stock already reserved & auto-deducted
    
    preparing --> ready: Food is plated & bagged
    
    ready --> out_for_delivery: Rider dispatched (Delivery orders)
    ready --> completed: Customer counter pickup (Takeaway / Dine-in)
    
    out_for_delivery --> delivered: Courier completes drop-off
    delivered --> completed: Transaction finalized & archived
    
    completed --> [*]
    cancelled --> [*]
```

#### Order Status Transition Matrix:

| Status Code | Display Label | Responsible Role | System Action Triggered |
|---|---|---|---|
| `pending` | Order Placed | Customer / Bot | Order created, Bakong QR generated, inventory deducted, Telegram alert sent. |
| `confirmed` | Accepted | Staff / Manager | Payment verified or counter cash approved, order enters kitchen queue. |
| `preparing` | Cooking | Kitchen Staff | Chef preparing dish, estimated time countdown starts. |
| `ready` | Ready for Pickup | Kitchen / Counter | Kitchen bell rings, Telegram alert sends to customer/courier. |
| `out_for_delivery` | Out for Delivery | Courier / Staff | GPS live tracking active, delivery timer started. |
| `delivered` | Delivered | Courier / Customer | Drop-off confirmed at customer coordinates. |
| `completed` | Completed | System / Manager | Order closed, financial logs tallied for sales report. |
| `cancelled` | Cancelled | Customer / Admin | Order voided, inventory quantities automatically replenished. |

---

### Flow 4: Telegram Bot Automated Service & Command Poller

```mermaid
flowchart TD
    A[Customer / Staff Messages @SavoryFoodAEU_bot] --> B{Parse Command or Callback}
    
    B -->|/start or /order| C[Auto-Capture Chat ID in DB]
    C --> D[Send Rich Greeting + Menu Buttons]
    
    B -->|/receipt or /receipt SV-XXXX| E{Order Number Specified?}
    E -->|Yes| F[Fetch Specific Order & Items]
    E -->|No| G[Fetch Latest Order for this Chat ID]
    F --> H[Format Official Thermal Receipt]
    G --> H
    H --> I[Send Receipt with Track & Status Buttons]
    
    B -->|/status or /track| J[Fetch Active Order State]
    J --> K[Send Real-Time Stepper Status]
    
    B -->|/help or /info| L[Send Operating Hours, Phone, Address]
    
    B -->|Callback: cmd_latest_receipt| G
    B -->|Callback: cmd_track_order| J
```

---

## 4. Security, Roles & Access Control Matrix

The platform enforces a 4-tier Role-Based Access Control (RBAC) model:

| Capability / Module | Customer (Guest & Telegram) | Staff (Counter & Kitchen) | Manager | Administrator |
|---|:---:|:---:|:---:|:---:|
| Browse Menu & Categories | ✅ | ✅ | ✅ | ✅ |
| Order Food & KHQR Checkout | ✅ | ✅ | ✅ | ✅ |
| View Personal Order & Receipts | ✅ | ✅ | ✅ | ✅ |
| Kitchen Display & Order Kanban | ❌ | ✅ | ✅ | ✅ |
| Update Order & Payment Status | ❌ | ✅ | ✅ | ✅ |
| Void / Cancel Orders | ❌ (Pending only) | ❌ | ✅ | ✅ |
| Menu Item CRUD & Pricing | ❌ | ❌ | ✅ | ✅ |
| Inventory Restock & Stock Logs | ❌ | ✅ (View/Adjust) | ✅ | ✅ |
| Sales Reports & CSV Financial Export | ❌ | ❌ | ✅ | ✅ |
| Telegram Bot & System Settings | ❌ | ❌ | ❌ | ✅ |
| Staff Management & Role Assignment | ❌ | ❌ | ❌ | ✅ |

---

## 5. Deployment & Infrastructure Architecture

```mermaid
flowchart LR
    subgraph ClientLayer["Edge / Client Layer"]
        Vite["Vite Production Build (dist/)\nPort 5173 / CDN"]
    end

    subgraph AppLayer["Application Layer"]
        FastAPI["Uvicorn ASGI Engine\nPython 3.14 FastAPI\nPort 8000"]
        BgPoller["Background Asyncio Tasks\n(Telegram Poller & Health Monitors)"]
    end

    subgraph DataLayer["Persistence & Cloud Layer"]
        SQLiteLocal["savory.db (WAL Mode)\nLocal SSD (Low Latency)"]
        SupabasePostgres["Supabase Cloud (PostgreSQL 15)\nSSL Encrypted Connection"]
    end

    Vite <-->|HTTP / REST JSON| FastAPI
    FastAPI <--> SQLiteLocal
    FastAPI <--> SupabasePostgres
    FastAPI <--> BgPoller
```
