import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface OrderItemInput {
  menu_item_id: string;
  quantity: number;
  notes?: string | null;
}

interface CreateOrderRequest {
  customer_id?: string | null;
  customer_name: string;
  phone: string;
  address?: string | null;
  order_type: "delivery" | "pickup" | "dine_in";
  table_number?: number | null;
  notes?: string | null;
  coupon_code?: string | null;
  payment_method?: "cash" | "khqr" | "card";
  items: OrderItemInput[];
  customer_lat?: number | null;
  customer_lng?: number | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// KHQR EMV QR Builder  (pure Deno/TypeScript — no external SDK needed)
// Spec: EMVCo Merchant-Presented Mode + NBC KHQR extension
// ─────────────────────────────────────────────────────────────────────────────
function tlv(tag: string, value: string): string {
  const len = String(value.length).padStart(2, "0");
  return `${tag}${len}${value}`;
}

function crc16(data: string): string {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

interface KHQRConfig {
  bakongAccount: string;   // e.g. sorn_sophiram@bkrt
  merchantName: string;    // e.g. SOPHIRAM SORN
  merchantCity: string;    // e.g. Phnom Penh
  storeLabel: string;      // e.g. Savory
  amountUSD: number;
  currency: "USD" | "KHR";
  usdToKhrRate: number;
  terminalLabel?: string;
}

function buildKHQRString(config: KHQRConfig): string {
  const {
    bakongAccount, merchantName, merchantCity, storeLabel,
    amountUSD, currency, usdToKhrRate,
  } = config;

  const isCurrencyKHR = currency === "KHR";
  const currencyCode = isCurrencyKHR ? "116" : "840"; // ISO 4217
  const amount = isCurrencyKHR
    ? Math.round(amountUSD * usdToKhrRate).toString()
    : amountUSD.toFixed(2);

  // Tag 30: Merchant Account Information (Bakong-specific)
  //   Sub-tag 00: Globally Unique Identifier → "bakong.nbc.gov.kh"
  //   Sub-tag 01: Bakong Account ID
  const guid = "bakong.nbc.gov.kh";
  const accountPayload = tlv("00", guid) + tlv("01", bakongAccount);
  const merchantAccountInfo = tlv("30", accountPayload);

  // Tag 62: Additional Data Field Template
  //   Sub-tag 01: Bill Number (order reference)
  //   Sub-tag 07: Terminal Label
  //   Sub-tag 08: Store Label
  const billNumber   = tlv("01", storeLabel.slice(0, 25));
  const terminalLbl  = tlv("07", (config.terminalLabel ?? "POS001").slice(0, 25));
  const storeLbl     = tlv("08", storeLabel.slice(0, 25));
  const additionalData = tlv("62", billNumber + terminalLbl + storeLbl);

  // Assemble full payload (without CRC value)
  const parts = [
    tlv("00", "01"),               // Payload Format Indicator
    tlv("01", "12"),               // Dynamic QR
    merchantAccountInfo,            // Tag 30 Bakong account
    tlv("52", "5999"),             // Merchant Category Code (restaurants)
    tlv("53", currencyCode),       // Transaction Currency
    tlv("54", amount),             // Transaction Amount
    tlv("58", "KH"),               // Country Code
    tlv("59", merchantName.slice(0, 25).toUpperCase()),  // Merchant Name
    tlv("60", merchantCity.slice(0, 15)),                // Merchant City
    additionalData,                 // Tag 62 Additional Data
    "6304",                         // CRC placeholder (tag + len, no value yet)
  ].join("");

  return parts + crc16(parts);
}

// ─────────────────────────────────────────────────────────────────────────────
// Bakong API: generate deeplink + extract MD5 hash
// ─────────────────────────────────────────────────────────────────────────────
async function generateBakongDeeplink(
  qrString: string,
  token: string,
  baseUrl: string,
): Promise<{ deeplink: string | null; md5: string | null }> {
  try {
    const res = await fetch(`${baseUrl}/v1/generate_deeplink_by_qr`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({
        qr: qrString,
        sourceInfo: {
          appName: "Savory",
          appIconUrl: "https://savory.app/logo.png",
          appDeepLinkCallback: "savory://payment-callback",
        },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("Bakong deeplink error:", res.status, errText);
      return { deeplink: null, md5: null };
    }

    const json = await res.json();
    // Bakong returns: { data: { shortLink: "...", hash: "..." }, responseCode: 0 }
    return {
      deeplink: json?.data?.shortLink ?? null,
      md5: json?.data?.md5 ?? json?.data?.hash ?? null,
    };
  } catch (err) {
    console.error("Bakong deeplink fetch failed:", err);
    return { deeplink: null, md5: null };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Notification Service
// ─────────────────────────────────────────────────────────────────────────────
interface NotificationPayload {
  orderNumber: string;
  customerName: string;
  phone: string;
  orderType: string;
  items: { name: string; quantity: number; unitPrice: number }[];
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
  paymentStatus: string;
  paymentMethod: string;
  address?: string | null;
  tableNumber?: number | null;
  notes?: string | null;
  prepTimeMinutes: number;
}

async function sendOrderNotification(payload: NotificationPayload): Promise<void> {
  const botToken = Deno.env.get("NOTIFICATION_BOT_TOKEN");
  const chatId   = Deno.env.get("NOTIFICATION_CHAT_ID");
  const discord  = Deno.env.get("DISCORD_WEBHOOK_URL");

  const itemsText = payload.items
    .map((i) => `  • ${i.name} ×${i.quantity}  ($${(i.unitPrice * i.quantity).toFixed(2)})`)
    .join("\n");

  const lines = [
    "🍽️ *NEW SAVORY ORDER*",
    `*Order:* #${payload.orderNumber}`,
    "",
    `*Customer:* ${payload.customerName}`,
    `*Phone:* ${payload.phone}`,
    `*Order Type:* ${payload.orderType.toUpperCase()}${payload.tableNumber ? ` (Table #${payload.tableNumber})` : ""}`,
    "",
    "*Items:*",
    itemsText,
    "",
    `*Subtotal:* $${payload.subtotal.toFixed(2)}`,
    payload.deliveryFee > 0 ? `*Delivery Fee:* $${payload.deliveryFee.toFixed(2)}` : null,
    payload.discount > 0    ? `*Discount:* -$${payload.discount.toFixed(2)}`         : null,
    `*TOTAL:* $${payload.total.toFixed(2)}`,
    `*Payment:* ${payload.paymentStatus.toUpperCase()} (${payload.paymentMethod.toUpperCase()})`,
    payload.address    ? `*Delivery Address:* ${payload.address}`  : null,
    payload.notes      ? `*Special Notes:* ${payload.notes}`       : null,
    `*Est. Prep Time:* ${payload.prepTimeMinutes} mins`,
    `*Time:* ${new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`,
  ].filter(Boolean).join("\n");

  if (botToken && chatId) {
    try {
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: lines, parse_mode: "Markdown" }),
      });
    } catch (err) {
      console.error("Telegram notification failed:", err);
    }
  }

  if (discord) {
    try {
      await fetch(discord, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: lines.replace(/\*/g, "**") }),
      });
    } catch (err) {
      console.error("Discord notification failed:", err);
    }
  }

