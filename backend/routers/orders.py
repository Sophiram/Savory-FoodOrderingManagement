import uuid
import asyncio
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query
from config import get_settings
from database import get_supabase, get_sqlite_conn
from services.telegram import (
    notify_new_order,
    notify_order_status_update,
    notify_low_stock,
    notify_payment_confirmed,
    send_order_receipt
)
from schemas import (
    OrderCreate, OrderResponse, OrderStatusUpdate, PaymentStatusUpdate,
    OrderItemResponse
)

router = APIRouter(prefix="/orders", tags=["Orders"])
settings = get_settings()


@router.get("", response_model=List[OrderResponse])
def get_orders(
    status: Optional[str] = None,
    customer_id: Optional[str] = None,
    limit: int = 50
):
    # Try Supabase first
    try:
        supabase = get_supabase()
        q = supabase.from_("orders").select("*, order_items(*)").order("created_at", desc=True).limit(limit)
        if status:
            q = q.eq("status", status)
        if customer_id:
            q = q.eq("customer_id", customer_id)
        res = q.execute()
        if res.data and len(res.data) > 0:
            formatted = []
            for o in res.data:
                items = o.pop("order_items", []) or []
                o["items"] = items
                formatted.append(o)
            return formatted
    except Exception as e:
        print(f"[Supabase Orders Fetch] Fallback to SQLite: {e}")

    # SQLite
    conn = get_sqlite_conn()
    c = conn.cursor()
    query = "SELECT * FROM orders WHERE 1=1"
    params = []
    if status:
        query += " AND status = ?"
        params.append(status)
    if customer_id:
        query += " AND customer_id = ?"
        params.append(customer_id)
    query += " ORDER BY created_at DESC LIMIT ?"
    params.append(limit)

    c.execute(query, params)
    order_rows = [dict(r) for r in c.fetchall()]

    for o in order_rows:
        c.execute("SELECT * FROM order_items WHERE order_id = ?", (o["id"],))
        o["items"] = [dict(i) for i in c.fetchall()]
    conn.close()

    return order_rows


@router.get("/{order_id}", response_model=OrderResponse)
def get_order(order_id: str):
    # Try Supabase
    try:
        supabase = get_supabase()
        res = supabase.from_("orders").select("*, order_items(*)").eq("id", order_id).single().execute()
        if res.data:
            o = res.data
            items = o.pop("order_items", []) or []
            o["items"] = items
            return o
    except Exception as e:
        print(f"[Supabase Single Order Fetch] Fallback SQLite: {e}")

    # SQLite
    conn = get_sqlite_conn()
    c = conn.cursor()
    c.execute("SELECT * FROM orders WHERE id = ?", (order_id,))
    row = c.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Order not found")
    
    order = dict(row)
    c.execute("SELECT * FROM order_items WHERE order_id = ?", (order_id,))
    order["items"] = [dict(i) for i in c.fetchall()]
    conn.close()

    return order


