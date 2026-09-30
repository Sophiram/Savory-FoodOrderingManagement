import uuid
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query
from config import get_settings
from database import get_supabase, get_sqlite_conn
from schemas import (
    CategoryCreate, CategoryUpdate, CategoryResponse,
    MenuItemCreate, MenuItemUpdate, MenuItemResponse
)

router = APIRouter(prefix="/menu", tags=["Menu"])
settings = get_settings()

def is_supabase_error(e: Exception) -> bool:
    err_str = str(e).lower()
    return "row-level security" in err_str or "42501" in err_str or "violates" in err_str


# ============================================================
# CATEGORIES ENDPOINTS
# ============================================================

@router.get("/categories", response_model=List[CategoryResponse])
def get_categories():
    conn = get_sqlite_conn()
    c = conn.cursor()
    c.execute("SELECT COUNT(*) FROM categories")
    if c.fetchone()[0] == 0:
        try:
            supabase = get_supabase()
            res = supabase.from_("categories").select("*").order("sort_order").execute()
            if res.data:
                for cat in res.data:
                    c.execute("""
                        INSERT OR IGNORE INTO categories (id, name, description, sort_order)
                        VALUES (?, ?, ?, ?)
                    """, (cat["id"], cat["name"], cat.get("description", ""), cat.get("sort_order", 0)))
                conn.commit()
        except Exception as e:
            print(f"[Supabase Categories Initial Sync Error] {e}")

    c.execute("SELECT * FROM categories ORDER BY sort_order")
    rows = [dict(r) for r in c.fetchall()]
    conn.close()
    return rows


@router.post("/categories", response_model=CategoryResponse)
def create_category(payload: CategoryCreate):
    cat_id = str(uuid.uuid4())
    data = {
        "id": cat_id,
        "name": payload.name.strip(),
        "description": payload.description or "",
        "sort_order": payload.sort_order or 0
    }

    # Try Supabase first
    saved = False
    try:
        supabase = get_supabase()
        res = supabase.from_("categories").insert(data).execute()
        if res.data:
            saved = True
            data = res.data[0]
    except Exception as e:
        print(f"[Supabase Category Insert Error] {e}")

    # Save to SQLite (always maintains local copy)
    conn = get_sqlite_conn()
    c = conn.cursor()
    c.execute("""
        INSERT INTO categories (id, name, description, sort_order)
        VALUES (?, ?, ?, ?)
    """, (data["id"], data["name"], data["description"], data["sort_order"]))
    conn.commit()
    conn.close()

    return data


@router.put("/categories/{category_id}", response_model=CategoryResponse)
def update_category(category_id: str, payload: CategoryUpdate):
    update_data = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields provided for update")

    # Try Supabase
    try:
        supabase = get_supabase()
        res = supabase.from_("categories").update(update_data).eq("id", category_id).execute()
    except Exception as e:
        print(f"[Supabase Category Update Error] {e}")

    # Update in SQLite
    conn = get_sqlite_conn()
    c = conn.cursor()
    set_clause = ", ".join([f"{k} = ?" for k in update_data.keys()])
    values = list(update_data.values()) + [category_id]
    c.execute(f"UPDATE categories SET {set_clause} WHERE id = ?", values)
    conn.commit()
    
    c.execute("SELECT * FROM categories WHERE id = ?", (category_id,))
    row = c.fetchone()
    conn.close()

    if not row:
        return {"id": category_id, **update_data}
    return dict(row)


@router.delete("/categories/{category_id}")
def delete_category(category_id: str):
    # Try Supabase
    try:
        supabase = get_supabase()
        supabase.from_("categories").delete().eq("id", category_id).execute()
    except Exception as e:
        print(f"[Supabase Category Delete Error] {e}")

    # Delete in SQLite
    conn = get_sqlite_conn()
    c = conn.cursor()
    c.execute("DELETE FROM menu_items WHERE category_id = ?", (category_id,))
    c.execute("DELETE FROM categories WHERE id = ?", (category_id,))
    conn.commit()
    conn.close()

    return {"success": True, "message": "Category deleted"}


