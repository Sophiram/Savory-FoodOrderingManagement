from datetime import datetime
from fastapi import APIRouter, HTTPException
from config import get_settings
from database import get_supabase, get_sqlite_conn
from schemas import SettingsUpdate, SettingsResponse, TelegramTestRequest, TelegramTestResponse
from services.telegram import test_telegram_connection

router = APIRouter(prefix="/settings", tags=["Settings"])
settings = get_settings()


def _format_settings_dict(data: dict) -> dict:
    """Format boolean and string fields for restaurant settings response."""
    res = dict(data)
    res["is_order_acceptance_open"] = bool(res.get("is_order_acceptance_open", 1))
    res["is_pickup_enabled"] = bool(res.get("is_pickup_enabled", 1))
    res["is_delivery_enabled"] = bool(res.get("is_delivery_enabled", 1))
    res["telegram_notifications_enabled"] = bool(res.get("telegram_notifications_enabled", 1))
    res["notify_on_new_order"] = bool(res.get("notify_on_new_order", 1))
    res["notify_on_payment"] = bool(res.get("notify_on_payment", 1))
    res["notify_on_status_change"] = bool(res.get("notify_on_status_change", 1))
    res["notify_on_low_stock"] = bool(res.get("notify_on_low_stock", 1))

    # Fallback bot token & chat ID to settings/.env if blank in DB
    if not res.get("telegram_bot_token") and settings.notification_bot_token and "your-" not in settings.notification_bot_token:
        res["telegram_bot_token"] = settings.notification_bot_token
    if not res.get("telegram_chat_id") and settings.notification_chat_id and "your-" not in settings.notification_chat_id:
        res["telegram_chat_id"] = settings.notification_chat_id
    if not res.get("telegram_bot_username"):
        res["telegram_bot_username"] = "@savoryfood_bot"

    return res


@router.get("", response_model=SettingsResponse)
def get_restaurant_settings():
    # Try Supabase
    try:
        supabase = get_supabase()
        res = supabase.from_("restaurant_settings").select("*").limit(1).maybe_single().execute()
        if res.data:
            return _format_settings_dict(res.data)
    except Exception as e:
        print(f"[Supabase Settings Fetch] Fallback to SQLite: {e}")

    # Fallback SQLite
    conn = get_sqlite_conn()
    c = conn.cursor()
    c.execute("SELECT * FROM restaurant_settings LIMIT 1")
    row = c.fetchone()
    conn.close()

    if not row:
        default_res = {
            "id": "default",
            "telegram_bot_username": "@savoryfood_bot",
            "telegram_bot_token": settings.notification_bot_token or "",
            "telegram_chat_id": settings.notification_chat_id or ""
        }
        return SettingsResponse(**default_res)
    
    return _format_settings_dict(dict(row))


@router.put("", response_model=SettingsResponse)
def update_restaurant_settings(payload: SettingsUpdate):
    update_data = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields provided for update")

    update_data["updated_at"] = datetime.now().isoformat()

    # Try Supabase
    try:
        supabase = get_supabase()
        supabase.from_("restaurant_settings").update(update_data).neq("id", "").execute()
    except Exception as e:
        print(f"[Supabase Settings Update Error] {e}")

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
    values = list(sqlite_data.values())
    c.execute(f"UPDATE restaurant_settings SET {set_clause}", values)
    conn.commit()

    c.execute("SELECT * FROM restaurant_settings LIMIT 1")
    row = c.fetchone()
    conn.close()

    if not row:
        return SettingsResponse(id="default", **update_data)

    return _format_settings_dict(dict(row))


@router.post("/test-telegram", response_model=TelegramTestResponse)
async def test_telegram_settings(payload: TelegramTestRequest):
    """
    Test telegram bot notification using given token/chat_id or saved settings.
    """
    result = await test_telegram_connection(payload.bot_token, payload.chat_id)
    return TelegramTestResponse(
        success=result["success"],
        message=result["message"],
        bot_username=result.get("bot_username", "@savoryfood_bot")
    )
