import uuid
import asyncio
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from database import get_sqlite_conn, get_supabase
from services.telegram import notify_low_stock

router = APIRouter(prefix="/inventory", tags=["Inventory Management"])


class RestockRequest(BaseModel):
    menu_item_id: str
    quantity: int
    notes: Optional[str] = "Restock"


class InventoryUpdateRequest(BaseModel):
    track_stock: Optional[bool] = None
    stock_quantity: Optional[int] = None
    low_stock_threshold: Optional[int] = None
    is_available: Optional[bool] = None


@router.get("/summary")
def get_inventory_summary():
    conn = get_sqlite_conn()
    c = conn.cursor()
    c.execute("""
        SELECT 
            COUNT(*) as total_items,
            SUM(CASE WHEN track_stock = 1 THEN 1 ELSE 0 END) as tracked_items,
            SUM(CASE WHEN track_stock = 1 AND stock_quantity <= 0 THEN 1 ELSE 0 END) as out_of_stock,
            SUM(CASE WHEN track_stock = 1 AND stock_quantity > 0 AND stock_quantity <= low_stock_threshold THEN 1 ELSE 0 END) as low_stock,
            SUM(CASE WHEN track_stock = 1 AND stock_quantity > low_stock_threshold THEN 1 ELSE 0 END) as in_stock
        FROM menu_items
    """)
    row = c.fetchone()
    conn.close()

    return {
        "total_items": row["total_items"] or 0,
        "tracked_items": row["tracked_items"] or 0,
        "out_of_stock": row["out_of_stock"] or 0,
        "low_stock": row["low_stock"] or 0,
        "in_stock": row["in_stock"] or 0
    }


@router.get("")
def get_inventory_items(
    status: Optional[str] = None,  # "all", "in_stock", "low_stock", "out_of_stock"
    search: Optional[str] = None
):
    conn = get_sqlite_conn()
    c = conn.cursor()

    query = """
        SELECT 
            m.id, m.name, m.description, m.price, m.image_url,
            m.is_available, m.track_stock, m.stock_quantity, m.low_stock_threshold,
            c.name as category_name
        FROM menu_items m
        LEFT JOIN categories c ON m.category_id = c.id
        WHERE 1=1
    """
    params = []

    if search:
        query += " AND (m.name LIKE ? OR c.name LIKE ?)"
        params.extend([f"%{search}%", f"%{search}%"])

    query += " ORDER BY c.sort_order, m.sort_order, m.name"
    c.execute(query, params)
    rows = c.fetchall()
    conn.close()

    items = []
    for r in rows:
        item = dict(r)
        track = bool(item.get("track_stock", 1))
        qty = item.get("stock_quantity", 50)
        threshold = item.get("low_stock_threshold", 5)

        if not track:
            stock_status = "untracked"
        elif qty <= 0:
            stock_status = "out_of_stock"
        elif qty <= threshold:
            stock_status = "low_stock"
        else:
            stock_status = "in_stock"

        item["stock_status"] = stock_status
        item["track_stock"] = track
        item["stock_quantity"] = qty
        item["low_stock_threshold"] = threshold
        item["is_available"] = bool(item.get("is_available", 1))

        if status and status != "all" and stock_status != status:
            continue

        items.append(item)

    return items


