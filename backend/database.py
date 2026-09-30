import os
import sqlite3
import uuid
from typing import Optional, List, Dict, Any
from functools import lru_cache
from config import get_settings
from supabase import create_client, Client

settings = get_settings()

# Initialize Supabase client
_supabase_client: Optional[Client] = None

def get_supabase() -> Client:
    global _supabase_client
    if _supabase_client is not None:
        return _supabase_client

    key = settings.supabase_service_role_key.strip()
    if not key or "your-service-role" in key:
        # Fall back to anon key
        key = settings.supabase_anon_key

    _supabase_client = create_client(settings.supabase_url, key)
    return _supabase_client


# ============================================================
# SQLite Local Storage (Used as standalone / zero-config option)
# ============================================================
SQLITE_PATH = os.path.join(os.path.dirname(__file__), "savory.db")

def get_sqlite_conn():
    conn = sqlite3.connect(SQLITE_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_sqlite_db():
    conn = get_sqlite_conn()
    c = conn.cursor()
    
    # Categories
    c.execute("""
    CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        sort_order INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )""")

    # Menu Items
    c.execute("""
    CREATE TABLE IF NOT EXISTS menu_items (
        id TEXT PRIMARY KEY,
        category_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        price REAL NOT NULL,
        image_url TEXT,
        is_available INTEGER DEFAULT 1,
        sort_order INTEGER DEFAULT 0,
        preparation_time INTEGER DEFAULT 20,
        is_featured INTEGER DEFAULT 0,
        is_popular INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (category_id) REFERENCES categories (id)
    )""")

    # Tables
    c.execute("""
    CREATE TABLE IF NOT EXISTS restaurant_tables (
        id TEXT PRIMARY KEY,
        table_number INTEGER UNIQUE NOT NULL,
        name TEXT,
        capacity INTEGER DEFAULT 4,
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )""")

    # Coupons
    c.execute("""
    CREATE TABLE IF NOT EXISTS coupons (
        id TEXT PRIMARY KEY,
        code TEXT UNIQUE NOT NULL,
        description TEXT DEFAULT '',
        discount_type TEXT DEFAULT 'percentage',
        discount_value REAL NOT NULL,
        min_order_amount REAL DEFAULT 0.0,
        max_usage INTEGER,
        current_usage INTEGER DEFAULT 0,
        start_date TEXT,
        end_date TEXT,
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )""")

    # Settings
    c.execute("""
    CREATE TABLE IF NOT EXISTS restaurant_settings (
        id TEXT PRIMARY KEY,
        name TEXT DEFAULT 'Savory',
        tagline TEXT DEFAULT 'Fresh food, made to order',
        phone TEXT DEFAULT '+1 (555) 234-5678',
        email TEXT DEFAULT 'hello@savoryrestaurant.com',
        address TEXT DEFAULT '123 Gourmet Blvd, Suite 100',
        opening_time TEXT DEFAULT '08:00',
        closing_time TEXT DEFAULT '22:00',
        delivery_fee REAL DEFAULT 2.50,
        min_delivery_order REAL DEFAULT 10.00,
        tax_rate REAL DEFAULT 0.00,
        currency TEXT DEFAULT 'USD',
        currency_symbol TEXT DEFAULT '$',
        default_prep_time INTEGER DEFAULT 20,
        is_order_acceptance_open INTEGER DEFAULT 1,
        is_pickup_enabled INTEGER DEFAULT 1,
        is_delivery_enabled INTEGER DEFAULT 1,
        telegram_bot_token TEXT DEFAULT '',
        telegram_chat_id TEXT DEFAULT '',
        telegram_bot_username TEXT DEFAULT '@savoryfood_bot',
        telegram_notifications_enabled INTEGER DEFAULT 1,
        notify_on_new_order INTEGER DEFAULT 1,
        notify_on_payment INTEGER DEFAULT 1,
        notify_on_status_change INTEGER DEFAULT 1,
        notify_on_low_stock INTEGER DEFAULT 1,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )""")

    # Orders
    c.execute("""
    CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        order_number TEXT UNIQUE NOT NULL,
        customer_id TEXT,
        customer_name TEXT NOT NULL,
        phone TEXT,
        address TEXT,
        order_type TEXT DEFAULT 'delivery',
        table_number INTEGER,
        status TEXT DEFAULT 'pending',
        subtotal REAL DEFAULT 0,
        delivery_fee REAL DEFAULT 0,
        tax REAL DEFAULT 0,
        discount REAL DEFAULT 0,
        total REAL NOT NULL,
        notes TEXT,
        payment_status TEXT DEFAULT 'unpaid',
        payment_method TEXT DEFAULT 'cash',
        customer_lat REAL,
        customer_lng REAL,
        coupon_code TEXT,
        qr_string TEXT,
        deeplink TEXT,
        md5 TEXT,
        telegram_user_id TEXT,
        telegram_chat_id TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )""")

    # Order Items
    c.execute("""
    CREATE TABLE IF NOT EXISTS order_items (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL,
        menu_item_id TEXT NOT NULL,
        menu_item_name TEXT,
        quantity INTEGER NOT NULL,
        unit_price REAL NOT NULL,
        notes TEXT,
        FOREIGN KEY (order_id) REFERENCES orders (id)
    )""")

    # Profiles / Staff
    c.execute("""
    CREATE TABLE IF NOT EXISTS profiles (
        id TEXT PRIMARY KEY,
        full_name TEXT NOT NULL,
        role TEXT DEFAULT 'customer',
        avatar_url TEXT,
        phone TEXT,
        address TEXT,
        email TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )""")

    # Payments
    c.execute("""
    CREATE TABLE IF NOT EXISTS payments (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL,
        payment_method TEXT DEFAULT 'cash',
        amount REAL NOT NULL,
        currency TEXT DEFAULT 'USD',
        status TEXT DEFAULT 'unpaid',
        transaction_reference TEXT,
        provider TEXT DEFAULT 'cash_counter',
        qr_data TEXT,
        paid_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )""")

    # Inventory Logs
    c.execute("""
    CREATE TABLE IF NOT EXISTS inventory_logs (
        id TEXT PRIMARY KEY,
        menu_item_id TEXT NOT NULL,
        change_type TEXT NOT NULL,
        quantity_changed INTEGER NOT NULL,
        quantity_after INTEGER NOT NULL,
        notes TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (menu_item_id) REFERENCES menu_items (id)
    )""")

    # Migrations: Add inventory columns to menu_items if not exists
    for col, col_def in [
        ("track_stock", "INTEGER DEFAULT 1"),
        ("stock_quantity", "INTEGER DEFAULT 50"),
        ("low_stock_threshold", "INTEGER DEFAULT 5"),
    ]:
        try:
            c.execute(f"ALTER TABLE menu_items ADD COLUMN {col} {col_def}")
        except Exception:
            pass

    # Migrations: Add telegram notification columns to restaurant_settings if not exists
    for col, col_def in [
        ("telegram_bot_token", "TEXT DEFAULT ''"),
        ("telegram_chat_id", "TEXT DEFAULT ''"),
        ("telegram_bot_username", "TEXT DEFAULT '@savoryfood_bot'"),
        ("telegram_notifications_enabled", "INTEGER DEFAULT 1"),
        ("notify_on_new_order", "INTEGER DEFAULT 1"),
        ("notify_on_payment", "INTEGER DEFAULT 1"),
        ("notify_on_status_change", "INTEGER DEFAULT 1"),
        ("notify_on_low_stock", "INTEGER DEFAULT 1"),
    ]:
        try:
            c.execute(f"ALTER TABLE restaurant_settings ADD COLUMN {col} {col_def}")
        except Exception:
            pass

    # Migrations: Add telegram columns to orders if not exists
    for col, col_def in [
        ("telegram_user_id", "TEXT"),
        ("telegram_chat_id", "TEXT"),
    ]:
        try:
            c.execute(f"ALTER TABLE orders ADD COLUMN {col} {col_def}")
        except Exception:
            pass

    # Seed default settings if empty
    c.execute("SELECT COUNT(*) FROM restaurant_settings")
    if c.fetchone()[0] == 0:
        c.execute("""
        INSERT INTO restaurant_settings (id, name, tagline, delivery_fee, min_delivery_order)
        VALUES ('default', 'Savory', 'Fresh food, made to order', 2.50, 10.00)
        """)

    # Seed default categories & items if empty
    c.execute("SELECT COUNT(*) FROM categories")
    if c.fetchone()[0] == 0:
        cat_burger_id = str(uuid.uuid4())
        cat_pizza_id = str(uuid.uuid4())
        cat_drink_id = str(uuid.uuid4())
        
        c.execute("INSERT INTO categories (id, name, description, sort_order) VALUES (?, ?, ?, ?)",
                  (cat_burger_id, 'Burgers', 'Gourmet handcrafted burgers', 1))
        c.execute("INSERT INTO categories (id, name, description, sort_order) VALUES (?, ?, ?, ?)",
                  (cat_pizza_id, 'Pizza', 'Stone-baked artisan pizzas', 2))
        c.execute("INSERT INTO categories (id, name, description, sort_order) VALUES (?, ?, ?, ?)",
                  (cat_drink_id, 'Beverages', 'Cold sodas and craft shakes', 3))

        c.execute("""
        INSERT INTO menu_items (id, category_id, name, description, price, is_available, preparation_time, is_featured, is_popular)
        VALUES (?, ?, ?, ?, ?, 1, 15, 1, 1)
        """, (str(uuid.uuid4()), cat_burger_id, 'Savory Classic Burger', 'Angus beef patty with aged cheddar and secret sauce', 8.99))
        
        c.execute("""
        INSERT INTO menu_items (id, category_id, name, description, price, is_available, preparation_time, is_featured, is_popular)
        VALUES (?, ?, ?, ?, ?, 1, 20, 1, 0)
        """, (str(uuid.uuid4()), cat_pizza_id, 'Truffle Mushroom Pizza', 'Wild mushrooms, mozzarella, truffle oil on thin crust', 14.50))

        c.execute("""
        INSERT INTO menu_items (id, category_id, name, description, price, is_available, preparation_time, is_featured, is_popular)
        VALUES (?, ?, ?, ?, ?, 1, 5, 0, 1)
        """, (str(uuid.uuid4()), cat_drink_id, 'Salted Caramel Milkshake', 'Creamy vanilla ice cream blended with artisan salted caramel', 4.50))

    # Seed default tables if empty
    c.execute("SELECT COUNT(*) FROM restaurant_tables")
    if c.fetchone()[0] == 0:
        for i in range(1, 6):
            c.execute("INSERT INTO restaurant_tables (id, table_number, name, capacity, is_active) VALUES (?, ?, ?, ?, 1)",
                      (str(uuid.uuid4()), i, f"Table {i}", 4 if i <= 3 else 6))

    # Seed default coupons if empty
    c.execute("SELECT COUNT(*) FROM coupons")
    if c.fetchone()[0] == 0:
        c.execute("""
        INSERT INTO coupons (id, code, description, discount_type, discount_value, min_order_amount, is_active)
        VALUES (?, 'SAVORY10', '10% off your order', 'percentage', 10, 5.0, 1)
        """, (str(uuid.uuid4()),))
        c.execute("""
        INSERT INTO coupons (id, code, description, discount_type, discount_value, min_order_amount, is_active)
        VALUES (?, 'WELCOME5', '$5 off orders over $20', 'fixed', 5, 20.0, 1)
        """, (str(uuid.uuid4()),))

    conn.commit()
    conn.close()

# Initialize tables on import
init_sqlite_db()
