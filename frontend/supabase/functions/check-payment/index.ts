/**
 * check-payment Edge Function
 *
 * Polls the Bakong KHQR API to verify whether a transaction has been paid.
 * Called by the frontend every ~5 seconds while the customer is on the
 * payment screen.
 *
 * Request:  POST { order_id, md5 }
 * Response: { paid: boolean, order_status: string, payment_status: string }
 */
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface CheckPaymentRequest {
  order_id: string;
  md5?: string | null;
}

// Bakong transaction status codes
// responseCode 0 → success/found,  others → not yet / failed
async function checkBakongMd5(md5: string, token: string, baseUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/v1/check_transaction_by_md5`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({ md5 }),
    });

    if (!res.ok) return false;

    const json = await res.json();
    // responseCode 0 = transaction found and successful
    return json?.responseCode === 0 && !!json?.data;
  } catch (err) {
    console.error("Bakong check_transaction_by_md5 failed:", err);
    return false;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as CheckPaymentRequest;

    if (!body.order_id) {
      return new Response(JSON.stringify({ error: "order_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Fetch the order + payment record
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("id, status, payment_status, payment_method, order_number")
      .eq("id", body.order_id)
      .single();

    if (orderErr || !order) {
      return new Response(JSON.stringify({ error: "Order not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Already paid — return immediately without calling Bakong
    if (order.payment_status === "paid") {
      return new Response(
        JSON.stringify({
          paid: true,
          order_status:   order.status,
          payment_status: order.payment_status,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // If not KHQR or no MD5, just return current state
    if (order.payment_method !== "khqr" || !body.md5) {
      return new Response(
        JSON.stringify({
          paid:           false,
          order_status:   order.status,
          payment_status: order.payment_status,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Poll Bakong
    const KHQR_BASE_URL = Deno.env.get("KHQR_BASE_URL") ?? "https://api-bakong.nbc.gov.kh";
    const KHQR_TOKEN    = Deno.env.get("KHQR_TOKEN") ?? "";

    const isPaid = KHQR_TOKEN
      ? await checkBakongMd5(body.md5, KHQR_TOKEN, KHQR_BASE_URL)
      : false;

    if (isPaid) {
      // Mark payment as paid in DB
      await supabase
        .from("payments")
        .update({ status: "paid", paid_at: new Date().toISOString() })
        .eq("order_id", body.order_id);

      // Update order: payment_status → paid, status → confirmed
      await supabase
        .from("orders")
        .update({
          payment_status: "paid",
          status: "confirmed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", body.order_id);

      // Log status change
      await supabase.from("order_status_history").insert({
        order_id:   body.order_id,
        status:     "confirmed",
        notes:      "Payment confirmed via Bakong KHQR",
        created_by: null,
      }).catch(() => {/* non-critical */});

      // Notify restaurant of payment confirmation
      const botToken = Deno.env.get("NOTIFICATION_BOT_TOKEN");
      const chatId   = Deno.env.get("NOTIFICATION_CHAT_ID");
      if (botToken && chatId) {
        fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: `✅ *PAYMENT CONFIRMED*\nOrder *#${order.order_number}* has been paid via KHQR.\nStatus updated to: *CONFIRMED*`,
            parse_mode: "Markdown",
          }),
        }).catch(() => {/* non-critical */});
      }

      return new Response(
        JSON.stringify({
          paid:           true,
          order_status:   "confirmed",
          payment_status: "paid",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Not paid yet
    return new Response(
      JSON.stringify({
        paid:           false,
        order_status:   order.status,
        payment_status: order.payment_status,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("check-payment error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