@router.post("/restock")
def restock_item(payload: RestockRequest):
    if payload.quantity <= 0:
        raise HTTPException(status_code=400, detail="Restock quantity must be greater than 0")

    conn = get_sqlite_conn()
    c = conn.cursor()
    c.execute("SELECT id, name, stock_quantity, is_available FROM menu_items WHERE id = ?", (payload.menu_item_id,))
    item = c.fetchone()
    if not item:
        conn.close()
        raise HTTPException(status_code=404, detail="Menu item not found")

    old_qty = item["stock_quantity"] or 0
    new_qty = old_qty + payload.quantity

    # Update item
    c.execute("""
        UPDATE menu_items 
        SET stock_quantity = ?, is_available = 1
        WHERE id = ?
    """, (new_qty, payload.menu_item_id))

    # Log change
    log_id = str(uuid.uuid4())
    c.execute("""
        INSERT INTO inventory_logs (id, menu_item_id, change_type, quantity_changed, quantity_after, notes)
        VALUES (?, ?, 'restock', ?, ?, ?)
    """, (log_id, payload.menu_item_id, payload.quantity, new_qty, payload.notes))

    conn.commit()
    conn.close()

    # Sync to Supabase
    try:
        supabase = get_supabase()
        supabase.from_("menu_items").update({
            "stock_quantity": new_qty,
            "is_available": True
        }).eq("id", payload.menu_item_id).execute()
    except Exception as e:
        print(f"[Supabase Restock Error] {e}")

    return {
        "success": True,
        "menu_item_id": payload.menu_item_id,
        "quantity_added": payload.quantity,
        "new_stock": new_qty,
        "message": f"Successfully restocked {payload.quantity} units"
    }


@router.put("/update/{item_id}")
def update_item_inventory(item_id: str, payload: InventoryUpdateRequest):
    conn = get_sqlite_conn()
    c = conn.cursor()
    c.execute("SELECT id, name, stock_quantity, track_stock, low_stock_threshold, is_available FROM menu_items WHERE id = ?", (item_id,))
    item = c.fetchone()
    if not item:
        conn.close()
        raise HTTPException(status_code=404, detail="Menu item not found")

    old_qty = item["stock_quantity"] or 0
    new_track = payload.track_stock if payload.track_stock is not None else bool(item["track_stock"])
    new_qty = payload.stock_quantity if payload.stock_quantity is not None else old_qty
    new_threshold = payload.low_stock_threshold if payload.low_stock_threshold is not None else item["low_stock_threshold"]
    new_available = payload.is_available if payload.is_available is not None else (new_qty > 0 if new_track else bool(item["is_available"]))

    c.execute("""
        UPDATE menu_items
        SET track_stock = ?, stock_quantity = ?, low_stock_threshold = ?, is_available = ?
        WHERE id = ?
    """, (int(new_track), new_qty, new_threshold, int(new_available), item_id))

    if new_qty != old_qty:
        c.execute("""
            INSERT INTO inventory_logs (id, menu_item_id, change_type, quantity_changed, quantity_after, notes)
            VALUES (?, ?, 'adjustment', ?, ?, 'Manual inventory adjustment')
        """, (str(uuid.uuid4()), item_id, new_qty - old_qty, new_qty))

    conn.commit()
    conn.close()

    # Sync to Supabase
    try:
        supabase = get_supabase()
        supabase.from_("menu_items").update({
            "track_stock": new_track,
            "stock_quantity": new_qty,
            "low_stock_threshold": new_threshold,
            "is_available": new_available
        }).eq("id", item_id).execute()
    except Exception as e:
        print(f"[Supabase Inventory Update Error] {e}")

    # Trigger low stock alert if tracked and at or below threshold
    if new_track and new_qty <= new_threshold:
        try:
            asyncio.create_task(notify_low_stock(item["name"], new_qty, new_threshold))
        except Exception as e:
            print(f"[Telegram Low Stock Error] {e}")

    return {
        "success": True,
        "item_id": item_id,
        "stock_quantity": new_qty,
        "track_stock": new_track,
        "low_stock_threshold": new_threshold,
        "is_available": new_available
    }


@router.get("/logs")
def get_inventory_logs(limit: int = 50):
    conn = get_sqlite_conn()
    c = conn.cursor()
    c.execute("""
        SELECT 
            l.id, l.change_type, l.quantity_changed, l.quantity_after, l.notes, l.created_at,
            m.name as menu_item_name, m.image_url
        FROM inventory_logs l
        JOIN menu_items m ON l.menu_item_id = m.id
        ORDER BY l.created_at DESC
        LIMIT ?
    """, (limit,))
    rows = c.fetchall()
    conn.close()
    return [dict(r) for r in rows]
