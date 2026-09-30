"""
Background Telegram Bot Service for @SavoryFoodAEU_bot
Polls for incoming messages, commands (/start, /order, /receipt, /status, /help),
auto-binds chat ID, and sends interactive menus and digital receipts.
"""

import asyncio
import httpx
from datetime import datetime
from typing import Optional, Dict, Any
from database import get_sqlite_conn
from services.telegram import get_telegram_config, send_telegram_message, send_order_receipt


async def handle_start_command(chat_id: int, user: Dict[str, Any], bot_token: str):
    """Handle /start or /order command with welcome & interactive buttons."""
    first_name = user.get("first_name", "Valued Guest")
    username = user.get("username", "")

    # Auto-save chat_id if database restaurant_settings doesn't have a valid numeric one
    try:
        conn = get_sqlite_conn()
        c = conn.cursor()
        c.execute("SELECT telegram_chat_id FROM restaurant_settings LIMIT 1")
        row = c.fetchone()
        current_cid = row[0] if row else ""
        if not current_cid or not current_cid.replace("-", "").isdigit():
            c.execute("UPDATE restaurant_settings SET telegram_chat_id = ?", (str(chat_id),))
            conn.commit()
            print(f"[Telegram Bot] Auto-registered Chat ID: {chat_id} from @{username or first_name}")
        conn.close()
    except Exception as e:
        print(f"[Telegram Bot DB Error] {e}")

    welcome_msg = f"""👋 <b>Hello, {first_name}! Welcome to Savory!</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━
🍔 <b>Fresh, Handcrafted Food Made to Order</b>

We serve artisan burgers, stone-baked pizzas, delicious pastas, and refreshing craft beverages.

✨ <b>What you can do here:</b>
• <b>Order Food</b> directly inside Telegram (Mini App)
• <b>Pay Instantly</b> with Bakong NBC KHQR or Cash
• <b>Official Receipts</b> delivered directly to this chat
• <b>Real-Time Tracking</b> of your kitchen order progress

Tap a button below to get started! ⬇️"""

    keyboard = {
        "inline_keyboard": [
            [
                {"text": "🧾 View My Latest Receipt", "callback_data": "cmd_latest_receipt"},
                {"text": "🛵 Track Order Status", "callback_data": "cmd_track_order"}
            ],
            [
                {"text": "ℹ️ Restaurant Info & Contact", "callback_data": "cmd_help"}
            ]
        ]
    }

    await send_telegram_message(
        text=welcome_msg,
        bot_token=bot_token,
        chat_id=str(chat_id),
        reply_markup=keyboard,
        force=True
    )


async def handle_receipt_command(chat_id: int, text: str, bot_token: str):
    """Handle /receipt [order_number] or look up latest order."""
    parts = text.strip().split()
    target_num = parts[1] if len(parts) > 1 else None

    conn = get_sqlite_conn()
    c = conn.cursor()

    if target_num:
        clean_num = target_num.replace("#", "").strip()
        c.execute("SELECT * FROM orders WHERE order_number LIKE ? OR id LIKE ? LIMIT 1", (f"%{clean_num}%", f"%{clean_num}%"))
    else:
        # Search by telegram_chat_id or get most recent order
        c.execute("SELECT * FROM orders WHERE telegram_chat_id = ? ORDER BY created_at DESC LIMIT 1", (str(chat_id),))
        row = c.fetchone()
        if not row:
            c.execute("SELECT * FROM orders ORDER BY created_at DESC LIMIT 1")

    row = c.fetchone()
    if not row:
        conn.close()
        await send_telegram_message(
            text="⚠️ <b>No orders found.</b>\nPlace an order through the Savory Mini App to receive your receipt!",
            bot_token=bot_token,
            chat_id=str(chat_id),
            force=True
        )
        return

    order_data = dict(row)
    c.execute("SELECT * FROM order_items WHERE order_id = ?", (order_data["id"],))
    items = [dict(i) for i in c.fetchall()]
    conn.close()

    await send_order_receipt(order_data, items, target_chat_id=str(chat_id))


async def handle_status_command(chat_id: int, bot_token: str):
    """Handle /status command to check most recent order status."""
    conn = get_sqlite_conn()
    c = conn.cursor()
    c.execute("SELECT * FROM orders WHERE telegram_chat_id = ? ORDER BY created_at DESC LIMIT 1", (str(chat_id),))
    row = c.fetchone()
    if not row:
        c.execute("SELECT * FROM orders ORDER BY created_at DESC LIMIT 1")
        row = c.fetchone()

    conn.close()

    if not row:
        await send_telegram_message(
            text="⚠️ <b>No active orders found.</b>\nTap /order to order your favorite meal!",
            bot_token=bot_token,
            chat_id=str(chat_id),
            force=True
        )
        return

    order = dict(row)
    status = (order.get("status") or "pending").upper()
    pay_status = (order.get("payment_status") or "unpaid").upper()
    order_num = order.get("order_number", "SV-ORDER")

    status_labels = {
        "PENDING": "⏳ Pending Acceptance",
        "CONFIRMED": "✅ Accepted by Kitchen",
        "PREPARING": "🍳 Cooking in Kitchen",
        "READY": "🛎️ Ready for Pickup / Dispatch",
        "OUT_FOR_DELIVERY": "🛵 Rider on the Way",
        "DELIVERED": "🎉 Delivered",
        "COMPLETED": "🏁 Completed",
        "CANCELLED": "❌ Cancelled"
    }

    display_status = status_labels.get(status, status)
    pay_label = "✅ PAID" if pay_status == "PAID" else "⏳ UNPAID / PENDING"

    msg = f"""📢 <b>ORDER STATUS TRACKER</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━
<b>Order Number:</b> <code>#{order_num}</code>
<b>Current Status:</b> <b>{display_status}</b>
<b>Payment:</b> <b>{pay_label}</b> (${float(order.get('total') or 0):.2f} USD)
<b>Type:</b> {(order.get('order_type') or 'delivery').upper()}

<i>Open the live tracking link below for real-time progress:</i>"""

    keyboard = {
        "inline_keyboard": [
            [
                {"text": "🔄 Refresh Status", "callback_data": "cmd_track_order"},
                {"text": "🧾 View Receipt", "callback_data": "cmd_latest_receipt"}
            ]
        ]
    }

    await send_telegram_message(
        text=msg,
        bot_token=bot_token,
        chat_id=str(chat_id),
        reply_markup=keyboard,
        force=True
    )