# ============================================================
# MENU ITEMS ENDPOINTS
# ============================================================

@router.get("/items", response_model=List[MenuItemResponse])
def get_menu_items(
    category_id: Optional[str] = None,
    available_only: bool = False,
    search: Optional[str] = None
):
    conn = get_sqlite_conn()
    c = conn.cursor()
    c.execute("SELECT COUNT(*) FROM menu_items")
    count = c.fetchone()[0]

    # If SQLite has no items, sync from Supabase
    if count == 0:
        try:
            supabase = get_supabase()
            cats_res = supabase.from_("categories").select("id, name").execute()
            for cat in (cats_res.data or []):
                c.execute("""
                    INSERT OR IGNORE INTO categories (id, name) VALUES (?, ?)
                """, (cat["id"], cat["name"]))

            res = supabase.from_("menu_items").select("*").order("sort_order").execute()
            if res.data:
                for item in res.data:
                    c.execute("""
                        INSERT OR IGNORE INTO menu_items (id, category_id, name, description, price, image_url, is_available, sort_order)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        item["id"], item["category_id"], item["name"], item.get("description", ""),
                        item["price"], item.get("image_url"), 1 if item.get("is_available") else 0, item.get("sort_order", 0)
                    ))
                conn.commit()
        except Exception as e:
            print(f"[Supabase Menu Items Initial Sync Error] {e}")

    query = """
        SELECT m.*, c.name as category_name
        FROM menu_items m
        LEFT JOIN categories c ON m.category_id = c.id
        WHERE 1=1
    """
    params = []
    if category_id:
        query += " AND m.category_id = ?"
        params.append(category_id)
    if available_only:
        query += " AND m.is_available = 1"
    if search:
        query += " AND (LOWER(m.name) LIKE ? OR LOWER(m.description) LIKE ?)"
        params.extend([f"%{search.lower()}%", f"%{search.lower()}%"])
    query += " ORDER BY m.sort_order"

    c.execute(query, params)
    rows = [dict(r) for r in c.fetchall()]
    conn.close()

    # Convert integer booleans
    for r in rows:
        r["is_available"] = bool(r.get("is_available", 1))
        r["is_featured"] = bool(r.get("is_featured", 0))
        r["is_popular"] = bool(r.get("is_popular", 0))

    return rows


@router.post("/items", response_model=MenuItemResponse)
def create_menu_item(payload: MenuItemCreate):
    item_id = str(uuid.uuid4())
    data = {
        "id": item_id,
        "category_id": payload.category_id,
        "name": payload.name.strip(),
        "description": payload.description or "",
        "price": float(payload.price),
        "image_url": payload.image_url,
        "is_available": payload.is_available,
        "sort_order": payload.sort_order or 0,
        "preparation_time": payload.preparation_time or 20,
        "is_featured": payload.is_featured or False,
        "is_popular": payload.is_popular or False
    }

    # Try Supabase
    try:
        supabase = get_supabase()
        res = supabase.from_("menu_items").insert(data).execute()
        if res.data:
            data = res.data[0]
    except Exception as e:
        print(f"[Supabase Menu Item Insert Error] {e}")
        # Retry with base fields if schema mismatch
        if "is_featured" in str(e) or "PGRST204" in str(e):
            try:
                base_data = {k: v for k, v in data.items() if k not in ["is_featured", "is_popular", "preparation_time"]}
                supabase.from_("menu_items").insert(base_data).execute()
            except Exception as retry_err:
                print(f"[Supabase Menu Item Retry Insert Error] {retry_err}")

    # Save to SQLite
    conn = get_sqlite_conn()
    c = conn.cursor()
    c.execute("""
        INSERT INTO menu_items (
            id, category_id, name, description, price, image_url,
            is_available, sort_order, preparation_time, is_featured, is_popular
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        data["id"], data["category_id"], data["name"], data["description"], data["price"],
        data["image_url"], 1 if data["is_available"] else 0, data["sort_order"],
        data["preparation_time"], 1 if data["is_featured"] else 0, 1 if data["is_popular"] else 0
    ))
    conn.commit()

    # Get category name
    c.execute("SELECT name FROM categories WHERE id = ?", (data["category_id"],))
    cat_row = c.fetchone()
    data["category_name"] = cat_row["name"] if cat_row else ""
    conn.close()

    return data


