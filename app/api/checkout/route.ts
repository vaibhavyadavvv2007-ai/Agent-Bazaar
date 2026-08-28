import { NextRequest, NextResponse } from "next/server";
import { createPaymentMandate, requestCheckout } from "@/lib/server";
import { db } from "@/lib/db";
import { publish } from "@/lib/events/bus";

export const dynamic = "force-dynamic";

/**
 * POST /api/checkout
 *   { payment_mandate_id }  — gate an already-signed PAYMENT mandate, or
 *   { cart_mandate_id }     — shorthand: sign the PAYMENT mandate (merchant)
 *                             then run the gate.
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
    body = (await req.json()) as typeof body;
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

    // Conversational mode: return full order details for in-app modal
    if (body.conversational && result.status === "issued" && result.payment_row_id) {
      const payRes = await db().execute({
        sql: "SELECT rzp_order_id, amount_paise FROM payments WHERE id = ?",
        args: [result.payment_row_id],
      });
      const rzpOrderId = String(payRes.rows[0]?.rzp_order_id ?? "");
      const amountPaise = Number(payRes.rows[0]?.amount_paise ?? 0);

      // Get cart items from the mandate chain
      const cartMandateId = body.cart_mandate_id ?? await getCartMandateId(paymentMandateId);
      const cartItems = cartMandateId ? await getCartItems(cartMandateId) : [];
      const totalPaise = cartItems.reduce((s, i) => s + i.line_total_paise, 0);

      // Get session for the event
      const sessionRes = await db().execute({
        sql: "SELECT session_id FROM mandates WHERE id = ?",
        args: [paymentMandateId],
      });
      const sessionId = String(sessionRes.rows[0]?.session_id ?? "");

      // Emit conversational checkout event
      await publish({
        type: "payment.checkout_conversational",
        session_id: sessionId,
        payload: {
          payment_row_id: result.payment_row_id,
          rzp_order_id: rzpOrderId,
          amount_paise: totalPaise || amountPaise,
          cart_items: cartItems,
          agent_message: generateAgentMessage(cartItems, totalPaise || amountPaise),
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
      e instanceof Error
        ? `${e.name}: ${e.message}`
        : JSON.stringify(e); // razorpay SDK throws plain objects
    console.error("[checkout] failed:", detail);
    return NextResponse.json({ error: "checkout failed", detail }, { status: 500 });
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

async function getCartItems(cartMandateId: string) {
  const cartRes = await db().execute({
    sql: "SELECT payload_json FROM mandates WHERE id = ?",
    args: [cartMandateId],
  });
  try {
    const cartPayload = JSON.parse(String(cartRes.rows[0]?.payload_json ?? "{}")) as {
      items: { sku: string; qty: number }[];
    };
    const items = [];
    for (const item of cartPayload.items ?? []) {
      const pRes = await db().execute({
        sql: "SELECT sku, title, price_paise FROM products WHERE sku = ?",
        args: [item.sku],
      });
      const p = pRes.rows[0];
      if (p) {
        items.push({
          sku: String(p.sku),
          title: String(p.title),
          qty: item.qty,
          unit_price_paise: Number(p.price_paise),
          line_total_paise: Number(p.price_paise) * item.qty,
        });
      }
    }
    return items;
  } catch {
    return [];
  }
}

function generateAgentMessage(items: { title: string; qty: number }[], totalPaise: number): string {
  const itemList = items.map((i) => `${i.title}${i.qty > 1 ? ` (×${i.qty})` : ""}`).join(", ");
  return `I would like to purchase ${itemList} from the bazaar. Total: ₹${(totalPaise / 100).toLocaleString("en-IN")}. Please review and confirm.`;
}

async function createPaymentMandateFor(cartMandateId: string): Promise<string | null> {
  try {
    // Session id comes from the cart itself.
    const { db } = await import("@/lib/db");
    const res = await db().execute({
      sql: "SELECT session_id FROM mandates WHERE id = ? AND type = 'CART'",
      args: [cartMandateId],
    });
    const sessionId = res.rows[0] ? String(res.rows[0].session_id) : null;
    if (!sessionId) return null;
    const m = await createPaymentMandate(sessionId, cartMandateId);
    return m.id;
  } catch (e) {
    const detail = e instanceof Error ? `${e.name}: ${e.message}` : JSON.stringify(e);
    console.error("[checkout] payment-mandate creation failed:", detail);
    return null;
  }
}
