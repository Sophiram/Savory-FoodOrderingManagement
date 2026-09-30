import uuid
from typing import List
from fastapi import APIRouter, HTTPException
from config import get_settings
from database import get_supabase, get_sqlite_conn
from schemas import TableCreate, TableUpdate, TableResponse

router = APIRouter(prefix="/tables", tags=["Tables"])
settings = get_settings()


@router.get("", response_model=List[TableResponse])
def get_tables():
    # Try Supabase first
    try:
        supabase = get_supabase()
        res = supabase.from_("restaurant_tables").select("*").order("table_number").execute()
        if res.data and len(res.data) > 0:
            return res.data
    except Exception as e:
        print(f"[Supabase Tables Fetch] Fallback to SQLite: {e}")

    # Fallback SQLite
    conn = get_sqlite_conn()
    c = conn.cursor()
    c.execute("SELECT * FROM restaurant_tables ORDER BY table_number ASC")
    rows = [dict(r) for r in c.fetchall()]
    conn.close()

    for r in rows:
        r["is_active"] = bool(r.get("is_active", 1))
    return rows


@router.post("", response_model=TableResponse)
def create_table(payload: TableCreate):
    table_id = str(uuid.uuid4())
    data = {
        "id": table_id,
        "table_number": payload.table_number,
        "name": payload.name or f"Table {payload.table_number}",
        "capacity": payload.capacity or 4,
        "is_active": payload.is_active
    }

    # Try Supabase
    try:
        supabase = get_supabase()
        res = supabase.from_("restaurant_tables").insert(data).execute()
        if res.data:
            data = res.data[0]
    except Exception as e:
        print(f"[Supabase Table Insert Error] {e}")

    # Save to SQLite
    conn = get_sqlite_conn()
    c = conn.cursor()
    try:
        c.execute("""
            INSERT INTO restaurant_tables (id, table_number, name, capacity, is_active)
            VALUES (?, ?, ?, ?, ?)
        """, (data["id"], data["table_number"], data["name"], data["capacity"], 1 if data["is_active"] else 0))
        conn.commit()
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=400, detail=f"Table number {payload.table_number} already exists")
    conn.close()

    return data


@router.put("/{table_id}", response_model=TableResponse)
def update_table(table_id: str, payload: TableUpdate):
    update_data = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields provided")

    # Try Supabase
    try:
        supabase = get_supabase()
        supabase.from_("restaurant_tables").update(update_data).eq("id", table_id).execute()
    except Exception as e:
        print(f"[Supabase Table Update Error] {e}")

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
    values = list(sqlite_data.values()) + [table_id]
    c.execute(f"UPDATE restaurant_tables SET {set_clause} WHERE id = ?", values)
    conn.commit()

    c.execute("SELECT * FROM restaurant_tables WHERE id = ?", (table_id,))
    row = c.fetchone()
    conn.close()

    if not row:
        return {"id": table_id, **update_data}

    res_item = dict(row)
    res_item["is_active"] = bool(res_item.get("is_active", 1))
    return res_item


@router.delete("/{table_id}")
def delete_table(table_id: str):
    # Try Supabase
    try:
        supabase = get_supabase()
        supabase.from_("restaurant_tables").delete().eq("id", table_id).execute()
    except Exception as e:
        print(f"[Supabase Table Delete Error] {e}")

    # SQLite
    conn = get_sqlite_conn()
    c = conn.cursor()
    c.execute("DELETE FROM restaurant_tables WHERE id = ?", (table_id,))
    conn.commit()
    conn.close()

    return {"success": True, "message": "Table deleted"}
