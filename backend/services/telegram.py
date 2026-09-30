import httpx
from datetime import datetime
from typing import Optional, List, Dict, Any
from config import get_settings

settings = get_settings()


def get_telegram_config() -> Dict[str, Any]:
    """
    Retrieve Telegram credentials and notification preferences from the DB 
    (restaurant_settings), falling back to .env / Settings.
    """
    db_token = None
    db_chat_id = None
    db_bot_user = "@savoryfood_bot"
    enabled = True
    on_new_order = True
    on_payment = True
    on_status_change = True
    on_low_stock = True

    try:
        from database import get_sqlite_conn
        conn = get_sqlite_conn()
        c = conn.cursor()
        c.execute("""
            SELECT telegram_bot_token, telegram_chat_id, telegram_bot_username,
                   telegram_notifications_enabled, notify_on_new_order,
                   notify_on_payment, notify_on_status_change, notify_on_low_stock
            FROM restaurant_settings LIMIT 1
        """)
        row = c.fetchone()
        conn.close()

        if row:
            r = dict(row)
            t = (r.get("telegram_bot_token") or "").strip()
            cid = (r.get("telegram_chat_id") or "").strip()
            u = (r.get("telegram_bot_username") or "").strip()
            if t:
                db_token = t
            if cid:
                db_chat_id = cid
            if u:
                db_bot_user = u

            if r.get("telegram_notifications_enabled") is not None:
                enabled = bool(r["telegram_notifications_enabled"])
            if r.get("notify_on_new_order") is not None:
                on_new_order = bool(r["notify_on_new_order"])
            if r.get("notify_on_payment") is not None:
                on_payment = bool(r["notify_on_payment"])
            if r.get("notify_on_status_change") is not None:
                on_status_change = bool(r["notify_on_status_change"])
            if r.get("notify_on_low_stock") is not None:
                on_low_stock = bool(r["notify_on_low_stock"])
    except Exception as e:
        print(f"[Telegram Config Read Error] {e}")

    token = db_token or (settings.notification_bot_token or "").strip()
    chat_id = db_chat_id or (settings.notification_chat_id or "").strip()

    return {
        "bot_token": token,
        "chat_id": chat_id,
        "bot_username": db_bot_user,
        "enabled": enabled,
        "notify_on_new_order": on_new_order,
        "notify_on_payment": on_payment,
        "notify_on_status_change": on_status_change,
        "notify_on_low_stock": on_low_stock,
    }


async def send_telegram_message(
    text: str,
    bot_token: Optional[str] = None,
    chat_id: Optional[str] = None,
    reply_markup: Optional[Dict[str, Any]] = None,
    force: bool = False
) -> bool:
    """Send an HTML-formatted message via Telegram Bot API."""
    cfg = get_telegram_config()
    token = (bot_token or cfg.get("bot_token") or "").strip()
    cid = (chat_id or cfg.get("chat_id") or "").strip()

    if not force and not cfg.get("enabled", True):
        print("[Telegram Notice] Notifications are currently disabled in settings.")
        return False

    if not token or not cid or "your-" in token.lower() or "your-" in cid.lower():
        print(f"[Telegram Notice] Missing or placeholder credentials (token: {bool(token)}, chat_id: {bool(cid)}). Message skipped.")
        return False

    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = {
        "chat_id": cid,
        "text": text,
        "parse_mode": "HTML",
        "disable_web_page_preview": True
    }
    if reply_markup:
        payload["reply_markup"] = reply_markup

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.post(url, json=payload)
            if res.status_code == 200:
                return True
            else:
                print(f"[Telegram Error] HTTP {res.status_code}: {res.text}")
                return False
    except Exception as e:
        print(f"[Telegram Exception] {e}")
        return False