@router.put("/items/{item_id}", response_model=MenuItemResponse)
def update_menu_item(item_id: str, payload: MenuItemUpdate):
    update_data = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No update data provided")

    # Try Supabase
    try:
        supabase = get_supabase()
        supabase.from_("menu_items").update(update_data).eq("id", item_id).execute()
    except Exception as e:
        err_str = str(e)
        print(f"[Supabase Menu Item Update Error] {e}")
        # If Supabase lacks is_featured/is_popular/preparation_time columns, update base fields
        if "is_featured" in err_str or "is_popular" in err_str or "PGRST204" in err_str:
            try:
                base_data = {k: v for k, v in update_data.items() if k not in ["is_featured", "is_popular", "preparation_time"]}
                if base_data:
                    supabase.from_("menu_items").update(base_data).eq("id", item_id).execute()
            except Exception as retry_err:
                print(f"[Supabase Menu Item Base Update Error] {retry_err}")

    # Update in SQLite
    conn = get_sqlite_conn()
    c = conn.cursor()

    # Ensure item exists in SQLite
    c.execute("SELECT id FROM menu_items WHERE id = ?", (item_id,))
    if not c.fetchone():
        c.execute("""
            INSERT OR IGNORE INTO menu_items (id, category_id, name, description, price, image_url, is_available)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            item_id,
            update_data.get("category_id", ""),
            update_data.get("name", "Item"),
            update_data.get("description", ""),
            update_data.get("price", 0.0),
            update_data.get("image_url"),
            1 if update_data.get("is_available", True) else 0
        ))

    sqlite_data = {}
    for k, v in update_data.items():
        if isinstance(v, bool):
            sqlite_data[k] = 1 if v else 0
        else:
            sqlite_data[k] = v

    set_clause = ", ".join([f"{k} = ?" for k in sqlite_data.keys()])
    values = list(sqlite_data.values()) + [item_id]
    c.execute(f"UPDATE menu_items SET {set_clause} WHERE id = ?", values)
    conn.commit()

    c.execute("""
        SELECT m.*, c.name as category_name
        FROM menu_items m
        LEFT JOIN categories c ON m.category_id = c.id
        WHERE m.id = ?
    """, (item_id,))
    row = c.fetchone()
    conn.close()

    if not row:
        return {"id": item_id, **update_data}

    res_item = dict(row)
    res_item["is_available"] = bool(res_item.get("is_available", 1))
    res_item["is_featured"] = bool(res_item.get("is_featured", 0))
    res_item["is_popular"] = bool(res_item.get("is_popular", 0))
    return res_item


@router.patch("/items/{item_id}/availability")
def toggle_item_availability(item_id: str, is_available: bool = Query(...)):
    # Try Supabase
    try:
        supabase = get_supabase()
        supabase.from_("menu_items").update({"is_available": is_available}).eq("id", item_id).execute()
    except Exception as e:
        print(f"[Supabase Toggle Availability Error] {e}")

    # SQLite
    conn = get_sqlite_conn()
    c = conn.cursor()
    c.execute("UPDATE menu_items SET is_available = ? WHERE id = ?", (1 if is_available else 0, item_id))
    conn.commit()
    conn.close()

    return {"success": True, "id": item_id, "is_available": is_available}


@router.delete("/items/{item_id}")
def delete_menu_item(item_id: str):
    # Try Supabase
    try:
        supabase = get_supabase()
        supabase.from_("menu_items").delete().eq("id", item_id).execute()
    except Exception as e:
        print(f"[Supabase Menu Item Delete Error] {e}")

    # SQLite
    conn = get_sqlite_conn()
    c = conn.cursor()
    c.execute("DELETE FROM menu_items WHERE id = ?", (item_id,))
    conn.commit()
    conn.close()

    return {"success": True, "message": "Item deleted"}
