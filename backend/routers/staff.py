from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query
from config import get_settings
from database import get_supabase, get_sqlite_conn
from schemas import ProfileResponse, ProfileUpdate

router = APIRouter(prefix="/staff", tags=["Staff & Profiles"])
settings = get_settings()


@router.get("", response_model=List[ProfileResponse])
def get_staff_members(role: Optional[str] = None):
    # Try Supabase
    try:
        supabase = get_supabase()
        q = supabase.from_("profiles").select("*")
        if role:
            q = q.eq("role", role)
        res = q.execute()
        if res.data and len(res.data) > 0:
            return res.data
    except Exception as e:
        print(f"[Supabase Staff Fetch] Fallback to SQLite: {e}")

    # SQLite
    conn = get_sqlite_conn()
    c = conn.cursor()
    query = "SELECT * FROM profiles WHERE 1=1"
    params = []
    if role:
        query += " AND role = ?"
        params.append(role)
    c.execute(query, params)
    rows = [dict(r) for r in c.fetchall()]
    conn.close()
    return rows


@router.patch("/{user_id}/role")
def update_user_role(user_id: str, new_role: str = Query(...)):
    if new_role not in ["admin", "manager", "staff", "customer"]:
        raise HTTPException(status_code=400, detail="Invalid role")

    # Try Supabase
    try:
        supabase = get_supabase()
        supabase.from_("profiles").update({"role": new_role}).eq("id", user_id).execute()
    except Exception as e:
        print(f"[Supabase Role Update Error] {e}")

    # SQLite
    conn = get_sqlite_conn()
    c = conn.cursor()
    c.execute("UPDATE profiles SET role = ? WHERE id = ?", (new_role, user_id))
    conn.commit()
    conn.close()

    return {"success": True, "id": user_id, "role": new_role}