async def handle_help_command(chat_id: int, bot_token: str):
    """Handle /help command with restaurant details & contact."""
    msg = """ℹ️ <b>SAVORY RESTAURANT — INFORMATION & SUPPORT</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━
📍 <b>Address:</b> 123 Gourmet Blvd, Suite 100, Phnom Penh, Cambodia
⏰ <b>Opening Hours:</b> Mon–Sun: 08:00 AM – 10:00 PM
📞 <b>Telephone:</b> +855 (0) 97 39 18 206

🤖 <b>Available Bot Commands:</b>
• <code>/order</code> — Start ordering your meal
• <code>/receipt</code> — View your latest official receipt
• <code>/status</code> — Track your active order
• <code>/help</code> — Restaurant info & contact

<i>Questions? Give us a call or visit our counter!</i>"""

    keyboard = {
        "inline_keyboard": [
            [
                {"text": "🧾 My Latest Receipt", "callback_data": "cmd_latest_receipt"},
                {"text": "🛵 Order Status", "callback_data": "cmd_track_order"}
            ]
        ]
    }

    await send_telegram_message(
        text=msg,
        bot_token=bot_token,
        chat_id=str(chat_id),
        reply_markup=keyboard,
        force=True
    )


async def process_telegram_updates():
    """Background polling loop for Telegram Bot updates."""
    last_update_id = 0
    print("[Telegram Bot Service] Starting background polling for @SavoryFoodAEU_bot...")

    while True:
        try:
            cfg = get_telegram_config()
            token = cfg.get("bot_token")
            if not token or "your-" in token.lower():
                await asyncio.sleep(10)
                continue

            url = f"https://api.telegram.org/bot{token}/getUpdates"
            params = {"offset": last_update_id + 1, "timeout": 15}

            async with httpx.AsyncClient(timeout=20.0) as client:
                res = await client.get(url, params=params)
                if res.status_code != 200:
                    await asyncio.sleep(5)
                    continue

                data = res.json()
                updates = data.get("result", [])

                for update in updates:
                    update_id = update.get("update_id", 0)
                    if update_id > last_update_id:
                        last_update_id = update_id

                    # Handle Callback Queries (Button taps)
                    if "callback_query" in update:
                        cb = update["callback_query"]
                        cb_data = cb.get("data", "")
                        from_user = cb.get("from", {})
                        chat = cb.get("message", {}).get("chat", {})
                        chat_id = chat.get("id") or from_user.get("id")

                        # Answer callback query to stop loading spinner
                        try:
                            await client.post(
                                f"https://api.telegram.org/bot{token}/answerCallbackQuery",
                                json={"callback_query_id": cb.get("id")}
                            )
                        except Exception:
                            pass

                        if chat_id:
                            if cb_data == "cmd_latest_receipt":
                                await handle_receipt_command(chat_id, "/receipt", token)
                            elif cb_data == "cmd_track_order":
                                await handle_status_command(chat_id, token)
                            elif cb_data == "cmd_help":
                                await handle_help_command(chat_id, token)
                        continue

                    # Handle Text Messages
                    message = update.get("message")
                    if not message:
                        continue

                    chat = message.get("chat", {})
                    chat_id = chat.get("id")
                    user = message.get("from", {})
                    text = (message.get("text") or "").strip()

                    if not chat_id:
                        continue

                    cmd = text.split()[0].lower() if text else ""

                    if cmd in ["/start", "/order", "/menu"]:
                        await handle_start_command(chat_id, user, token)
                    elif cmd.startswith("/receipt"):
                        await handle_receipt_command(chat_id, text, token)
                    elif cmd in ["/status", "/track"]:
                        await handle_status_command(chat_id, token)
                    elif cmd in ["/help", "/info", "/contact"]:
                        await handle_help_command(chat_id, token)
                    else:
                        # Fallback friendly response
                        await handle_start_command(chat_id, user, token)

        except asyncio.CancelledError:
            print("[Telegram Bot Service] Stopped.")
            break
        except Exception as e:
            # Prevent poll loop crash
            await asyncio.sleep(5)
