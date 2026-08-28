import { NextRequest, NextResponse } from "next/server";
import { createPaymentMandate, requestCheckout } from "@/lib/server";
import { db } from "@/lib/db";
import { publish } from "@/lib/events/bus";
import { priceCartWithCampaigns, recordCampaignApplications } from "@/lib/campaigns/apply";

export const dynamic = "force-dynamic";

/**
 * POST /api/checkout
 *   { payment_mandate_id }  — gate an already-signed PAYMENT mandate, or
 *   { cart_mandate_id }     — shorthand: price with active campaigns, sign
 *                             the PAYMENT mandate (merchant), run the gate.
 *   { conversational? }     — if true, return order details for in-app modal
 *                             instead of a hosted checkout URL.
 *
 * allow → real test-mode order + payment link issued
 * gate  → parked in the human approval queue (shopkeeper bell)   [202]
 * deny  → structured refusal with named rule hits                [403]
 */
export async function POST(req: NextRequest) {
  let body: { payment_mandate_id?: string; cart_mandate_id?: string; conversational?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  if (!body.payment_mandate_id && !body.cart_mandate_id) {
    return NextResponse.json({ error: "payment_mandate_id or cart_mandate_id required" }, { status: 400 });
  }

  try {
    const paymentMandateId =
      body.payment_mandate_id ?? (await createPaymentMandateFor(body.cart_mandate_id!));
    if (!paymentMandateId) {
      return NextResponse.json({ error: "unknown cart_mandate_id" }, { status: 404 });
    }

    const result = await requestCheckout(paymentMandateId, req.nextUrl.origin);

    // A discount only becomes real when the checkout actually issues.
    if (result.status === "issued") {
      await recordIssuedDiscounts(paymentMandateId);
    }

    // Conversational mode: return full order details for in-app modal
    if (body.conversational && result.status === "issued" && result.payment_row_id) {
      const payRes = await db().execute({
        sql: "SELECT rzp_order_id, amount_paise FROM payments WHERE id = ?",
        args: [result.payment_row_id],
      });
      const rzpOrderId = String(payRes.rows[0]?.rzp_order_id ?? "");
      const amountPaise = Number(payRes.rows[0]?.amount_paise ?? result.amount_paise);

      // Cart items (full list price) + the discount the mandate already baked in.
      const cartMandateId = body.cart_mandate_id ?? (await getCartMandateId(paymentMandateId));
      const pricing = cartMandateId ? await priceCartWithCampaigns(cartMandateId) : null;
      const cartItems = pricing?.items ?? [];

      const sessionRes = await db().execute({
        sql: "SELECT session_id FROM mandates WHERE id = ?",
        args: [paymentMandateId],
      });
      const sessionId = String(sessionRes.rows[0]?.session_id ?? "");

      await publish({
        type: "payment.checkout_conversational",
        session_id: sessionId,
        payload: {
          payment_row_id: result.payment_row_id,
          rzp_order_id: rzpOrderId,
          amount_paise: amountPaise,
          discount_paise: pricing && pricing.discount_paise > 0 ? pricing.discount_paise : undefined,
          cart_items: cartItems,
          agent_message: generateAgentMessage(cartItems, amountPaise),
          mandate_id: paymentMandateId,
        },
      });

      return NextResponse.json({
        ...result,
        payment_mandate_id: paymentMandateId,
        rzp_order_id: rzpOrderId,
        cart_items: cartItems,
      });
    }

    const status = result.status === "issued" ? 200 : result.status === "needs_approval" ? 202 : 403;
    return NextResponse.json({ ...result, payment_mandate_id: paymentMandateId }, { status });
  } catch (e) {
    const detail =
      e instanceof Error ? `${e.name}: ${e.message}` : JSON.stringify(e); // razorpay SDK throws plain objects
    console.error("[checkout] failed:", detail);
    return NextResponse.json({ error: "checkout failed", detail }, { status: 500 });
  }
}

/**
 * Record campaign applications for an ISSUED payment mandate that carries a
 * discount. Mandates created elsewhere without campaigns are left untouched.
 */
async function recordIssuedDiscounts(paymentMandateId: string): Promise<void> {
  try {
    const res = await db().execute({
      sql: "SELECT session_id, payload_json FROM mandates WHERE id = ?",
      args: [paymentMandateId],
    });
    const row = res.rows[0];
    if (!row) return;
    const payload = JSON.parse(String(row.payload_json)) as {
      cart_mandate_id: string; discount_paise?: number;
    };
    if (!payload.cart_mandate_id || !payload.discount_paise) return;

    const pricing = await priceCartWithCampaigns(payload.cart_mandate_id);
    await recordCampaignApplications(String(row.session_id), payload.cart_mandate_id, pricing);
  } catch {
    // Recording a discount must never fail the checkout itself.
  }
}

async function getCartMandateId(paymentMandateId: string): Promise<string | null> {
  const res = await db().execute({
    sql: "SELECT payload_json FROM mandates WHERE id = ?",
    args: [paymentMandateId],
  });
  try {
    const payload = JSON.parse(String(res.rows[0]?.payload_json ?? "{}"));
    return payload.cart_mandate_id ?? null;
  } catch {
    return null;
  }
}

function generateAgentMessage(items: { title: string; qty: number }[], totalPaise: number) {
  const itemList = items.map((i) => `${i.title}${i.qty > 1 ? ` (×${i.qty})` : ""}`).join(", ");
  return `I would like to purchase ${itemList} from the bazaar. Total: ₹${(totalPaise / 100).toLocaleString("en-IN")}. Please review and confirm.`;
}

async function createPaymentMandateFor(cartMandateId: string): Promise<string | null> {
  try {
    // Session id comes from the cart itself.
    const res = await db().execute({
      sql: "SELECT session_id FROM mandates WHERE id = ? AND type = 'CART'",
      args: [cartMandateId],
    });
    const sessionId = res.rows[0] ? String(res.rows[0].session_id) : null;
    if (!sessionId) return null;

    // Price with every active campaign — the discount goes INTO the signed
    // mandate amount, so the order, the mandate and the ledger agree.
    const pricing = await priceCartWithCampaigns(cartMandateId);
    const m = await createPaymentMandate(
      sessionId,
      cartMandateId,
      pricing.discount_paise > 0
        ? {
            discount_paise: pricing.discount_paise,
            original_total_paise: pricing.original_total_paise,
            campaigns: pricing.applicable.map((a) => ({
              campaign_id: a.campaign_id,
              campaign_name: a.campaign_name,
              kind: a.kind,
              discount_paise: a.discount_paise,
            })),
          }
        : undefined
    );
    return m.id;
  } catch (e) {
    const detail = e instanceof Error ? `${e.name}: ${e.message}` : JSON.stringify(e);
    console.error("[checkout] payment-mandate creation failed:", detail);
    return null;
  }
}
