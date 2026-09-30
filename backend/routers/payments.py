import uuid
import asyncio
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, HTTPException
from config import get_settings
from database import get_supabase, get_sqlite_conn
from schemas import KHQRCreateRequest, KHQRCreateResponse, KHQRCheckRequest, KHQRCheckResponse
from services.khqr import (
    build_khqr_string,
    compute_khqr_md5,
    fetch_bakong_deeplink,
    check_bakong_payment_status,
)
from services.telegram import notify_payment_confirmed

router = APIRouter(prefix="/payments", tags=["Payments & KHQR"])
settings = get_settings()


@router.post("/create-khqr", response_model=KHQRCreateResponse)
async def create_khqr_payment(payload: KHQRCreateRequest):
    order_id = payload.order_id
    amount = payload.amount
    currency = payload.currency

    # Fetch order to get order number if available
    order_ref = order_id[:12]
    conn = get_sqlite_conn()
    c = conn.cursor()
    c.execute("SELECT order_number FROM orders WHERE id = ?", (order_id,))
    row = c.fetchone()
    if row and row["order_number"]:
        order_ref = row["order_number"]
    conn.close()

    qr_string = build_khqr_string(
        amount=amount,
        order_reference=order_ref,
        account=settings.khqr_account,
        merchant_name=settings.khqr_merchant_name,
        merchant_city="Phnom Penh",
        store_label=settings.bakong_store_label,
        terminal_label="POS001",
        currency=currency,
        usd_to_khr_rate=settings.khqr_usd_to_khr_rate,
    )
    md5_hash = compute_khqr_md5(qr_string)
    deeplink, b_md5 = await fetch_bakong_deeplink(qr_string)
    if b_md5:
        md5_hash = b_md5

    # Update order with qr_string, md5, deeplink in SQLite
    conn = get_sqlite_conn()
    c = conn.cursor()
    c.execute("""
        UPDATE orders
        SET qr_string = ?, md5 = ?, deeplink = ?, payment_status = 'pending', updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    """, (qr_string, md5_hash, deeplink, order_id))

    # Update or insert payments table
    c.execute("SELECT id FROM payments WHERE order_id = ?", (order_id,))
    existing_p = c.fetchone()
    if existing_p:
        c.execute("""
            UPDATE payments
            SET qr_data = ?, transaction_reference = ?, amount = ?, updated_at = CURRENT_TIMESTAMP
            WHERE order_id = ?
        """, (qr_string, md5_hash, amount, order_id))
    else:
        c.execute("""
            INSERT INTO payments (id, order_id, payment_method, amount, currency, status, transaction_reference, provider, qr_data)
            VALUES (?, ?, 'khqr', ?, ?, 'pending', ?, 'bakong_khqr', ?)
        """, (str(uuid.uuid4()), order_id, amount, currency, md5_hash, qr_string))

    conn.commit()
    conn.close()

    # Try updating Supabase
    try:
        supabase = get_supabase()
        supabase.from_("orders").update({
            "qr_string": qr_string,
            "md5": md5_hash,
            "deeplink": deeplink,
            "payment_status": "pending"
        }).eq("id", order_id).execute()

        supabase.from_("payments").upsert({
            "order_id": order_id,
            "payment_method": "khqr",
            "amount": amount,
            "currency": currency,
            "status": "pending",
            "qr_data": qr_string,
            "provider_transaction_id": md5_hash,
            "provider": "bakong_khqr"
        }, on_conflict="order_id").execute()
    except Exception as e:
        print(f"[Supabase KHQR Update Error] {e}")

    return KHQRCreateResponse(
        qr_string=qr_string,
        md5=md5_hash,
        deeplink=deeplink,
        amount=amount,
        currency=currency
    )