async def notify_new_order(order_data: Dict, items: List[Dict]):
    """Send an immediate notification when a customer places an order."""
    cfg = get_telegram_config()
    if not cfg.get("enabled", True) or not cfg.get("notify_on_new_order", True):
        return

    order_num = order_data.get("order_number", "SV-NEW")
    cust_name = order_data.get("customer_name", "Valued Guest")
    phone = order_data.get("phone", "N/A")
    raw_type = (order_data.get("order_type") or "delivery").lower()
    table_num = order_data.get("table_number")
    subtotal = float(order_data.get("subtotal") or 0)
    delivery_fee = float(order_data.get("delivery_fee") or 0)
    discount = float(order_data.get("discount") or 0)
    total = float(order_data.get("total") or 0)
    pay_method = (order_data.get("payment_method") or "cash").upper()
    pay_status = (order_data.get("payment_status") or "pending").upper()
    address = order_data.get("address")
    notes = order_data.get("notes")

    if table_num or raw_type == "dine_in":
        type_display = f"🍽️ <b>DINE-IN</b> (Table #{table_num or 'N/A'})"
    elif raw_type == "pickup":
        type_display = "🛍️ <b>TAKEAWAY / PICKUP</b>"
    else:
        type_display = "🛵 <b>DELIVERY</b>"

    # Format items list
    item_lines = []
    for it in items:
        name = it.get("menu_item_name") or it.get("name") or "Dish"
        qty = it.get("quantity", 1)
        price = float(it.get("unit_price") or 0) * qty
        item_note = f" <i>({it.get('notes')})</i>" if it.get("notes") else ""
        item_lines.append(f"  ▫️ <b>{name}</b> ×{qty} — <code>${price:.2f}</code>{item_note}")
    items_block = "\n".join(item_lines) if item_lines else "  ▫️ Standard Order"

    financials = []
    financials.append(f"• <b>Subtotal:</b> <code>${subtotal:.2f}</code>")
    if delivery_fee > 0:
        financials.append(f"• <b>Delivery Fee:</b> <code>${delivery_fee:.2f}</code>")
    if discount > 0:
        financials.append(f"• <b>Discount:</b> <code>-${discount:.2f}</code>")
    financials.append(f"• <b>TOTAL AMOUNT:</b> <b>${total:.2f} USD</b>")
    financials_block = "\n".join(financials)

    customer_lines = [
        f"• <b>Name:</b> {cust_name}",
        f"• <b>Phone:</b> <code>{phone}</code>"
    ]
    if address:
        customer_lines.append(f"• <b>Address:</b> {address}")
    customer_block = "\n".join(customer_lines)

    msg = f"""<b>🔔 NEW SAVORY ORDER RECEIVED!</b>
━━━━━━━━━━━━━━━━━━━━━
<b>Order Number:</b> <code>#{order_num}</code>
<b>Channel:</b> {type_display}

<b>👤 Customer Information:</b>
{customer_block}

<b>📋 Ordered Items:</b>
{items_block}

<b>💰 Payment Summary:</b>
{financials_block}
• <b>Method:</b> {pay_method}
• <b>Status:</b> <b>{pay_status}</b>
{f'• <b>Special Instructions:</b> <i>{notes}</i>' if notes else ''}

<b>⏰ Order Time:</b> {datetime.now().strftime('%I:%M %p • %b %d, %Y')}
━━━━━━━━━━━━━━━━━━━━━
<i>Savory Food Ordering System</i>"""

    await send_telegram_message(msg)


async def notify_payment_confirmed(
    order_number: str,
    amount: float,
    method: str = "KHQR",
    customer_name: Optional[str] = None
):
    """Send notification when an order payment is successfully confirmed."""
    cfg = get_telegram_config()
    if not cfg.get("enabled", True) or not cfg.get("notify_on_payment", True):
        return

    method_label = "Bakong KHQR (Interbank QR)" if "khqr" in method.lower() else method.upper()

    msg = f"""<b>✅ PAYMENT CONFIRMED!</b>
━━━━━━━━━━━━━━━━━━━━━
<b>Order:</b> <code>#{order_number}</code>
{f'<b>Customer:</b> {customer_name}' if customer_name else ''}
<b>Amount Received:</b> <b>${amount:.2f} USD</b>
<b>Method:</b> {method_label}
<b>Payment Status:</b> <b>PAID & VERIFIED</b>
<b>Kitchen State:</b> Order moved to preparation.

<b>⏰ Confirmed At:</b> {datetime.now().strftime('%I:%M %p • %b %d, %Y')}
━━━━━━━━━━━━━━━━━━━━━
<i>Savory Food Ordering System</i>"""

    await send_telegram_message(msg)


async def notify_order_status_update(
    order_number: str,
    new_status: str,
    customer_name: Optional[str] = None,
    notes: Optional[str] = None
):
    """Notify when kitchen or staff updates order state."""
    cfg = get_telegram_config()
    if not cfg.get("enabled", True) or not cfg.get("notify_on_status_change", True):
        return

    status_emojis = {
        "pending": "⏳ PENDING (Awaiting Confirmation)",
        "confirmed": "✅ CONFIRMED (Accepted by Kitchen)",
        "preparing": "🍳 PREPARING (Cooking in Kitchen)",
        "ready": "🛎️ READY (Ready for Pickup / Dispatch)",
        "out_for_delivery": "🛵 OUT FOR DELIVERY (Rider on the Way)",
        "delivered": "🎉 DELIVERED (Successfully Handed to Customer)",
        "completed": "🏁 COMPLETED (Finished)",
        "cancelled": "❌ CANCELLED (Order Voided)"
    }
    status_label = status_emojis.get(new_status.lower(), new_status.upper())

    msg = f"""<b>📢 ORDER STATUS UPDATED</b>
━━━━━━━━━━━━━━━━━━━━━
<b>Order:</b> <code>#{order_number}</code>
{f'<b>Customer:</b> {customer_name}' if customer_name else ''}
<b>New Status:</b> <b>{status_label}</b>
{f'<b>Notes:</b> <i>{notes}</i>' if notes else ''}

<b>⏰ Updated At:</b> {datetime.now().strftime('%I:%M %p • %b %d, %Y')}
━━━━━━━━━━━━━━━━━━━━━
<i>Savory Food Ordering System</i>"""

    await send_telegram_message(msg)