@router.post("", response_model=OrderResponse)
async def create_order(payload: OrderCreate):
    order_id = str(uuid.uuid4())
    date_str = datetime.now().strftime("%Y%m%d")
    short_suffix = str(uuid.uuid4())[:4].upper()
    order_number = f"SV-{date_str}-{short_suffix}"

    subtotal = sum(item.unit_price * item.quantity for item in payload.items)
    delivery_fee = 2.50 if payload.order_type == "delivery" else 0.0
    discount = 0.0

    # Coupon validation if code provided
    if payload.coupon_code:
        conn = get_sqlite_conn()
        c = conn.cursor()
        c.execute("SELECT * FROM coupons WHERE UPPER(code) = ? AND is_active = 1", (payload.coupon_code.strip().upper(),))
        coupon_row = c.fetchone()
        conn.close()
        if coupon_row:
            c_dict = dict(coupon_row)
            if c_dict["discount_type"] == "percentage":
                discount = round((subtotal * c_dict["discount_value"]) / 100, 2)
            else:
                discount = float(c_dict["discount_value"])
            discount = min(discount, subtotal)

    total = max(0.0, round(subtotal + delivery_fee - discount, 2))
    payment_status = "unpaid" if payload.payment_method == "cash" else "pending"

    # Dynamic NBC KHQR EMVCo compliant generation
    qr_string = None
    deeplink = None
    md5 = None
    if payload.payment_method == "khqr":
        qr_string = build_khqr_string(
            amount=total,
            order_reference=order_number,
            account=settings.khqr_account,
            merchant_name=settings.khqr_merchant_name,
            merchant_city="Phnom Penh",
            store_label=settings.bakong_store_label,
            terminal_label="POS001",
            currency="USD",
            usd_to_khr_rate=settings.khqr_usd_to_khr_rate,
        )
        md5 = compute_khqr_md5(qr_string)
        dl, b_md5 = await fetch_bakong_deeplink(qr_string)
        deeplink = dl
        if b_md5:
            md5 = b_md5

    order_data = {
        "id": order_id,
        "order_number": order_number,
        "customer_id": payload.customer_id,
        "customer_name": payload.customer_name.strip(),
        "phone": payload.phone.strip(),
        "address": payload.address.strip() if payload.address else None,
        "order_type": payload.order_type,
        "table_number": payload.table_number,
        "status": "pending",
        "subtotal": subtotal,
        "delivery_fee": delivery_fee,
        "tax": 0.0,
        "discount": discount,
        "total": total,
        "notes": payload.notes,
        "payment_status": payment_status,
        "payment_method": payload.payment_method,
        "customer_lat": payload.customer_lat,
        "customer_lng": payload.customer_lng,
        "coupon_code": payload.coupon_code,
        "qr_string": qr_string,
        "deeplink": deeplink,
        "md5": md5,
        "telegram_user_id": payload.telegram_user_id,
        "telegram_chat_id": payload.telegram_chat_id
    }

    # Items data
    item_rows = []
    for item in payload.items:
        item_rows.append({
            "id": str(uuid.uuid4()),
            "order_id": order_id,
            "menu_item_id": item.menu_item_id,
            "menu_item_name": item.name or "",
            "quantity": item.quantity,
            "unit_price": item.unit_price,
            "notes": item.notes
        })

    # Try Supabase
    try:
        supabase = get_supabase()
        supabase_order_data = dict(order_data)
        try:
            supabase.from_("orders").insert(supabase_order_data).execute()
        except Exception as sb_ins_err:
            if "orders_order_type_check" in str(sb_ins_err) or "order_type" in str(sb_ins_err):
                print(f"[Supabase Order Insert Warning] orders_order_type_check violation, retrying without order_type: {sb_ins_err}")
                supabase_order_data.pop("order_type", None)
                supabase.from_("orders").insert(supabase_order_data).execute()
            else:
                raise sb_ins_err
        
        sb_items = [{
            "order_id": order_id,
            "menu_item_id": i["menu_item_id"],
            "quantity": i["quantity"],
            "unit_price": i["unit_price"],
            "notes": i["notes"]
        } for i in item_rows]
        supabase.from_("order_items").insert(sb_items).execute()

        # Insert initial payment record in Supabase
        supabase.from_("payments").insert({
            "id": str(uuid.uuid4()),
            "order_id": order_id,
            "payment_method": payload.payment_method,
            "amount": total,
            "currency": "USD",
            "status": payment_status,
            "qr_data": qr_string,
            "provider_transaction_id": md5,
            "provider": "bakong_khqr" if payload.payment_method == "khqr" else "cash_counter"
        }).execute()
    except Exception as e:
        print(f"[Supabase Order Insert Error] {e}")

    # SQLite
    conn = get_sqlite_conn()
    c = conn.cursor()
    c.execute("""
        INSERT INTO orders (
            id, order_number, customer_id, customer_name, phone, address,
            order_type, table_number, status, subtotal, delivery_fee, tax,
            discount, total, notes, payment_status, payment_method,
            customer_lat, customer_lng, coupon_code, qr_string, deeplink, md5,
            telegram_user_id, telegram_chat_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        order_data["id"], order_data["order_number"], order_data["customer_id"],
        order_data["customer_name"], order_data["phone"], order_data["address"],
        order_data["order_type"], order_data["table_number"], order_data["status"],
        order_data["subtotal"], order_data["delivery_fee"], order_data["tax"],
        order_data["discount"], order_data["total"], order_data["notes"],
        order_data["payment_status"], order_data["payment_method"],
        order_data["customer_lat"], order_data["customer_lng"],
        order_data["coupon_code"], order_data["qr_string"], order_data["deeplink"],
        order_data["md5"], order_data["telegram_user_id"], order_data["telegram_chat_id"]
    ))

    for item in item_rows:
        c.execute("""
            INSERT INTO order_items (id, order_id, menu_item_id, menu_item_name, quantity, unit_price, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (item["id"], item["order_id"], item["menu_item_id"], item["menu_item_name"], item["quantity"], item["unit_price"], item["notes"]))

        # Auto-deduct inventory if stock tracking is enabled
        try:
            c.execute("SELECT stock_quantity, track_stock FROM menu_items WHERE id = ?", (item["menu_item_id"],))
            m_row = c.fetchone()
            if m_row and m_row["track_stock"]:
                curr_stock = m_row["stock_quantity"] if m_row["stock_quantity"] is not None else 50
                new_stock = max(0, curr_stock - item["quantity"])
                is_avail = 1 if new_stock > 0 else 0
                c.execute("UPDATE menu_items SET stock_quantity = ?, is_available = ? WHERE id = ?", (new_stock, is_avail, item["menu_item_id"]))
                c.execute("""
                    INSERT INTO inventory_logs (id, menu_item_id, change_type, quantity_changed, quantity_after, notes)
                    VALUES (?, ?, 'sale', ?, ?, ?)
                """, (str(uuid.uuid4()), item["menu_item_id"], -item["quantity"], new_stock, f"Order {order_number}"))
                if new_stock <= (m_row["low_stock_threshold"] if m_row["low_stock_threshold"] is not None else 5):
                    asyncio.create_task(notify_low_stock(item["menu_item_name"], new_stock, m_row["low_stock_threshold"] or 5))
        except Exception as e:
            print(f"[Inventory Deduction Error] {e}")

    # Insert payment record in SQLite
    payment_id = str(uuid.uuid4())
    c.execute("""
        INSERT INTO payments (id, order_id, payment_method, amount, currency, status, transaction_reference, provider, qr_data)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        payment_id,
        order_id,
        payload.payment_method,
        total,
        "USD",
        payment_status,
        md5,
        "bakong_khqr" if payload.payment_method == "khqr" else "cash_counter",
        qr_string
    ))

    conn.commit()
    conn.close()

    order_data["items"] = item_rows

    # Dispatch Telegram notification for new order
    try:
        asyncio.create_task(notify_new_order(order_data, item_rows))
        if payload.telegram_chat_id:
            asyncio.create_task(send_order_receipt(order_data, item_rows, target_chat_id=payload.telegram_chat_id))
    except Exception as e:
        print(f"[Telegram Notification Error] {e}")

    return order_data


@router.patch("/{order_id}/status")
async def update_order_status(order_id: str, payload: OrderStatusUpdate):
    # Try Supabase
    try:
        supabase = get_supabase()
        supabase.from_("orders").update({"status": payload.status, "updated_at": datetime.now().isoformat()}).eq("id", order_id).execute()
    except Exception as e:
        print(f"[Supabase Order Status Update Error] {e}")

    # SQLite
    conn = get_sqlite_conn()
    c = conn.cursor()
    c.execute("UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (payload.status, order_id))
    c.execute("SELECT order_number, customer_name FROM orders WHERE id = ?", (order_id,))
    row = c.fetchone()
    conn.commit()
    conn.close()

    # Telegram notification
    if row:
        try:
            asyncio.create_task(notify_order_status_update(
                order_number=row["order_number"],
                new_status=payload.status,
                customer_name=row["customer_name"],
                notes=payload.notes
            ))
        except Exception:
            pass

    return {"success": True, "order_id": order_id, "status": payload.status}


@router.patch("/{order_id}/payment-status")
def update_payment_status(order_id: str, payload: PaymentStatusUpdate):
    # If payment_status is paid, automatically mark status as confirmed
    order_status = "confirmed" if payload.payment_status == "paid" else None

    # Try Supabase
    try:
        supabase = get_supabase()
        updates = {"payment_status": payload.payment_status, "updated_at": datetime.now().isoformat()}
        if order_status:
            updates["status"] = order_status
        supabase.from_("orders").update(updates).eq("id", order_id).execute()
    except Exception as e:
        print(f"[Supabase Payment Status Update Error] {e}")

    # SQLite
    conn = get_sqlite_conn()
    c = conn.cursor()
    if order_status:
        c.execute("UPDATE orders SET payment_status = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (payload.payment_status, order_status, order_id))
    else:
        c.execute("UPDATE orders SET payment_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (payload.payment_status, order_id))
    
    # Query order details for payment notification if paid
    c.execute("SELECT order_number, total, customer_name, payment_method FROM orders WHERE id = ?", (order_id,))
    p_row = c.fetchone()
    conn.commit()
    conn.close()

    # Trigger telegram payment confirmed notification
    if payload.payment_status == "paid" and p_row:
        try:
            asyncio.create_task(notify_payment_confirmed(
                order_number=p_row["order_number"] or order_id[:8],
                amount=float(p_row["total"] or 0),
                method=p_row["payment_method"] or "Cash",
                customer_name=p_row["customer_name"]
            ))
        except Exception as e:
            print(f"[Telegram Payment Notification Error] {e}")

    return {"success": True, "order_id": order_id, "payment_status": payload.payment_status}


@router.delete("/{order_id}")
def delete_order(order_id: str):
    # Try Supabase
    try:
        supabase = get_supabase()
        supabase.from_("orders").delete().eq("id", order_id).execute()
    except Exception as e:
        print(f"[Supabase Order Delete Error] {e}")

    # SQLite
    conn = get_sqlite_conn()
    c = conn.cursor()
    c.execute("DELETE FROM order_items WHERE order_id = ?", (order_id,))
    c.execute("DELETE FROM orders WHERE id = ?", (order_id,))
    conn.commit()
    conn.close()

    return {"success": True, "message": "Order deleted"}


@router.post("/{order_id}/send-receipt-telegram")
async def send_order_receipt_to_telegram(order_id: str, chat_id: Optional[str] = None):
    """
    Manually or programmatically trigger sending an official order receipt
    to Telegram (customer's chat or restaurant notification channel).
    """
    conn = get_sqlite_conn()
    c = conn.cursor()
    c.execute("SELECT * FROM orders WHERE id = ?", (order_id,))
    row = c.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Order not found")

    order_data = dict(row)
    c.execute("SELECT * FROM order_items WHERE order_id = ?", (order_id,))
    items = [dict(i) for i in c.fetchall()]
    conn.close()

    result = await send_order_receipt(order_data, items, target_chat_id=chat_id)
    return result