@router.post("/check-khqr", response_model=KHQRCheckResponse)
async def check_khqr_payment(payload: KHQRCheckRequest):
    order_id = payload.order_id
    md5 = payload.md5

    # 1. Check local order state first
    conn = get_sqlite_conn()
    c = conn.cursor()
    c.execute("SELECT status, payment_status, md5, order_number, total, customer_name, payment_method FROM orders WHERE id = ?", (order_id,))
    row = c.fetchone()
    conn.close()

    if not row:
        return KHQRCheckResponse(paid=False, order_status="pending", payment_status="unpaid", message="Order not found")

    if row["payment_status"] == "paid":
        return KHQRCheckResponse(paid=True, order_status=row["status"], payment_status="paid", message="Payment confirmed")

    target_md5 = md5 or row["md5"]

    # 2. Check Bakong Open API if MD5 is available
    if target_md5:
        is_paid = await check_bakong_payment_status(target_md5)
        if is_paid:
            now_iso = datetime.now().isoformat()
            # Mark paid in SQLite
            conn = get_sqlite_conn()
            c = conn.cursor()
            c.execute("""
                UPDATE orders
                SET payment_status = 'paid', status = 'confirmed', updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            """, (order_id,))
            c.execute("""
                UPDATE payments
                SET status = 'paid', paid_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                WHERE order_id = ?
            """, (order_id,))
            conn.commit()
            conn.close()

            # Mark paid in Supabase
            try:
                supabase = get_supabase()
                supabase.from_("orders").update({
                    "payment_status": "paid",
                    "status": "confirmed",
                    "updated_at": now_iso
                }).eq("id", order_id).execute()

                supabase.from_("payments").update({
                    "status": "paid",
                    "paid_at": now_iso
                }).eq("order_id", order_id).execute()
            except Exception as e:
                print(f"[Supabase KHQR Paid Update Error] {e}")

            # Send Telegram payment notification
            try:
                asyncio.create_task(notify_payment_confirmed(
                    order_number=row["order_number"] or order_id[:8],
                    amount=float(row["total"] or 0),
                    method="KHQR (Bakong)",
                    customer_name=row["customer_name"]
                ))
            except Exception as e:
                print(f"[Telegram Payment Notification Error] {e}")

            return KHQRCheckResponse(
                paid=True,
                order_status="confirmed",
                payment_status="paid",
                message="Payment confirmed via Bakong Open API"
            )

    return KHQRCheckResponse(
        paid=False,
        order_status=row["status"],
        payment_status=row["payment_status"],
        message="Awaiting payment"
    )


@router.post("/confirm/{order_id}", response_model=KHQRCheckResponse)
@router.post("/simulate-success/{order_id}", response_model=KHQRCheckResponse)
def confirm_or_simulate_payment(order_id: str):
    """
    Manually or programmatically confirm payment for an order.
    Sets payment_status='paid' and status='confirmed' in both SQLite and Supabase.
    """
    now_iso = datetime.now().isoformat()

    conn = get_sqlite_conn()
    c = conn.cursor()
    c.execute("SELECT id, status, payment_status, order_number, total, customer_name, payment_method FROM orders WHERE id = ?", (order_id,))
    row = c.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Order not found")

    c.execute("""
        UPDATE orders
        SET payment_status = 'paid', status = 'confirmed', updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    """, (order_id,))
    c.execute("""
        UPDATE payments
        SET status = 'paid', paid_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE order_id = ?
    """, (order_id,))
    conn.commit()
    conn.close()

    # Sync to Supabase
    try:
        supabase = get_supabase()
        supabase.from_("orders").update({
            "payment_status": "paid",
            "status": "confirmed",
            "updated_at": now_iso
        }).eq("id", order_id).execute()

        supabase.from_("payments").update({
            "status": "paid",
            "paid_at": now_iso
        }).eq("order_id", order_id).execute()
    except Exception as e:
        print(f"[Supabase Payment Confirm Error] {e}")

    # Dispatch Telegram notification for confirmed payment
    try:
        asyncio.create_task(notify_payment_confirmed(
            order_number=row["order_number"] or order_id[:8],
            amount=float(row["total"] or 0),
            method=row["payment_method"] or "KHQR",
            customer_name=row["customer_name"]
        ))
    except Exception as e:
        print(f"[Telegram Payment Notification Error] {e}")

    return KHQRCheckResponse(
        paid=True,
        order_status="confirmed",
        payment_status="paid",
        message="Payment successfully confirmed"
    )