async def notify_low_stock(dish_name: str, current_stock: int, threshold: int):
    """Notify when inventory drops to or below threshold."""
    cfg = get_telegram_config()
    if not cfg.get("enabled", True) or not cfg.get("notify_on_low_stock", True):
        return

    msg = f"""<b>⚠️ INVENTORY LOW STOCK ALERT!</b>
━━━━━━━━━━━━━━━━━━━━━
<b>Dish / Item:</b> <b>{dish_name}</b>
<b>Remaining Portions:</b> <code>{current_stock}</code>
<b>Low Stock Alert Level:</b> <code>≤ {threshold}</code>

🚨 <b>Action Required:</b> Stock is running low. Please replenish or update menu availability.
<b>⏰ Alert Time:</b> {datetime.now().strftime('%I:%M %p • %b %d, %Y')}
━━━━━━━━━━━━━━━━━━━━━
<i>Savory Food Ordering System</i>"""

    await send_telegram_message(msg)


async def test_telegram_connection(
    bot_token: Optional[str] = None,
    chat_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    Test the connection with Telegram API:
    1. Validates the Bot Token via getMe
    2. Sends a test message to the specified chat_id
    """
    cfg = get_telegram_config()
    token = (bot_token or cfg.get("bot_token") or "").strip()
    cid = (chat_id or cfg.get("chat_id") or "").strip()
    configured_user = cfg.get("bot_username") or "@savoryfood_bot"

    if not token or "your-" in token.lower():
        return {
            "success": False,
            "message": "Bot token is missing or placeholder. Please paste your Telegram Bot Token from @BotFather.",
            "bot_username": configured_user
        }

    if not cid or "your-" in cid.lower():
        return {
            "success": False,
            "message": "Chat ID is missing or placeholder. Please provide your Telegram Chat ID or Group ID.",
            "bot_username": configured_user
        }

    async with httpx.AsyncClient(timeout=10.0) as client:
        # Step 1: Validate Bot Token via getMe
        actual_bot_user = configured_user
        try:
            me_res = await client.get(f"https://api.telegram.org/bot{token}/getMe")
            if me_res.status_code != 200:
                err_detail = me_res.json().get("description", me_res.text)
                return {
                    "success": False,
                    "message": f"Telegram Bot Token error (HTTP {me_res.status_code}): {err_detail}",
                    "bot_username": configured_user
                }
            bot_data = me_res.json().get("result", {})
            actual_bot_user = f"@{bot_data.get('username')}" if bot_data.get("username") else configured_user
        except Exception as e:
            return {
                "success": False,
                "message": f"Could not connect to Telegram API servers: {str(e)}",
                "bot_username": configured_user
            }

        # Step 2: Send Test Message
        test_msg = f"""<b>🤖 SAVORY RESTAURANT BOT TEST</b>
━━━━━━━━━━━━━━━━━━━━━
✅ <b>Bot Connection Successful!</b>
• <b>Bot:</b> {actual_bot_user}
• <b>Chat ID:</b> <code>{cid}</code>
• <b>Status:</b> Ready to deliver real-time notifications

🔔 <b>Active Alerts Configured:</b>
• 🍽️ New Orders (Dine-in, Takeaway, Delivery)
• 💳 Payments Confirmed (Bakong KHQR & Cash)
• 👨‍🍳 Kitchen Order Status Transitions
• ⚠️ Low Stock Inventory Warnings

<b>⏰ Tested At:</b> {datetime.now().strftime('%I:%M %p • %b %d, %Y')}
━━━━━━━━━━━━━━━━━━━━━
<i>Savory Food Ordering System</i>"""

        try:
            send_res = await client.post(
                f"https://api.telegram.org/bot{token}/sendMessage",
                json={
                    "chat_id": cid,
                    "text": test_msg,
                    "parse_mode": "HTML",
                    "disable_web_page_preview": True
                }
            )
            if send_res.status_code == 200:
                return {
                    "success": True,
                    "message": f"Test notification sent successfully to chat {cid} via {actual_bot_user}!",
                    "bot_username": actual_bot_user
                }
            else:
                err_detail = send_res.json().get("description", send_res.text)
                return {
                    "success": False,
                    "message": f"Telegram rejected message to Chat ID '{cid}': {err_detail}. Make sure you have clicked 'Start' in {actual_bot_user} or added the bot to your group.",
                    "bot_username": actual_bot_user
                }
        except Exception as e:
            return {
                "success": False,
                "message": f"Failed delivering test message: {str(e)}",
                "bot_username": actual_bot_user
            }


async def send_order_receipt(
    order_data: Dict[str, Any],
    items: List[Dict[str, Any]],
    target_chat_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    Format and send an official digital receipt via Telegram to either:
    1. A specific customer's Telegram chat_id (e.g., from Telegram Mini App)
    2. The restaurant's configured Telegram notification channel
    """
    cfg = get_telegram_config()
    token = cfg.get("bot_token")
    cid = (target_chat_id or order_data.get("telegram_chat_id") or cfg.get("chat_id") or "").strip()

    if not token or not cid:
        return {
            "success": False,
            "message": "Missing Telegram bot credentials or destination Chat ID."
        }

    order_num = order_data.get("order_number", "SV-ORDER")
    cust_name = order_data.get("customer_name", "Valued Guest")
    phone = order_data.get("phone", "N/A")
    raw_type = (order_data.get("order_type") or "delivery").lower()
    table_num = order_data.get("table_number")
    subtotal = float(order_data.get("subtotal") or 0)
    delivery_fee = float(order_data.get("delivery_fee") or 0)
    discount = float(order_data.get("discount") or 0)
    total = float(order_data.get("total") or 0)
    pay_method = (order_data.get("payment_method") or "cash").upper()
    pay_status = (order_data.get("payment_status") or "unpaid").upper()
    address = order_data.get("address")
    created_at = order_data.get("created_at") or datetime.now().isoformat()
    try:
        dt = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
        date_str = dt.strftime("%b %d, %Y • %I:%M %p")
    except Exception:
        date_str = datetime.now().strftime("%b %d, %Y • %I:%M %p")

    # Order Type Label
    if table_num or raw_type == "dine_in":
        fulfillment_str = f"🍽️ Dine-in (Table #{table_num or 'N/A'})"
    elif raw_type == "pickup":
        fulfillment_str = "🛍️ Takeaway / Pickup at Counter"
    else:
        fulfillment_str = f"🛵 Delivery to {address or 'Specified Address'}"

    # Items block
    item_rows = []
    for idx, it in enumerate(items, 1):
        name = it.get("menu_item_name") or it.get("name") or "Dish"
        qty = it.get("quantity", 1)
        price = float(it.get("unit_price") or 0) * qty
        note = f" <i>[{it.get('notes')}]</i>" if it.get("notes") else ""
        item_rows.append(f"{idx}. <b>{name}</b> ×{qty} <code>${price:.2f}</code>{note}")
    items_text = "\n".join(item_rows) if item_rows else "Standard Items"

    # Payment badge
    pay_badge = "✅ PAID" if pay_status == "PAID" else f"⏳ {pay_status}"
    method_name = "Bakong NBC KHQR" if "khqr" in pay_method.lower() else pay_method

    receipt_text = f"""🧾 <b>SAVORY RESTAURANT — OFFICIAL RECEIPT</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━
<b>Receipt Ref:</b> <code>REC-{order_num}</code>
<b>Date & Time:</b> {date_str}
<b>Fulfillment:</b> {fulfillment_str}

<b>👤 Customer:</b> {cust_name}
<b>📞 Contact:</b> <code>{phone}</code>

──────────────────────────
<b>ORDER ITEMS:</b>
{items_text}
──────────────────────────
• <b>Subtotal:</b> <code>${subtotal:.2f}</code>
{f'• <b>Delivery Fee:</b> <code>${delivery_fee:.2f}</code>' if delivery_fee > 0 else ''}
{f'• <b>Discount Promo:</b> <code>-${discount:.2f}</code>' if discount > 0 else ''}
━━━━━━━━━━━━━━━━━━━━━━━━━━
<b>💰 TOTAL AMOUNT:</b> <b>${total:.2f} USD</b>
<b>Payment Method:</b> {method_name}
<b>Payment Status:</b> <b>{pay_badge}</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━
<i>Thank you for dining with Savory! Please present this receipt for verification or counter pickup.</i>"""

    # Add inline buttons (Telegram rejects localhost URLs, so use valid callback_data & bot links)
    reply_markup = {
        "inline_keyboard": [
            [
                {"text": "🛵 Check Live Status", "callback_data": "cmd_track_order"},
                {"text": "🍽️ Savory Restaurant", "url": "https://t.me/SavoryFoodAEU_bot"}
            ]
        ]
    }

    success = await send_telegram_message(
        text=receipt_text,
        bot_token=token,
        chat_id=cid,
        reply_markup=reply_markup,
        force=True
    )

    if success:
        return {"success": True, "message": f"Receipt sent successfully to Telegram ({cid})!"}
    else:
        return {"success": False, "message": "Failed sending receipt to Telegram. Check bot configuration."}