  console.log("--- ORDER NOTIFICATION ---\n" + lines);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Edge Function Handler
// ─────────────────────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as CreateOrderRequest;

    // ── Validate input ───────────────────────────────────────────────────────
    if (!body.customer_name?.trim()) {
      return new Response(JSON.stringify({ error: "Customer name is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!body.phone?.trim()) {
      return new Response(JSON.stringify({ error: "Phone number is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const orderType = body.order_type || "delivery";
    if (!["delivery", "pickup", "dine_in"].includes(orderType)) {
      return new Response(JSON.stringify({ error: "Invalid order type" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (orderType === "delivery" && !body.address?.trim()) {
      return new Response(JSON.stringify({ error: "Delivery address is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!Array.isArray(body.items) || body.items.length === 0) {
      return new Response(JSON.stringify({ error: "At least one item is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    for (const item of body.items) {
      if (!item.menu_item_id || typeof item.quantity !== "number" || item.quantity < 1 || item.quantity > 99) {
        return new Response(JSON.stringify({ error: "Invalid item or quantity (1–99)" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ── Supabase service client ──────────────────────────────────────────────
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ── Fetch menu items (authoritative prices) ──────────────────────────────
    const menuItemIds = body.items.map((i) => i.menu_item_id);
    const { data: menuItems, error: menuError } = await supabase
      .from("menu_items")
      .select("id, name, price, is_available, preparation_time")
      .in("id", menuItemIds);

    if (menuError || !menuItems) {
      return new Response(JSON.stringify({ error: "Failed to fetch menu items" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const menuMap = new Map(menuItems.map((m) => [m.id, m]));

    // ── Calculate subtotal (never trust frontend prices) ─────────────────────
    let subtotal = 0;
    let maxPrepTime = 0;
    const orderItemsToInsert: {
      menu_item_id: string;
      quantity: number;
      unit_price: number;
      notes: string | null;
      menu_item_name: string;
    }[] = [];

    for (const item of body.items) {
      const menuItem = menuMap.get(item.menu_item_id);
      if (!menuItem) {
        return new Response(JSON.stringify({ error: `Invalid item ID: ${item.menu_item_id}` }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!menuItem.is_available) {
        return new Response(JSON.stringify({ error: `"${menuItem.name}" is currently unavailable` }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const unitPrice = Number(menuItem.price);
      subtotal += unitPrice * item.quantity;
      maxPrepTime = Math.max(maxPrepTime, menuItem.preparation_time ?? 20);
      orderItemsToInsert.push({
        menu_item_id: item.menu_item_id,
        quantity: item.quantity,
        unit_price: unitPrice,
        notes: item.notes?.trim() || null,
        menu_item_name: menuItem.name,
      });
    }

    subtotal = Math.round(subtotal * 100) / 100;

    // ── Fetch restaurant settings ────────────────────────────────────────────
    let deliveryFee = 0;
    let defaultPrepTime = 20;
    try {
      const { data: settings } = await supabase
        .from("restaurant_settings")
        .select("delivery_fee, default_prep_time, tax_rate")
        .limit(1)
        .maybeSingle();
      if (settings) {
        if (orderType === "delivery") deliveryFee = Number(settings.delivery_fee ?? 2.5);
        defaultPrepTime = settings.default_prep_time ?? 20;
      }
    } catch {
      if (orderType === "delivery") deliveryFee = 2.5;
    }

    const prepTimeMinutes = Math.max(maxPrepTime, defaultPrepTime);

    // ── Validate coupon server-side ──────────────────────────────────────────
    let discount = 0;
    let couponId: string | null = null;
    let validatedCouponCode: string | null = null;

    if (body.coupon_code?.trim()) {
      const { data: coupon } = await supabase
        .from("coupons")
        .select("*")
        .ilike("code", body.coupon_code.trim())
        .eq("is_active", true)
        .maybeSingle();

      if (coupon) {
        const now = new Date();
        const starts = coupon.start_date ? new Date(coupon.start_date) : null;
        const ends   = coupon.end_date   ? new Date(coupon.end_date)   : null;
        const validDate = (!starts || now >= starts) && (!ends || now <= ends);
        const meetsMin  = subtotal >= Number(coupon.min_order_amount || 0);
        const hasQuota  = coupon.max_usage == null || coupon.current_usage < coupon.max_usage;

        if (validDate && meetsMin && hasQuota) {
          couponId = coupon.id;
          validatedCouponCode = coupon.code;
          discount = coupon.discount_type === "percentage"
            ? (subtotal * Number(coupon.discount_value)) / 100
            : Number(coupon.discount_value);
          discount = Math.min(discount, subtotal);
          discount = Math.round(discount * 100) / 100;
        }
      }
    }

    // ── Final total ──────────────────────────────────────────────────────────
    const finalTotal = Math.max(0, Math.round((subtotal + deliveryFee - discount) * 100) / 100);
    const paymentMethod  = body.payment_method || "cash";
    const paymentStatus  = paymentMethod === "cash" ? "unpaid" : "pending";

    // Order number (fallback — DB trigger generates the official one)
    const dateStr      = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const orderNumber  = `SV-${dateStr}-${randomSuffix}`;

    // ── Insert order ─────────────────────────────────────────────────────────
    const orderPayload: Record<string, unknown> = {
      customer_id:        body.customer_id || null,
      customer_name:      body.customer_name.trim(),
      phone:              body.phone.trim(),
      address:            orderType === "delivery" ? body.address!.trim() : null,
      order_type:         orderType,
      table_number:       body.table_number || null,
      notes:              body.notes?.trim() || null,
      subtotal,
      delivery_fee:       deliveryFee,
      discount,
      total:              finalTotal,
      status:             "pending",
      payment_status:     paymentStatus,
      payment_method:     paymentMethod,
      order_number:       orderNumber,
      estimated_prep_time: prepTimeMinutes,
      customer_lat:       body.customer_lat ?? null,
      customer_lng:       body.customer_lng ?? null,
    };

    if (couponId)              orderPayload.coupon_id   = couponId;
    if (validatedCouponCode)   orderPayload.coupon_code = validatedCouponCode;

    let { data: order, error: orderError } = await supabase
      .from("orders")
      .insert(orderPayload)
      .select()
      .single();

    // Auto-fallback if DB constraint on order_type is outdated
    if (orderError && (orderError.message.includes("orders_order_type_check") || orderError.message.includes("order_type"))) {
      console.warn("orders_order_type_check violation in Supabase, retrying insert with order_type omitted...");
      const { order_type, ...fallbackPayload } = orderPayload;
      const retryResult = await supabase
        .from("orders")
        .insert(fallbackPayload)
        .select()
        .single();
      order = retryResult.data;
      orderError = retryResult.error;
    }

    if (orderError || !order) {
      console.error("Order insert failed:", orderError);
      return new Response(JSON.stringify({ error: "Failed to create order: " + (orderError?.message ?? "") }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Insert order items ───────────────────────────────────────────────────
    const { error: itemsError } = await supabase.from("order_items").insert(
      orderItemsToInsert.map((item) => ({
        order_id:     order.id,
        menu_item_id: item.menu_item_id,
        quantity:     item.quantity,
        unit_price:   item.unit_price,
        notes:        item.notes,
      })),
    );

    if (itemsError) {
      await supabase.from("orders").delete().eq("id", order.id);
      return new Response(JSON.stringify({ error: "Failed to create order items" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── KHQR Payment — Generate real EMV QR + Bakong deeplink ────────────────
    let qrString:  string | null = null;
    let deeplink:  string | null = null;
    let md5Hash:   string | null = null;

    if (paymentMethod === "khqr") {
      const KHQR_BASE_URL   = Deno.env.get("KHQR_BASE_URL")   ?? "https://api-bakong.nbc.gov.kh";
      const KHQR_TOKEN      = Deno.env.get("KHQR_TOKEN")       ?? "";
      const KHQR_ACCOUNT    = Deno.env.get("KHQR_ACCOUNT")     ?? "sorn_sophiram@bkrt";
      const KHQR_MERCHANT   = Deno.env.get("KHQR_MERCHANT_NAME") ?? "SOPHIRAM SORN";
      const STORE_LABEL     = Deno.env.get("BAKONG_STORE_LABEL")  ?? "Savory";
      const usdToKhrRate    = Number(Deno.env.get("KHQR_USD_TO_KHR_RATE") ?? "4100");

      // Build the real EMV-compliant QR string
      qrString = buildKHQRString({
        bakongAccount: KHQR_ACCOUNT,
        merchantName:  KHQR_MERCHANT,
        merchantCity:  "Phnom Penh",
        storeLabel:    STORE_LABEL,
        amountUSD:     finalTotal,
        currency:      "USD",   // USD payment
        usdToKhrRate,
        terminalLabel: order.order_number ?? orderNumber,
      });

      console.log("Generated KHQR string:", qrString);

      // Call Bakong API to get a deeplink + MD5 for polling
      if (KHQR_TOKEN) {
        const result = await generateBakongDeeplink(qrString, KHQR_TOKEN, KHQR_BASE_URL);
        deeplink = result.deeplink;
        md5Hash  = result.md5;
      }
    }

    // ── Insert payment record ────────────────────────────────────────────────
    try {
      await supabase.from("payments").insert({
        order_id:              order.id,
        user_id:               body.customer_id || null,
        payment_method:        paymentMethod,
        amount:                finalTotal,
        currency:              "USD",
        status:                paymentStatus,
        transaction_reference: `TXN-${order.id.slice(0, 8).toUpperCase()}`,
        provider:              paymentMethod === "khqr" ? "bakong_khqr" : "cash_counter",
        provider_transaction_id: md5Hash ?? null,
        qr_data:               qrString,
      });
    } catch (payErr) {
      console.warn("Payment record insert bypassed:", payErr);
    }

    // ── Increment coupon usage ───────────────────────────────────────────────
    if (couponId) {
      try {
        await supabase.rpc("increment_coupon_usage", { c_id: couponId });
      } catch {
        try {
          const { data: c } = await supabase.from("coupons").select("current_usage").eq("id", couponId).single();
          if (c) await supabase.from("coupons").update({ current_usage: (c.current_usage || 0) + 1 }).eq("id", couponId);
        } catch { /* ignore */ }
      }
    }

    // ── Notify restaurant (non-blocking) ────────────────────────────────────
    sendOrderNotification({
      orderNumber:  order.order_number ?? orderNumber,
      customerName: body.customer_name.trim(),
      phone:        body.phone.trim(),
      orderType,
      items: orderItemsToInsert.map((i) => ({ name: i.menu_item_name, quantity: i.quantity, unitPrice: i.unit_price })),
      subtotal,
      deliveryFee,
      discount,
      total:        finalTotal,
      paymentStatus,
      paymentMethod,
      address:      order.address,
      tableNumber:  body.table_number,
      notes:        body.notes,
      prepTimeMinutes,
    }).catch((e) => console.error("Notification failed (non-critical):", e));

    // ── Response ─────────────────────────────────────────────────────────────
    return new Response(
      JSON.stringify({
        success:        true,
        order_id:       order.id,
        order_number:   order.order_number ?? orderNumber,
        subtotal,
        delivery_fee:   deliveryFee,
        discount,
        total:          finalTotal,
        status:         "pending",
        payment_status: paymentStatus,
        payment_method: paymentMethod,
        // KHQR fields
        qr_string:      qrString,         // raw EMV string → render as QR on frontend
        deeplink:       deeplink,          // Bakong short link for mobile banking apps
        md5:            md5Hash,           // for polling /check_transaction_by_md5
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("Unhandled error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
