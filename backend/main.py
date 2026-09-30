import os
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from config import get_settings
from database import init_sqlite_db, get_sqlite_conn, get_supabase
from routers import menu, orders, tables, coupons, settings as rest_settings, staff, payments, inventory, reports

settings = get_settings()

app = FastAPI(
    title="Savory Food Ordering System API",
    description="FastAPI Backend for Savory Food Ordering System. Handles menu CRUD, order lifecycle, tables, coupons, settings, KHQR payments, inventory, and reports.",
    version="1.0.0"
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins in development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers under /api
app.include_router(menu.router, prefix="/api")
app.include_router(orders.router, prefix="/api")
app.include_router(tables.router, prefix="/api")
app.include_router(coupons.router, prefix="/api")
app.include_router(rest_settings.router, prefix="/api")
app.include_router(staff.router, prefix="/api")
app.include_router(payments.router, prefix="/api")
app.include_router(inventory.router, prefix="/api")
app.include_router(reports.router, prefix="/api")


@app.on_event("startup")
def startup_event():
    init_sqlite_db()
    print("=" * 60)
    print(" Savory FastAPI Backend running!")
    print(f" Supabase Service Role Key: {'CONFIGURED (RLS Bypassed)' if settings.has_valid_service_role_key else 'NOT CONFIGURED (Using SQLite + Anon Supabase)'}")
    print(" API Documentation: http://localhost:8000/docs")
    print("=" * 60)
    
    # Launch Telegram Bot poller in background
    try:
        import asyncio
        from services.telegram_bot_service import process_telegram_updates
        asyncio.create_task(process_telegram_updates())
    except Exception as e:
        print(f"[Telegram Bot Startup Error] {e}")


@app.get("/")
def root():
    return {
        "status": "online",
        "app": "Savory Food Ordering System API",
        "docs": "/docs",
        "endpoints": {
            "menu_items": "/api/menu/items",
            "categories": "/api/menu/categories",
            "orders": "/api/orders",
            "tables": "/api/tables",
            "coupons": "/api/coupons",
            "settings": "/api/settings",
            "staff": "/api/staff",
            "payments": "/api/payments"
        }
    }


@app.get("/health")
def health_check():
    conn = get_sqlite_conn()
    c = conn.cursor()
    c.execute("SELECT COUNT(*) FROM menu_items")
    menu_count = c.fetchone()[0]
    c.execute("SELECT COUNT(*) FROM categories")
    cat_count = c.fetchone()[0]
    conn.close()

    return {
        "status": "healthy",
        "database": "sqlite_ready",
        "supabase_service_role_configured": settings.has_valid_service_role_key,
        "items_count": menu_count,
        "categories_count": cat_count
    }


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
