import uuid
from datetime import datetime
from typing import List
from fastapi import APIRouter, HTTPException
from config import get_settings
from database import get_supabase, get_sqlite_conn
from schemas import (
    CouponCreate, CouponUpdate, CouponResponse,
    CouponValidateRequest, CouponValidateResponse
)

router = APIRouter(prefix="/coupons", tags=["Coupons"])
settings = get_settings()


@router.get("", response_model=List[CouponResponse])
def get_coupons():
    # Try Supabase
    try:
        supabase = get_supabase()
        res = supabase.from_("coupons").select("*").order("created_at", desc=True).execute()
        if res.data and len(res.data) > 0:
            return res.data
    except Exception as e:
        print(f"[Supabase Coupons Fetch] Fallback to SQLite: {e}")

    # SQLite
    conn = get_sqlite_conn()
    c = conn.cursor()
    c.execute("SELECT * FROM coupons ORDER BY created_at DESC")
    rows = [dict(r) for r in c.fetchall()]
    conn.close()

    for r in rows:
        r["is_active"] = bool(r.get("is_active", 1))
    return rows


@router.post("", response_model=CouponResponse)
def create_coupon(payload: CouponCreate):
    coupon_id = str(uuid.uuid4())
    code = payload.code.strip().upper()
    data = {
        "id": coupon_id,
        "code": code,
        "description": payload.description or "",
        "discount_type": payload.discount_type,
        "discount_value": float(payload.discount_value),
        "min_order_amount": float(payload.min_order_amount or 0.0),
        "max_usage": payload.max_usage,
        "current_usage": 0,
        "start_date": payload.start_date,
        "end_date": payload.end_date,
        "is_active": payload.is_active
    }

    # Try Supabase
    try:
        supabase = get_supabase()
        res = supabase.from_("coupons").insert(data).execute()
        if res.data:
            data = res.data[0]
    except Exception as e:
        print(f"[Supabase Coupon Insert Error] {e}")

    # SQLite
    conn = get_sqlite_conn()
    c = conn.cursor()
    try:
        c.execute("""
            INSERT INTO coupons (
                id, code, description, discount_type, discount_value,
                min_order_amount, max_usage, current_usage, start_date, end_date, is_active
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            data["id"], data["code"], data["description"], data["discount_type"],
            data["discount_value"], data["min_order_amount"], data["max_usage"],
            data["current_usage"], data["start_date"], data["end_date"], 1 if data["is_active"] else 0
        ))
        conn.commit()
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=400, detail=f"Coupon code '{code}' already exists")
    conn.close()

    return data


@router.put("/{coupon_id}", response_model=CouponResponse)
def update_coupon(coupon_id: str, payload: CouponUpdate):
    update_data = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields provided")

    if "code" in update_data:
        update_data["code"] = update_data["code"].strip().upper()

    # Try Supabase
    try:
        supabase = get_supabase()
        supabase.from_("coupons").update(update_data).eq("id", coupon_id).execute()
    except Exception as e:
        print(f"[Supabase Coupon Update Error] {e}")

    # SQLite
    conn = get_sqlite_conn()
    c = conn.cursor()
    sqlite_data = {}
    for k, v in update_data.items():
        if isinstance(v, bool):
            sqlite_data[k] = 1 if v else 0
        else:
            sqlite_data[k] = v

    set_clause = ", ".join([f"{k} = ?" for k in sqlite_data.keys()])
    values = list(sqlite_data.values()) + [coupon_id]
    c.execute(f"UPDATE coupons SET {set_clause} WHERE id = ?", values)
    conn.commit()

    c.execute("SELECT * FROM coupons WHERE id = ?", (coupon_id,))
    row = c.fetchone()
    conn.close()

    if not row:
        return {"id": coupon_id, **update_data}

    res_item = dict(row)
    res_item["is_active"] = bool(res_item.get("is_active", 1))
    return res_item


@router.delete("/{coupon_id}")
def delete_coupon(coupon_id: str):
    # Try Supabase
    try:
        supabase = get_supabase()
        supabase.from_("coupons").delete().eq("id", coupon_id).execute()
    except Exception as e:
        print(f"[Supabase Coupon Delete Error] {e}")

    # SQLite
    conn = get_sqlite_conn()
    c = conn.cursor()
    c.execute("DELETE FROM coupons WHERE id = ?", (coupon_id,))
    conn.commit()
    conn.close()

    return {"success": True, "message": "Coupon deleted"}


@router.post("/validate", response_model=CouponValidateResponse)
def validate_coupon(payload: CouponValidateRequest):
    code = payload.code.strip().upper()
    subtotal = payload.subtotal

    # Search in SQLite
    conn = get_sqlite_conn()
    c = conn.cursor()
    c.execute("SELECT * FROM coupons WHERE UPPER(code) = ? AND is_active = 1", (code,))
    row = c.fetchone()
    conn.close()

    if not row:
        return CouponValidateResponse(valid=False, error="Invalid or expired coupon code")

    coupon_dict = dict(row)
    coupon_dict["is_active"] = bool(coupon_dict.get("is_active", 1))
    coupon = CouponResponse(**coupon_dict)

    if subtotal < (coupon.min_order_amount or 0):
        return CouponValidateResponse(
            valid=False,
            coupon=coupon,
            error=f"Minimum order amount of ${coupon.min_order_amount:.2f} required"
        )

    if coupon.max_usage and coupon.current_usage >= coupon.max_usage:
        return CouponValidateResponse(valid=False, coupon=coupon, error="Coupon usage limit reached")

    if coupon.discount_type == "percentage":
        discount = round((subtotal * coupon.discount_value) / 100, 2)
    else:
        discount = float(coupon.discount_value)

    discount = min(discount, subtotal)

    return CouponValidateResponse(valid=True, coupon=coupon, discount=discount)
